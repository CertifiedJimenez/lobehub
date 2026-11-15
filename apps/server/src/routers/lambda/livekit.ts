import { DEFAULT_SYSTEM_AGENT_CONFIG } from '@lobechat/const';
import { getLivekitConnection } from '@lobechat/env/livekit';
import { conversationConfigSchema } from '@lobechat/livekit-bridge';
import type { UserSystemAgentConfig } from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  requireWorkspaceRoleWhenScoped,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { AiModelModel } from '@/database/models/aiModel';
import { AiProviderModel } from '@/database/models/aiProvider';
import { UserModel } from '@/database/models/user';
import { appEnv } from '@/envs/app';
import { publicProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { parseSystemAgent } from '@/server/globalConfig/parseSystemAgent';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import {
  buildPayloadFromKeyVaults,
  getParamsFromPayload,
  resolveRuntimeProvider,
} from '@/server/modules/ModelRuntime';
import { LivekitService, voiceRoomPrefix } from '@/server/services/livekit';
import { redeemCredentialTicket } from '@/server/services/livekit/credentialTicket';
import { findTTSModelCard } from '@/server/services/tts';

const conversationProcedure = wsCompatProcedure
  .use(serverDatabase)
  .use(requireWorkspaceRoleWhenScoped('member'));
const requireConnection = () => {
  const connection = getLivekitConnection();
  if (!connection)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Conversation transport is not configured on this deployment.',
    });
  return connection;
};

export const livekitRouter = router({
  /** Worker-only credential exchange: a room participant cannot generate this signature. */
  credentials: publicProcedure
    .use(serverDatabase)
    .input(
      z.object({
        ticket: z.string().min(1).max(4096),
        signature: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let reference;
      try {
        reference = redeemCredentialTicket(
          input.ticket,
          input.signature,
          requireConnection().apiSecret,
        );
      } catch {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const provider = await new AiProviderModel(
        ctx.serverDB,
        reference.userId,
        reference.workspaceId,
      ).getAiProviderById(reference.provider, KeyVaultsGateKeeper.getUserKeyVaults);
      const runtimeProvider = resolveRuntimeProvider(
        reference.provider,
        provider?.settings?.sdkType,
      );
      if (!['fishaudio', 'livekit'].includes(runtimeProvider))
        throw new TRPCError({ code: 'FORBIDDEN' });
      const payload = buildPayloadFromKeyVaults(provider?.keyVaults ?? {}, runtimeProvider);
      const options = getParamsFromPayload(reference.provider, payload) as {
        apiKey?: string;
        apiSecret?: string;
        baseURL?: string;
      };
      if (!options.apiKey || (runtimeProvider === 'livekit' && !options.apiSecret))
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Configure the selected speech provider credentials in AI Providers.',
        });
      const model = await new AiModelModel(
        ctx.serverDB,
        reference.userId,
        reference.workspaceId,
      ).findByIdAndProvider(reference.model, reference.provider);
      const card = findTTSModelCard(reference.provider, reference.model);
      const parameters = model?.parameters as {
        sampleRate?: { default?: number };
        speed?: { default?: number };
      } | null;
      return {
        ...options,
        runtimeProvider,
        provider: reference.provider,
        model: reference.model,
        sampleRate: parameters?.sampleRate?.default ?? card?.parameters?.sampleRate?.default,
        speed: parameters?.speed?.default ?? card?.parameters?.speed?.default,
      };
    }),
  createSession: conversationProcedure.mutation(async ({ ctx }) => {
    const connection = requireConnection();
    const settings = await new UserModel(ctx.serverDB, ctx.userId).getUserSettings();
    const selections = settings?.systemAgent as Partial<UserSystemAgentConfig> | undefined;
    const deployment = parseSystemAgent(appEnv.SYSTEM_AGENT);
    const asr = {
      ...DEFAULT_SYSTEM_AGENT_CONFIG.asr,
      ...deployment.asr,
      ...selections?.asr,
    };
    const tts = {
      ...DEFAULT_SYSTEM_AGENT_CONFIG.tts,
      ...deployment.tts,
      ...selections?.tts,
    };
    if (!asr.model || !asr.provider || !tts.model || !tts.provider)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Choose Speech Recognition and Speech Synthesis in Settings → Service Models.',
      });
    const preferences = conversationConfigSchema.parse(
      (settings?.general as { conversation?: unknown } | null)?.conversation ?? {},
    );
    const model = await new AiModelModel(
      ctx.serverDB,
      ctx.userId,
      ctx.workspaceId ?? undefined,
    ).findByIdAndProvider(tts.model, tts.provider);
    const card = findTTSModelCard(tts.provider, tts.model);
    const savedVoice = model?.settings?.ttsVoice?.trim();
    const preferredVoice =
      preferences.tts.provider === tts.provider && preferences.tts.model === tts.model
        ? preferences.voice
        : '';
    const voice = preferredVoice || savedVoice || card?.parameters?.voice?.default || '';
    const provider = await new AiProviderModel(
      ctx.serverDB,
      ctx.userId,
      ctx.workspaceId ?? undefined,
    ).getAiProviderById(tts.provider);
    const directFish =
      resolveRuntimeProvider(tts.provider, provider?.settings?.sdkType) === 'fishaudio';
    const inferenceTTS =
      resolveRuntimeProvider(tts.provider, provider?.settings?.sdkType) === 'livekit';
    const asrProvider = await new AiProviderModel(
      ctx.serverDB,
      ctx.userId,
      ctx.workspaceId ?? undefined,
    ).getAiProviderById(asr.provider);
    const inferenceASR =
      resolveRuntimeProvider(asr.provider, asrProvider?.settings?.sdkType) === 'livekit';
    if (inferenceTTS && !voice)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Choose a voice for the selected LiveKit speech output model.',
      });
    return new LivekitService(ctx.userId, connection, ctx.workspaceId ?? undefined).createSession(
      {
        ...preferences,
        speechBackend: inferenceASR ? 'livekit' : 'lobehub',
        ttsBackend: inferenceTTS ? 'livekit' : 'lobehub',
        inference: {
          ...preferences.inference,
          ...(inferenceASR ? { sttModel: asr.model } : {}),
          ...(inferenceTTS ? { ttsModel: tts.model, voice } : {}),
        },
        tts: { model: tts.model, provider: tts.provider },
        voice,
      },
      directFish || inferenceTTS,
      inferenceASR ? { model: asr.model, provider: asr.provider } : undefined,
    );
  }),
  endSession: conversationProcedure
    .input(z.object({ roomName: z.string().regex(/^lobe-voice-[a-f0-9]{24}-[a-f0-9-]{36}$/) }))
    .mutation(async ({ ctx, input }) => {
      if (!input.roomName.startsWith(voiceRoomPrefix(ctx.userId)))
        throw new TRPCError({ code: 'FORBIDDEN' });
      await new LivekitService(ctx.userId, requireConnection()).endSession(input.roomName);
    }),
});
