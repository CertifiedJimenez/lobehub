import { describe, expect, it } from 'vitest';

import { isVoiceCallSpeechConfigured } from './speechModels';

const nativeSelections = {
  asr: { model: 'whisper-1', provider: 'openai' },
  tts: { model: 'tts-1', provider: 'openai' },
};

describe('voice call native speech selections', () => {
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
