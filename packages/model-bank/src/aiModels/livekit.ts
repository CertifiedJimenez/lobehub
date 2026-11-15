import type { AIASRModelCard, AIChatModelCard, AITTSModelCard } from '../types/aiModel';

// Curated built-in gateway IDs, checked against the official catalog on 2026-11-15.
// No live catalog fetch, provider pinning, retired models, or inferred prices/limits.
// @see https://docs.livekit.io/agents/models/inference/
// Gateway voice examples (provider-account custom voices are not interchangeable):
// @see https://docs.livekit.io/agents/models/tts/cartesia/
// @see https://docs.livekit.io/agents/models/tts/fishaudio/
// @see https://docs.livekit.io/agents/models/tts/inworld/
const chatModels: AIChatModelCard[] = [
  {
    displayName: 'Gemma 4 31B',
    enabled: true,
    family: 'gemma',
    generation: 'gemma-4',
    id: 'google/gemma-4-31b-it',
    type: 'chat',
  },
  {
    displayName: 'GPT OSS 120B',
    enabled: true,
    family: 'gpt-oss',
    id: 'openai/gpt-oss-120b',
    type: 'chat',
  },
  {
    displayName: 'GPT-5.4 mini',
    enabled: true,
    family: 'gpt',
    generation: 'gpt-5.4',
    id: 'openai/gpt-5.4-mini',
    type: 'chat',
  },
];

const asrModels: AIASRModelCard[] = [
  {
    displayName: 'Deepgram Flux (English)',
    enabled: true,
    id: 'deepgram/flux-general-en',
    type: 'asr',
  },
  {
    displayName: 'Deepgram Flux (Multilingual)',
    enabled: true,
    id: 'deepgram/flux-general-multi',
    type: 'asr',
  },
  {
    displayName: 'Deepgram Nova-3',
    enabled: true,
    id: 'deepgram/nova-3',
    type: 'asr',
  },
  {
    displayName: 'AssemblyAI Universal-3.6 Pro',
    enabled: true,
    id: 'assemblyai/universal-3-6-pro',
    type: 'asr',
  },
];

const ttsModels: AITTSModelCard[] = [
  {
    displayName: 'Cartesia Sonic 3.6',
    enabled: true,
    id: 'cartesia/sonic-3.6',
    parameters: {
      format: { default: 'mp3', enum: ['mp3', 'wav', 'pcm'] },
      voice: { default: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc' },
    },
    type: 'tts',
  },
  {
    displayName: 'Fish Audio S2.1 Pro',
    enabled: true,
    id: 'fishaudio/s2.1-pro',
    parameters: {
      format: { default: 'mp3', enum: ['mp3', 'wav', 'pcm'] },
      voice: { default: 'b347db033a6549378b48d00acb0d06cd' },
    },
    type: 'tts',
  },
  {
    displayName: 'Fish Audio Drama 3',
    enabled: true,
    id: 'fishaudio/drama-3',
    parameters: {
      format: { default: 'mp3', enum: ['mp3', 'wav', 'pcm'] },
      voice: { default: 'b347db033a6549378b48d00acb0d06cd' },
    },
    type: 'tts',
  },
  {
    displayName: 'Inworld Realtime TTS 2.0',
    enabled: true,
    id: 'inworld/inworld-tts-2',
    parameters: {
      format: { default: 'mp3', enum: ['mp3', 'wav', 'pcm'] },
      voice: { default: 'Ashley' },
    },
    type: 'tts',
    voices: [{ displayName: 'Ashley', gender: 'female', id: 'Ashley', language: 'en' }],
  },
];

export const allModels = [...chatModels, ...asrModels, ...ttsModels];

export default allModels;
