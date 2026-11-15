// @vitest-environment node
import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { issueCredentialTicket } from '@/server/services/livekit/credentialTicket';

import { livekitRouter } from './livekit';

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  model: vi.fn(),
  providerScope: vi.fn(),
  modelScope: vi.fn(),
  serviceScope: vi.fn(),
  provider: vi.fn(),
  createSession: vi.fn(),
  connection: vi.fn(),
  params: vi.fn(),
}));
vi.mock('@/libs/trpc/lambda', async () => {
  const { initTRPC } = await import('@trpc/server');
  const t = initTRPC.create();
  return { router: t.router, authedProcedure: t.procedure, publicProcedure: t.procedure };
});
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { authedProcedure } = await import('@/libs/trpc/lambda');
  return {
    wsCompatProcedure: authedProcedure,
    requireWorkspaceRoleWhenScoped:
      () =>
      ({ next }: any) =>
        next(),
  };
});
vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: ({ next }: any) => next({ ctx: { serverDB: {} } }),
}));
vi.mock('@lobechat/env/livekit', () => ({ getLivekitConnection: mocks.connection }));
vi.mock('@/database/models/user', () => ({
  UserModel: class {
    getUserSettings = mocks.settings;
  },
}));
vi.mock('@/database/models/aiModel', () => ({
  AiModelModel: class {
    constructor(...args: unknown[]) {
      mocks.modelScope(...args);
    }
    findByIdAndProvider = mocks.model;
  },
}));
vi.mock('@/database/models/aiProvider', () => ({
  AiProviderModel: class {
    constructor(...args: unknown[]) {
      mocks.providerScope(...args);
    }
    getAiProviderById = mocks.provider;
  },
}));
vi.mock('@/envs/app', () => ({ appEnv: {} }));
vi.mock('@/server/globalConfig/parseSystemAgent', () => ({ parseSystemAgent: () => ({}) }));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({ KeyVaultsGateKeeper: {} }));
vi.mock('@/server/modules/ModelRuntime', () => ({
  buildPayloadFromKeyVaults: vi.fn(),
  getParamsFromPayload: mocks.params,
  resolveRuntimeProvider: (provider: string, sdkType?: string) => sdkType ?? provider,
}));
vi.mock('@/server/services/tts', () => ({
  findTTSModelCard: () => ({ parameters: { voice: { default: 'card-default' } } }),
}));
vi.mock('@/server/services/livekit', () => ({
  LivekitService: class {
    constructor(...args: unknown[]) {
      mocks.serviceScope(...args);
    }
    createSession = mocks.createSession;
  },
  voiceRoomPrefix: vi.fn(),
}));

const nativeModels = {
  asr: { provider: 'openai', model: 'gpt-4o-mini-transcribe' },
  tts: { provider: 'fishaudio', model: 's2-pro' },
};
const caller = livekitRouter.createCaller({ userId: 'alice' } as never);
beforeEach(() => {
  mocks.connection.mockReturnValue({
    url: 'wss://voice.example',
    apiKey: 'server-key',
    apiSecret: 'server-secret',
  });
  mocks.settings.mockResolvedValue({ systemAgent: nativeModels });
  mocks.model.mockResolvedValue({ settings: { ttsVoice: 'saved-default' } });
  mocks.provider.mockResolvedValue(undefined);
  mocks.createSession.mockImplementation(async (config) => ({ config, token: 'room-token' }));
});
afterEach(() => vi.clearAllMocks());

