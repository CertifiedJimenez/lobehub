import { afterEach, describe, expect, it, vi } from 'vitest';

import { waitForVoiceReply } from './waitForReply';

afterEach(() => vi.useRealTimers());

describe('waiting for a spoken reply', () => {
  it('waits beyond gateway acceptance until the agent and tools finish', async () => {
    let running = true;
    let changed = () => {};
    const unsubscribe = vi.fn();
    const readReply = vi.fn().mockResolvedValue('The completed agent reply');
    const result = waitForVoiceReply({
      isRunning: () => running,
      subscribe: (listener) => {
        changed = listener;
        return unsubscribe;
      },
      readReply,
      signal: new AbortController().signal,
    });
    expect(readReply).not.toHaveBeenCalled();
    changed();
    expect(readReply).not.toHaveBeenCalled();
    running = false;
    changed();
    await expect(result).resolves.toBe('The completed agent reply');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('cancels without sending a late reply to speech output', async () => {
    let resolveReply!: (reply: string) => void;
    const controller = new AbortController();
    const result = waitForVoiceReply({
      isRunning: () => false,
      subscribe: () => () => {},
      readReply: () =>
        new Promise((resolve) => {
          resolveReply = resolve;
        }),
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toThrow();
    resolveReply('Late reply');
  });
  it('bounds waiting and releases the store subscription', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const result = waitForVoiceReply({
      isRunning: () => true,
      subscribe: () => unsubscribe,
      readReply: vi.fn(),
      signal: new AbortController().signal,
      timeoutMs: 1000,
    });
    const rejection = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
