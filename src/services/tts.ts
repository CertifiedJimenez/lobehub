import { lambdaClient } from '@/libs/trpc/client';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

export class SpeechOutputNotConfiguredError extends Error {
  constructor() {
    super('Choose a Speech Output model in Settings > Service Model');
  }
}

/** Both read-aloud and live conversation use the user's Speech Output selection. */
export const synthesizeSpeech = (input: string, signal: AbortSignal) => {
  const state = useUserStore.getState();
  const ref = settingsSelectors.currentSystemAgent(state).tts;
  if (!ref?.model || !ref.provider) throw new SpeechOutputNotConfiguredError();

  const config = settingsSelectors.currentSettings(state).general?.conversation;
  return lambdaClient.tts.synthesize.mutate(
    {
      input,
      model: ref.model,
      provider: ref.provider,
      voice:
        config?.tts?.model === ref.model && config.tts.provider === ref.provider
          ? config.voice || undefined
          : undefined,
    },
    { signal },
  );
};
