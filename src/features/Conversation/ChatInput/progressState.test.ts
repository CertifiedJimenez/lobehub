import { describe, expect, it } from 'vitest';

import { getComposerProgressState } from './progressState';

describe('composer progress in voice mode', () => {
  const running = { hasOpStatus: true, hasQueue: false, hasTodos: true, voiceActive: false };

  it('removes the duplicate run strip during a call and restores it after ending the call', () => {
    expect(getComposerProgressState(running).showRunProgress).toBe(true);
    expect(getComposerProgressState({ ...running, voiceActive: true }).showRunProgress).toBe(false);
    expect(getComposerProgressState(running).showRunProgress).toBe(true);
  });

  it('does not attach a goal tray to hidden progress', () => {
    expect(getComposerProgressState({ ...running, voiceActive: true }).goalTopAttached).toBe(false);
  });

  it('preserves attachment to an actionable queued-message tray during a call', () => {
    expect(
      getComposerProgressState({ ...running, hasQueue: true, voiceActive: true }).goalTopAttached,
    ).toBe(true);
  });
});
