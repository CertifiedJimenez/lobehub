import { describe, expect, it } from 'vitest';

import { getLocalSpeechVoices } from './localSpeechVoices';

describe('local speech voices', () => {
  it('offers the supported speakers for a local Qwen CustomVoice model', () => {
    expect(
      getLocalSpeechVoices('mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit'),
    ).toContainEqual(expect.objectContaining({ id: 'Ryan', language: 'en' }));
  });
  it('leaves Base cloning models and unknown servers free to use their own voice IDs', () => {
    expect(getLocalSpeechVoices('mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16')).toBeUndefined();
    expect(getLocalSpeechVoices('custom-tts')).toBeUndefined();
  });
});
