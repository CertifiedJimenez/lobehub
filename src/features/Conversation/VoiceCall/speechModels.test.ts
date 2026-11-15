import { describe, expect, it } from 'vitest';

import { isVoiceCallSpeechConfigured, resolveVoiceSettings } from './speechModels';

const nativeSelections = {
  asr: { model: 'whisper-1', provider: 'openai' },
  tts: { model: 'tts-1', provider: 'openai' },
};

describe('voice call native speech selections', () => {
  it('retains a saved voice for its selected model', () => {
    expect(
      resolveVoiceSettings({ tts: nativeSelections.tts, voice: 'my-clone' }, nativeSelections.tts)
        .voice,
    ).toBe('my-clone');
  });

  it('clears the previous provider voice before editing settings for a new model', () => {
    const result = resolveVoiceSettings(
      { tts: { model: 's2-pro', provider: 'fishaudio' }, voice: 'old-clone' },
      nativeSelections.tts,
    );
    expect(result.tts).toEqual(nativeSelections.tts);
    expect(result.voice).toBe('');
  });

  it('accepts the app speech models without personal LiveKit settings', () => {
    expect(isVoiceCallSpeechConfigured(nativeSelections)).toBe(true);
  });

  it.each(['asr', 'tts'] as const)('requires a complete native %s selection', (key) => {
    for (const field of ['provider', 'model'] as const) {
      expect(
        isVoiceCallSpeechConfigured({
          ...nativeSelections,
          [key]: { ...nativeSelections[key], [field]: '' },
        }),
      ).toBe(false);
    }
  });
});
