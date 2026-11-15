import { inference } from '@livekit/agents';
import * as fishaudio from '@livekit/agents-plugin-fishaudio';
import { type ConversationConfig, getConversationTTSBackend } from '@lobechat/livekit-bridge';

import type { LobeHubBridge } from './bridge.js';
import { LobeHubTTS } from './speech.js';

type SpeechConfig = Pick<
  ConversationConfig,
  'speechBackend' | 'ttsBackend' | 'inference' | 'tts' | 'voice' | 'language'
>;

export interface ConversationTTSCredentials {
  apiKey: string;
  apiSecret?: string;
  baseURL?: string;
  model: string;
  provider: string;
  runtimeProvider?: string;
  sampleRate?: number;
  speed?: number;
}

/** Credentials arrive over an authenticated server-to-server exchange, never room metadata. */
export const createConversationTTS = (
  config: SpeechConfig,
  bridge: LobeHubBridge,
  credentials?: ConversationTTSCredentials,
) => {
  if (getConversationTTSBackend(config) === 'livekit') {
    if (!credentials?.apiSecret || credentials.model !== config.inference.ttsModel)
      throw new Error('LiveKit speech requires the selected provider credentials from LobeHub.');
    return new inference.TTS({
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      baseURL: credentials.baseURL,
      model: config.inference.ttsModel,
      voice: config.voice || config.inference.voice,
      language: config.language,
    });
  }
  if (!credentials) {
    if (config.tts.provider === 'fishaudio')
      throw new Error('Fish speech requires credentials from the LobeHub deployment.');
    return new LobeHubTTS(bridge);
  }
  if (credentials.model !== config.tts.model || credentials.provider !== config.tts.provider)
    throw new Error('Speech credentials do not match the selected service model.');
  return new fishaudio.TTS({
    apiKey: credentials.apiKey,
    baseURL: credentials.baseURL?.replace(/\/$/, ''),
    model: config.tts.model,
    voiceId: config.voice || undefined,
    sampleRate: credentials.sampleRate ?? 24000,
    speed: credentials.speed,
    latencyMode: 'balanced',
  });
};
