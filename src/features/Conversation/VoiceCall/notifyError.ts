import { toast } from '@lobehub/ui';
import { t } from 'i18next';

type VoiceErrorKey = 'error' | 'deviceError' | 'workerUnavailable';

/** Keep provider payloads out of the UI and coalesce callbacks for the same failed call. */
export const notifyVoiceCallError = (error?: unknown, fallback: VoiceErrorKey = 'error') => {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  const deviceError =
    typeof name === 'string' &&
    ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'SecurityError'].includes(name);

  toast.error({
    description: t(`voiceCall.${deviceError ? 'deviceError' : fallback}`, { ns: 'chat' }),
    id: 'voice-call-error',
  });
};
