import { toast } from '@lobehub/ui';
import { t } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { notifyVoiceCallError } from './notifyError';

describe('voice error notifications', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the native notification without exposing raw SDK or provider errors', () => {
    const notify = vi
      .spyOn(toast, 'error')
      .mockReturnValue({ close: vi.fn(), id: 'test', update: vi.fn() });
    notifyVoiceCallError(new Error('WebSocket rejected: secret=private upstream response'));
    expect(notify).toHaveBeenCalledWith({
      description: t('voiceCall.error', { ns: 'chat' }),
      id: 'voice-call-error',
    });
    expect(JSON.stringify(notify.mock.calls)).not.toContain('private upstream response');
  });

  it('gives microphone failures the device recovery message', () => {
    const notify = vi
      .spyOn(toast, 'error')
      .mockReturnValue({ close: vi.fn(), id: 'test', update: vi.fn() });
    notifyVoiceCallError(new DOMException('Permission denied', 'NotAllowedError'));
    expect(notify).toHaveBeenCalledWith({
      description: t('voiceCall.deviceError', { ns: 'chat' }),
      id: 'voice-call-error',
    });
  });

  it('uses a stable notification for repeated worker failures', () => {
    const notify = vi
      .spyOn(toast, 'error')
      .mockReturnValue({ close: vi.fn(), id: 'test', update: vi.fn() });
    notifyVoiceCallError(new Error('worker details'), 'workerUnavailable');
    notifyVoiceCallError(new Error('transport details'));
    expect((notify.mock.calls[0][0] as { id: string }).id).toBe(
      (notify.mock.calls[1][0] as { id: string }).id,
    );
    expect((notify.mock.calls[0][0] as { description: string }).description).toBe(
      t('voiceCall.workerUnavailable', { ns: 'chat' }),
    );
  });
});
