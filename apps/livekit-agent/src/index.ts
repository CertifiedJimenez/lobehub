import { fileURLToPath } from 'node:url';

import { cli, defineAgent, ServerOptions, voice } from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import {
  getConversationTTSBackend,
  VOICE_AGENT_NAME,
  voiceJobSchema,
} from '@lobechat/livekit-bridge';
import dotenv from 'dotenv';

import { LobeHubBridge } from './bridge.js';
import { createConversationSTT } from './conversationSTT.js';
import { createConversationTTS } from './conversationTTS.js';
import { fetchConversationCredentials } from './credentials.js';
import { LobeHubReasoning } from './reasoning.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx) => {
    const { participantIdentity, config, credentialTicket, asrCredentialTicket } =
      voiceJobSchema.parse(JSON.parse(ctx.job.metadata));
    const bridge = new LobeHubBridge(ctx.room, participantIdentity);
    const [credentials, asrCredentials] = await Promise.all([
      credentialTicket ? fetchConversationCredentials(credentialTicket) : undefined,
      asrCredentialTicket ? fetchConversationCredentials(asrCredentialTicket) : undefined,
    ]);
    const stt = createConversationSTT(config, bridge, asrCredentials);
    const tts = createConversationTTS(config, bridge, credentials);
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt,
      tts,
      llm: new LobeHubReasoning(bridge),
      // Local providers can take longer than LiveKit's 10-second first-frame limit.
      // Match the bounded speech bridge timeout for provider-backed synthesis.
      ...(getConversationTTSBackend(config) === 'lobehub'
        ? { ttsReadIdleTimeout: 60_000, forwardAudioIdleTimeout: 60_000 }
        : {}),
      // This adapter delegates all reasoning and tools to LobeHub.
      turnHandling: {
        turnDetection: 'vad',
        preemptiveGeneration: { enabled: false },
        endpointing: { minDelay: config.silenceMs },
      },
    });
    const agent = voice.Agent.create({
      instructions: 'Speech transport for the active LobeHub conversation.',
    });
    ctx.addShutdownCallback(async () => {
      bridge.close();
      await session.close();
      await tts.close();
    });
    await ctx.connect();
    await session.start({
      agent,
      room: ctx.room,
      inputOptions: { participantIdentity },
      record: false,
    });
  },
});

cli.runApp(
  new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: VOICE_AGENT_NAME }),
);
