import {
  conversationConfigSchema,
  type SpeechRequest,
  type SpeechResponse,
} from '@lobechat/livekit-bridge';

import { lambdaClient } from '@/libs/trpc/client';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import { synthesizeSpeech } from './tts';

/** Reuses authenticated provider routes; no provider credentials enter a LiveKit room. */
export const handleConversationSpeech = async (
  request: SpeechRequest,
  signal: AbortSignal,
): Promise<SpeechResponse> => {
  const state = useUserStore.getState();
  const config = conversationConfigSchema.parse(
    settingsSelectors.currentSettings(state).general?.conversation ?? {},
  );
  const speechModels = settingsSelectors.currentSystemAgent(state);
  const ref = request.kind === 'asr' ? speechModels.asr : speechModels.tts;
  if (!ref?.model || !ref.provider) {
    throw new Error('Choose speech models in Settings > Service Model');
  }
  if (request.kind === 'asr') {
    const result = await lambdaClient.asr.transcribe.mutate(
      {
        audioBase64: request.audioBase64,
        fileName: 'conversation.wav',
        mimeType: 'audio/wav',
        model: ref.model,
        provider: ref.provider,
        language: config.language,
      },
      { signal },
    );
    return { requestId: request.requestId, ok: true, text: result.text };
  }
  const result = await synthesizeSpeech(request.text, signal);
  if (result.format !== 'mp3' && result.format !== 'opus' && result.format !== 'aac')
    throw new Error('Unsupported speech format');
  return {
    requestId: request.requestId,
    ok: true,
    audioBase64: result.audioBase64,
    format: result.format,
  };
};
