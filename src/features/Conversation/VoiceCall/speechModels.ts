import { conversationConfigSchema } from '@lobechat/livekit-bridge';
import type { UserSystemAgentConfig } from '@lobechat/types';

/** A voice ID belongs to the provider/model that created it. */
export const resolveVoiceSettings = (preferences: unknown, tts: UserSystemAgentConfig['tts']) => {
  const config = conversationConfigSchema.parse(preferences ?? {});
  return {
    ...config,
    tts: { model: tts.model, provider: tts.provider },
    voice:
      config.tts.model === tts.model && config.tts.provider === tts.provider ? config.voice : '',
  };
};

/** Voice transport uses the same speech selections as the rest of the app. */
export const isVoiceCallSpeechConfigured = (
  systemAgent: Pick<UserSystemAgentConfig, 'asr' | 'tts'>,
) =>
  Boolean(
    systemAgent.asr.model &&
    systemAgent.asr.provider &&
    systemAgent.tts.model &&
    systemAgent.tts.provider,
  );
