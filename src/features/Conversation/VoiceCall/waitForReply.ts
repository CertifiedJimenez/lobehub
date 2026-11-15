import { VOICE_TURN_TIMEOUT_MS } from '@lobechat/livekit-bridge';

/** A gateway send resolves on acceptance; its agent can still be running or awaiting tools. */
export const waitForVoiceReply = ({
  isRunning,
  subscribe,
  readReply,
  signal,
  timeoutMs = VOICE_TURN_TIMEOUT_MS,
}: {
  isRunning: () => boolean;
  subscribe: (listener: () => void) => () => void;
  readReply: () => Promise<string>;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<string> =>
  new Promise((resolve, reject) => {
    let reading = false;
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
    const check = () => {
      if (settled || reading || isRunning()) return;
      reading = true;
      // Fetch the settled transcript: a final server event may precede local rehydration.
      void readReply().then(
        (reply) => finish(undefined, reply),
        (error) => finish(error),
      );
    };
    const timer = setTimeout(() => finish(new Error('The conversation turn timed out')), timeoutMs);
    unsubscribe = subscribe(check);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else check();
  });
