import { VOICE_TURN_TIMEOUT_MS } from '@lobechat/livekit-bridge';

import { getVoiceReply, getVoiceReplyMessages, type VoiceMessage } from './reply';

/** A gateway send resolves on acceptance; its agent can still be running or awaiting tools. */
export const waitForVoiceReply = ({
  isRunning,
  subscribe,
  readFinalMessages,
  readMessages,
  userMessageId,
  onText,
  signal,
  timeoutMs = VOICE_TURN_TIMEOUT_MS,
}: {
  isRunning: () => boolean;
  subscribe: (listener: () => void) => () => void;
  readFinalMessages: () => Promise<VoiceMessage[]>;
  readMessages: () => VoiceMessage[];
  userMessageId: string;
  onText: (text: string) => Promise<void>;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<string> =>
  new Promise((resolve, reject) => {
    let reading = false;
    const emitted = new Map<string, string>();
    let output = Promise.resolve();
    const emit = (text: string) => {
      if (!text) return;
      output = output.then(() => {
        if (!settled) return onText(text);
      });
      void output.catch((error) => finish(error));
    };
    let settled = false;
    let unsubscribe = () => {};
    const cleanup = () => {
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener('abort', abort);
    };
    const finish = (error?: unknown, reply?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(reply!);
    };
    const abort = () => finish(signal.reason ?? new Error('Conversation turn cancelled'));
    const append = (messages: VoiceMessage[]) => {
      for (const message of getVoiceReplyMessages(messages, userMessageId)) {
        const previous = emitted.get(message.id) ?? '';
        const content = message.content!;
        // Rehydration may replace an incomplete snapshot. Never re-speak or
        // invent a suffix when the already spoken prefix no longer matches.
        if (!content.startsWith(previous)) continue;
        if (!previous && emitted.size) emit('\n\n');
        emit(content.slice(previous.length));
        emitted.set(message.id, content);
      }
    };
    const check = () => {
      if (settled || reading) return;
      append(readMessages());
      if (isRunning()) return;
      reading = true;
      // Fetch the settled transcript: a final server event may precede local rehydration.
      void readFinalMessages().then(
        async (messages) => {
          if (settled) return;
          try {
            const reply = getVoiceReply(messages, userMessageId);
            append(messages);
            await output;
            finish(undefined, reply);
          } catch (error) {
            finish(error);
          }
        },
        (error) => finish(error),
      );
    };
    const timer = setTimeout(() => finish(new Error('The conversation turn timed out')), timeoutMs);
    unsubscribe = subscribe(check);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else check();
  });
