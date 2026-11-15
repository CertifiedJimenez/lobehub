import type { UserSystemAgentConfig } from '@lobechat/types';

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
