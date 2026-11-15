import type { ConversationContext } from '@lobechat/types';
import { describe, expect, it, vi } from 'vitest';

import type { ChatStore } from '@/store/chat/store';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import { runVoiceTurn } from './runTurn';

const setup = (clientRuntime = false) => {
  const context: ConversationContext = { agentId: 'agent', topicId: 'topic' };
  const key = messageMapKey(context);
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());
  let finishSend!: () => void;
  const accepted = new Promise<void>((resolve) => {
    finishSend = resolve;
  });
  const state = {
    operations: {},
    dbMessagesMap: { [key]: [] },
    cancelOperation: vi.fn(async (id: string) => {
      state.operations[id].status = 'cancelled';
      changed();
      finishSend();
      return true;
    }),
    sendMessage: vi.fn(async ({ optimisticUserMessageId: id }) => {
      state.operations.send = {
        id: 'send',
        type: 'sendMessage',
        status: 'completed',
        context: { ...context, messageId: id },
      };
      state.operations.run = {
        id: 'run',
        type: 'execServerAgentRuntime',
        parentOperationId: 'send',
        status: 'running',
        context,
      };
      // A different conversation must never be stopped by a voice interruption.
      state.operations.other = {
        id: 'other',
        type: 'execAgentRuntime',
        status: 'running',
        context: { agentId: 'other' },
      };
      state.dbMessagesMap[key] = [
        { id: 'reply', parentId: id, role: 'assistant', content: 'Hello.' },
      ];
      changed();
      if (clientRuntime) await accepted;
      return { userMessageId: id, assistantMessageId: 'reply' };
    }),
  } as Pick<ChatStore, 'operations' | 'dbMessagesMap' | 'cancelOperation' | 'sendMessage'>;
  return {
    state,
    changed,
    context,
    finishSend,
    store: {
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    readMessages: async () => state.dbMessagesMap[key],
    listeners,
  };
};

describe('voice turns in the native chat runtime', () => {
  it.each([false, true])(
    'streams before send completion (client runtime: %s) and interrupts the owned run',
    async (clientRuntime) => {
      const fixture = setup(clientRuntime);
      const controller = new AbortController();
      const onText = vi.fn().mockResolvedValue(undefined);
      const result = runVoiceTurn({ ...fixture, text: 'Hello', signal: controller.signal, onText });
      const rejection = expect(result).rejects.toThrow();
      await vi.waitFor(() => expect(onText).toHaveBeenCalledWith('Hello.'));
      controller.abort();
      await rejection;
      expect(fixture.state.cancelOperation).toHaveBeenCalledExactlyOnceWith(
        'run',
        'Voice turn interrupted',
      );
      expect(fixture.state.operations.other.status).toBe('running');
      expect(fixture.listeners.size).toBe(0);
      fixture.state.dbMessagesMap[messageMapKey(fixture.context)][0].content += ' Late text.';
      fixture.changed();
      expect(onText).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'keeps ownership after a completed send parent is pruned (client: %s)',
    async (clientRuntime) => {
      const fixture = setup(clientRuntime);
      const controller = new AbortController();
      const onText = vi.fn().mockResolvedValue(undefined);
      const result = runVoiceTurn({
        ...fixture,
        text: 'Long turn',
        signal: controller.signal,
        onText,
      });
      const rejection = expect(result).rejects.toThrow();
      await vi.waitFor(() => expect(onText).toHaveBeenCalledOnce());
      delete fixture.state.operations.send;
      fixture.changed();
      await Promise.resolve();
      controller.abort();
      await rejection;
      expect(fixture.state.cancelOperation).toHaveBeenCalledExactlyOnceWith(
        'run',
        'Voice turn interrupted',
      );
    },
  );

  it('awaits a cancelled start before releasing the voice turn', async () => {
    const fixture = setup();
    const controller = new AbortController();
    let finishStartup!: () => void;
    const startup = new Promise<void>((resolve) => {
      finishStartup = resolve;
    });
    vi.mocked(fixture.state.sendMessage).mockImplementationOnce(async ({ signal }) => {
      await startup;
      signal!.throwIfAborted();
      return undefined;
    });
    let finished = false;
    const result = runVoiceTurn({
      ...fixture,
      text: 'Starting',
      signal: controller.signal,
      onText: vi.fn(),
    }).finally(() => {
      finished = true;
    });
    const rejection = expect(result).rejects.toThrow();
    controller.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(finished).toBe(false);
    finishStartup();
    await rejection;
    expect(finished).toBe(true);
  });

  it('does not repeat stored text when the stream finishes normally', async () => {
    const fixture = setup();
    const onText = vi.fn().mockResolvedValue(undefined);
    const result = runVoiceTurn({
      ...fixture,
      text: 'Hello',
      signal: new AbortController().signal,
      onText,
    });
    await vi.waitFor(() => expect(onText).toHaveBeenCalledOnce());
    fixture.state.operations.run.status = 'completed';
    fixture.changed();
    await result;
    expect(onText).toHaveBeenCalledExactlyOnceWith('Hello.');
    expect(fixture.state.cancelOperation).not.toHaveBeenCalled();
    expect(fixture.listeners.size).toBe(0);
  });
});
