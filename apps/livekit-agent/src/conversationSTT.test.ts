// @vitest-environment node
import { inference, initializeLogger } from '@livekit/agents';
import { conversationConfigSchema } from '@lobechat/livekit-bridge';
import { describe, expect, it } from 'vitest';

import type { LobeHubBridge } from './bridge';
import { createConversationSTT } from './conversationSTT';
import { LobeHubSTT } from './speech';

const bridge = {} as LobeHubBridge;
initializeLogger({ pretty: false, level: 'error' });
const config = conversationConfigSchema.parse({
  speechBackend: 'livekit',
  inference: { sttModel: 'deepgram/flux-general-en' },
});

describe('native LiveKit recognizer selection', () => {
  it('uses the selected provider model with exchanged credentials', async () => {
    const stt = createConversationSTT(config, bridge, {
      apiKey: 'project-key',
      apiSecret: 'project-secret',
      provider: 'livekit',
      model: config.inference.sttModel,
    });
    expect(stt).toBeInstanceOf(inference.STT);
    expect(stt.model).toBe('deepgram/flux-general-en');
    await stt.close();
  });

  it('refuses absent or mismatched credentials instead of using the transport project', () => {
    expect(() => createConversationSTT(config, bridge)).toThrow('provider credentials');
    expect(() =>
      createConversationSTT(config, bridge, {
        apiKey: 'key',
        apiSecret: 'secret',
        provider: 'livekit',
        model: 'other-model',
      }),
    ).toThrow('provider credentials');
  });

  it('keeps native provider transcription for the existing Gemini configuration', async () => {
    const stt = createConversationSTT(conversationConfigSchema.parse({}), bridge);
    expect(stt).toBeInstanceOf(LobeHubSTT);
    await stt.close();
  });
});
