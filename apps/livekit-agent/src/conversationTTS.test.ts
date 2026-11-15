// @vitest-environment node
import { inference, initializeLogger } from '@livekit/agents';
import * as fishaudio from '@livekit/agents-plugin-fishaudio';
import { conversationConfigSchema } from '@lobechat/livekit-bridge';
import { describe, expect, it, vi } from 'vitest';

import type { LobeHubBridge } from './bridge';
import { createConversationTTS } from './conversationTTS';
import { LobeHubTTS } from './speech';

const { fishOptions } = vi.hoisted(() => ({ fishOptions: [] as { baseURL?: string }[] }));
vi.mock('@livekit/agents-plugin-fishaudio', async (importOriginal) => {
  const original = await importOriginal<typeof fishaudio>();
  return {
    ...original,
    TTS: class extends original.TTS {
      constructor(options: ConstructorParameters<typeof original.TTS>[0]) {
        super(options);
        fishOptions.push(options ?? {});
      }
    },
  };
});

const bridge = {} as LobeHubBridge;
initializeLogger({ pretty: false, level: 'error' });

describe('conversation speech routing', () => {
  it('uses LiveKit Inference for a native LiveKit provider selection', async () => {
    const config = conversationConfigSchema.parse({
      ttsBackend: 'livekit',
      tts: { provider: 'livekit', model: 'cartesia/sonic-3.6' },
      inference: { ttsModel: 'cartesia/sonic-3.6' },
      voice: 'selected-voice',
    });
    expect(() => createConversationTTS(config, bridge)).toThrow('provider credentials');
    const tts = createConversationTTS(config, bridge, {
      apiKey: 'project-key',
      apiSecret: 'project-secret',
      provider: 'livekit',
      model: 'cartesia/sonic-3.6',
    });
    expect(tts).toBeInstanceOf(inference.TTS);
    expect(tts.model).toBe('cartesia/sonic-3.6');
    await tts.close();
  });
  it('selects the official streaming Fish plugin for a user-selected Fish model', async () => {
    const config = conversationConfigSchema.parse({
      ttsBackend: 'lobehub',
      tts: { provider: 'fishaudio', model: 's2-pro' },
      voice: '0123456789abcdef0123456789abcdef',
    });
    const provider = createConversationTTS(config, bridge, {
      apiKey: 'local-test',
      baseURL: 'http://127.0.0.1:8080',
      sampleRate: 44100,
      model: 's2-pro',
      provider: 'fishaudio',
    });
    try {
      expect(provider).toBeInstanceOf(fishaudio.TTS);
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.model).toBe('s2-pro');
      expect(provider.sampleRate).toBe(44100);
    } finally {
      await provider.close();
    }
  });

  it.each(['https://speech.example/v1', 'https://speech.example/v1/'])(
    'normalizes a supported versioned Fish endpoint: %s',
    async (baseURL) => {
      const config = conversationConfigSchema.parse({
        tts: { provider: 'fishaudio', model: 's2-pro' },
      });
      const provider = createConversationTTS(config, bridge, {
        apiKey: 'key',
        provider: 'fishaudio',
        model: 's2-pro',
        baseURL,
      });
      try {
        expect(fishOptions.at(-1)?.baseURL).toBe('https://speech.example');
      } finally {
        await provider.close();
      }
    },
  );

  it('does not silently send Fish speech through the buffered browser bridge when unconfigured', () => {
    const config = conversationConfigSchema.parse({
      tts: { provider: 'fishaudio', model: 's2-pro' },
    });
    expect(() => createConversationTTS(config, bridge)).toThrow(
      'credentials from the LobeHub deployment',
    );
  });

  it('preserves other speech providers', async () => {
    const provider = createConversationTTS(conversationConfigSchema.parse({}), bridge);
    expect(provider).toBeInstanceOf(LobeHubTTS);
    await provider.close();
  });
});
