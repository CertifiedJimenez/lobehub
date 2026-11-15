import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VoiceMessage } from './reply';
import { waitForVoiceReply } from './waitForReply';

const rows = (content: string): VoiceMessage[] => [
  { id: 'assistant', parentId: 'user', role: 'assistant', content },
];
const defaults = { userMessageId: 'user', readMessages: () => [], onText: async () => {} };

afterEach(() => vi.useRealTimers());

describe('waiting for a spoken reply', () => {
  it('streams growing assistant text before tools finish, without repeating the final reply', async () => {
    let running = true;
    let changed = () => {};
    let content = 'Hello';
    const onText = vi.fn().mockResolvedValue(undefined);
    const messages = () => [{ id: 'assistant', parentId: 'user', role: 'assistant', content }];
    const result = waitForVoiceReply({
      ...defaults,
      isRunning: () => running,
      subscribe: (listener) => {
        changed = listener;
        return () => {};
      },
      readFinalMessages: async () => messages(),
      readMessages: messages,
      userMessageId: 'user',
      onText,
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith('Hello'));
    content = 'Hello there.';
    changed();
    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith(' there.'));
    running = false;
    changed();
    await result;
    expect(onText.mock.calls.flat()).toEqual(['Hello', ' there.']);
  });

  it('waits beyond gateway acceptance until the agent and tools finish', async () => {
    let running = true;
    let changed = () => {};
    const unsubscribe = vi.fn();
    const readFinalMessages = vi.fn().mockResolvedValue(rows('The completed agent reply'));
    const result = waitForVoiceReply({
      ...defaults,
      isRunning: () => running,
      subscribe: (listener) => {
        changed = listener;
        return unsubscribe;
      },
      readFinalMessages,
      signal: new AbortController().signal,
    });
    expect(readFinalMessages).not.toHaveBeenCalled();
    changed();
    expect(readFinalMessages).not.toHaveBeenCalled();
    running = false;
    changed();
    await expect(result).resolves.toBe('The completed agent reply');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('cancels without sending a late reply to speech output', async () => {
    let resolveReply!: (reply: VoiceMessage[]) => void;
    const controller = new AbortController();
    const result = waitForVoiceReply({
      ...defaults,
      isRunning: () => false,
      subscribe: () => () => {},
      readFinalMessages: () =>
        new Promise((resolve) => {
          resolveReply = resolve;
        }),
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toThrow();
    resolveReply(rows('Late reply'));
  });
  it('includes a final assistant message that arrives only in persisted history', async () => {
    const onText = vi.fn().mockResolvedValue(undefined);
    const early = rows('Let me check.');
    const final = [
      ...early,
      { id: 'tool', parentId: 'assistant', role: 'tool', content: 'Private tool payload' },
      { id: 'answer', parentId: 'tool', role: 'assistant', content: 'Here is the answer.' },
      { id: 'next-user', role: 'user', content: 'Unrelated next turn' },
      { id: 'next-answer', parentId: 'next-user', role: 'assistant', content: 'Do not speak this' },
    ];
    await waitForVoiceReply({
      ...defaults,
      onText,
      isRunning: () => false,
      subscribe: () => () => {},
      readMessages: () => early,
      readFinalMessages: async () => final,
      signal: new AbortController().signal,
    });
    expect(onText.mock.calls.flat().join('')).toBe('Let me check.\n\nHere is the answer.');
  });

  it('bounds waiting and releases the store subscription', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const result = waitForVoiceReply({
      ...defaults,
      isRunning: () => true,
      subscribe: () => unsubscribe,
      readFinalMessages: vi.fn(),
      signal: new AbortController().signal,
      timeoutMs: 1000,
    });
    const rejection = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