describe('native Conversation sessions', () => {
  it('uses active workspace scope for speech routing and the minted session', async () => {
    const workspaceCaller = livekitRouter.createCaller({
      userId: 'alice',
      workspaceId: 'workspace-a',
    } as never);
    await workspaceCaller.createSession();
    expect(mocks.modelScope).toHaveBeenCalledWith({}, 'alice', 'workspace-a');
    expect(mocks.providerScope.mock.calls.every((args) => args[2] === 'workspace-a')).toBe(true);
    expect(mocks.serviceScope).toHaveBeenCalledWith('alice', expect.any(Object), 'workspace-a');
  });

  it('redeems the workspace bound to the ticket, ignoring caller scope', async () => {
    const ticket = issueCredentialTicket(
      { userId: 'alice', workspaceId: 'workspace-a', provider: 'livekit', model: 'asr' },
      'server-secret',
    );
    const signature = createHmac('sha256', 'server-secret')
      .update(`lobehub.voice.credentials:${ticket}`)
      .digest('hex');
    mocks.params.mockReturnValue({ apiKey: 'key', apiSecret: 'secret' });
    await caller.credentials({ ticket, signature });
    expect(mocks.providerScope).toHaveBeenCalledWith({}, 'alice', 'workspace-a');
    expect(mocks.modelScope).toHaveBeenCalledWith({}, 'alice', 'workspace-a');
  });

  it('routes a selected LiveKit recognition model without replacing local Fish output', async () => {
    const asr = { provider: 'livekit', model: 'deepgram/flux-general-en' };
    mocks.settings.mockResolvedValue({ systemAgent: { ...nativeModels, asr } });
    const session = await caller.createSession();
    expect(session.config).toMatchObject({
      speechBackend: 'livekit',
      ttsBackend: 'lobehub',
      tts: nativeModels.tts,
      inference: { sttModel: asr.model },
    });
    expect(mocks.createSession.mock.calls[0][2]).toEqual(asr);
  });

  it('routes a selected LiveKit speech output model using the saved model voice', async () => {
    const tts = { provider: 'livekit', model: 'cartesia/sonic-3.6' };
    mocks.settings.mockResolvedValue({ systemAgent: { ...nativeModels, tts } });
    const session = await caller.createSession();
    expect(session.config).toMatchObject({
      speechBackend: 'lobehub',
      ttsBackend: 'livekit',
      tts,
      inference: { ttsModel: tts.model, voice: 'saved-default' },
    });
    expect(mocks.createSession.mock.calls[0][1]).toBe(true);
    expect(mocks.createSession.mock.calls[0][2]).toBeUndefined();
  });

  it('requires signed worker authentication before returning LiveKit provider credentials', async () => {
    const ticket = issueCredentialTicket(
      { userId: 'alice', provider: 'livekit', model: 'deepgram/flux-general-en' },
      'server-secret',
    );
    await expect(caller.credentials({ ticket, signature: '0'.repeat(64) })).rejects.toThrow();
    const signature = createHmac('sha256', 'server-secret')
      .update(`lobehub.voice.credentials:${ticket}`)
      .digest('hex');
    mocks.params.mockReturnValue({ apiKey: 'inference-key', apiSecret: 'inference-secret' });
    const response = await caller.credentials({ ticket, signature });
    expect(response).toMatchObject({
      apiKey: 'inference-key',
      apiSecret: 'inference-secret',
      model: 'deepgram/flux-general-en',
      runtimeProvider: 'livekit',
    });
  });
  it('uses native Service Models and ignores the old opt-in and inference selections', async () => {
    mocks.settings.mockResolvedValue({
      systemAgent: nativeModels,
      general: {
        conversation: {
          enabled: false,
          speechBackend: 'livekit',
          ttsBackend: 'livekit',
          tts: { provider: 'old-provider', model: 'old-model' },
          voice: 'stale-voice',
        },
      },
    });
    const session = await caller.createSession();
    expect(session.config).toMatchObject({
      enabled: true,
      speechBackend: 'lobehub',
      ttsBackend: 'lobehub',
      tts: nativeModels.tts,
      voice: 'saved-default',
    });
    expect(mocks.model).toHaveBeenCalledWith('s2-pro', 'fishaudio');
    expect(mocks.createSession.mock.calls[0][1]).toBe(true);
    expect(JSON.stringify(session)).not.toContain('server-secret');
  });
  it('preserves the explicitly selected voice for the current model', async () => {
    mocks.settings.mockResolvedValue({
      systemAgent: nativeModels,
      general: {
        conversation: {
          tts: nativeModels.tts,
          voice: 'my-cloned-voice',
        },
      },
    });
    expect((await caller.createSession()).config.voice).toBe('my-cloned-voice');
  });
  it('uses the model card voice when the user has no saved default', async () => {
    mocks.model.mockResolvedValue(undefined);
    expect((await caller.createSession()).config.voice).toBe('card-default');
  });
  it('detects custom Fish SDK providers for the streaming path', async () => {
    mocks.settings.mockResolvedValue({
      systemAgent: { ...nativeModels, tts: { provider: 'my-fish', model: 's2-pro' } },
    });
    mocks.provider.mockResolvedValue({ settings: { sdkType: 'fishaudio' } });
    await caller.createSession();
    expect(mocks.createSession.mock.calls[0][1]).toBe(true);
  });
  it.each(['asr', 'tts'] as const)('requires the native %s model', async (key) => {
    mocks.settings.mockResolvedValue({
      systemAgent: { ...nativeModels, [key]: { provider: '', model: '' } },
    });
    await expect(caller.createSession()).rejects.toThrow('Service Models');
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it('requires deployment transport configuration', async () => {
    mocks.connection.mockReturnValue(undefined);
    await expect(caller.createSession()).rejects.toThrow('deployment');
  });
});
