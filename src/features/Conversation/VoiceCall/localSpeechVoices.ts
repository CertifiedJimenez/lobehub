import type { TTSVoice } from 'model-bank';

// Qwen's published CustomVoice speakers; Base models require reference audio instead.
// https://github.com/QwenLM/Qwen3-TTS#custom-voice-generate
const qwenVoices: TTSVoice[] = [
  { id: 'Ryan', displayName: 'Ryan', gender: 'male', language: 'en' },
  { id: 'Aiden', displayName: 'Aiden', gender: 'male', language: 'en-US' },
  { id: 'Vivian', displayName: 'Vivian', gender: 'female', language: 'zh' },
  { id: 'Serena', displayName: 'Serena', gender: 'female', language: 'zh' },
  { id: 'Uncle_Fu', displayName: 'Uncle Fu', gender: 'male', language: 'zh' },
  { id: 'Dylan', displayName: 'Dylan', gender: 'male', language: 'zh' },
  { id: 'Eric', displayName: 'Eric', gender: 'male', language: 'zh' },
  { id: 'Ono_Anna', displayName: 'Ono Anna', gender: 'female', language: 'ja' },
  { id: 'Sohee', displayName: 'Sohee', gender: 'female', language: 'ko' },
];

export const getLocalSpeechVoices = (model: string): TTSVoice[] | undefined =>
  /^mlx-community\/Qwen3-TTS-12Hz-(0\.6|1\.7)B-CustomVoice-/.test(model) ? qwenVoices : undefined;
