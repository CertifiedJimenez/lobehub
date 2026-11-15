import { asLanguageCode, inference } from '@livekit/agents';
import type { ConversationConfig } from '@lobechat/livekit-bridge';

import type { LobeHubBridge } from './bridge.js';
import type { ConversationTTSCredentials } from './conversationTTS.js';
import { LobeHubSTT } from './speech.js';

/** Native model choices select the recognizer; transport credentials never select a model. */
export const createConversationSTT = (
  config: Pick<ConversationConfig, 'speechBackend' | 'inference' | 'language'>,
  bridge: LobeHubBridge,
  credentials?: ConversationTTSCredentials,
) => {
  if (config.speechBackend !== 'livekit') return new LobeHubSTT(bridge, config.language);
  if (!credentials?.apiSecret || credentials.model !== config.inference.sttModel)
    throw new Error('LiveKit recognition requires the selected provider credentials from LobeHub.');
  return new inference.STT({
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret,
    baseURL: credentials.baseURL,
    model: config.inference.sttModel,
    language: asLanguageCode(config.language),
  });
};
