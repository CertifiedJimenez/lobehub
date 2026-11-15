import { describe, expect, it } from 'vitest';

import { getVoiceComposerAction } from './presentation';

const idle = {
  active: false,
  generating: false,
  hasContent: false,
  showSendWhileGenerating: false,
};

describe('voice composer primary action', () => {
  it('switches from voice to send when text or attachments are added', () => {
    expect(getVoiceComposerAction(idle)).toBe('voice');
    expect(getVoiceComposerAction({ ...idle, hasContent: true })).toBe('send');
  });

  it('switches the active call end action to send while typing and back when cleared', () => {
    expect(getVoiceComposerAction({ ...idle, active: true })).toBe('end');
    expect(getVoiceComposerAction({ ...idle, active: true, hasContent: true })).toBe('send');
    expect(getVoiceComposerAction({ ...idle, active: true, hasContent: false })).toBe('end');
  });

  it('keeps the call end action available while a spoken reply is generating', () => {
    expect(getVoiceComposerAction({ ...idle, active: true, generating: true })).toBe('end');
  });

  it('respects ordinary stop and queued-send behavior', () => {
    expect(getVoiceComposerAction({ ...idle, generating: true })).toBe('stop');
    expect(getVoiceComposerAction({ ...idle, generating: true, hasContent: true })).toBe('stop');
    expect(
      getVoiceComposerAction({
        ...idle,
        generating: true,
        hasContent: true,
        showSendWhileGenerating: true,
      }),
    ).toBe('send');
  });
});
