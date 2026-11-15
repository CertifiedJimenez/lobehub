import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleConversationSpeech } from './conversation';
import { synthesizeSpeech } from './tts';

const mocks = vi.hoisted(() => ({
  asr: vi.fn(),
  tts: vi.fn(),
  settings: {
    general: {
      conversation: {
        enabled: false,
        voice: 'my-clone',
        language: 'es',
        tts: { model: 's2-pro', provider: 'fishaudio' },
      },
    },
  },
  models: {
    asr: { model: 'transcribe', provider: 'input' },
    tts: { model: 's2-pro', provider: 'fishaudio' },
  },
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    asr: { transcribe: { mutate: mocks.asr } },
    tts: { synthesize: { mutate: mocks.tts } },
  },
}));
vi.mock('@/store/user', () => ({ useUserStore: { getState: () => ({}) } }));
vi.mock('@/store/user/selectors', () => ({
  settingsSelectors: {
    currentSettings: () => mocks.settings,
    currentSystemAgent: () => mocks.models,
  },
}));

describe('native conversation speech settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.models.tts.model = 's2-pro';
  });

  it('uses Service Model TTS and the preferred clone regardless of the obsolete enable switch', async () => {
    mocks.tts.mockResolvedValue({ audioBase64: 'audio', format: 'mp3' });
    const signal = new AbortController().signal;
    await handleConversationSpeech({ kind: 'tts', text: 'Hello', requestId: 'request' }, signal);
    expect(mocks.tts).toHaveBeenCalledWith(
      { input: 'Hello', model: 's2-pro', provider: 'fishaudio', voice: 'my-clone' },
      { signal },
    );
  });

  it('does not carry a clone from the previous model into a new speech selection', async () => {
    mocks.models.tts.model = 'different-model';
    mocks.tts.mockResolvedValue({ audioBase64: 'audio', format: 'mp3' });
    await handleConversationSpeech(
      { kind: 'tts', text: 'Hello', requestId: 'request' },
      new AbortController().signal,
    );
    expect(mocks.tts.mock.calls[0][0]).toMatchObject({
      model: 'different-model',
      voice: undefined,
    });
  });

  it('reads replies through the same selected model and voice without starting a call', async () => {
    mocks.tts.mockResolvedValue({ audioBase64: 'audio', format: 'mp3', mimeType: 'audio/mpeg' });
    const result = await synthesizeSpeech('Read my reply', new AbortController().signal);
    expect(result.audioBase64).toBe('audio');
    expect(mocks.tts.mock.calls[0][0]).toMatchObject({
      model: 's2-pro',
      provider: 'fishaudio',
      voice: 'my-clone',
    });
    expect(mocks.asr).not.toHaveBeenCalled();
  });

  it('uses the same transcription selection as voice messages', async () => {
    mocks.asr.mockResolvedValue({ text: 'Hola' });
    const result = await handleConversationSpeech(
      { kind: 'asr', audioBase64: 'audio', requestId: 'request' },
      new AbortController().signal,
    );
    expect(mocks.asr.mock.calls[0][0]).toMatchObject({
      model: 'transcribe',
      provider: 'input',
      language: 'es',
    });
    expect(result.text).toBe('Hola');
  });

  it('requires an explicit speech output selection instead of silently choosing another voice', async () => {
    mocks.models.tts.model = '';
    await expect(
      handleConversationSpeech(
        { kind: 'tts', text: 'Hello', requestId: 'request' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Service Model');
    expect(mocks.tts).not.toHaveBeenCalled();
  });
});
