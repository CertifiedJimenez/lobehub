import type { ConversationContext } from '@lobechat/types';
import { generateEntityId } from '@lobechat/utils';

import type { Operation } from '@/store/chat/slices/operation/types';
import type { ChatStore } from '@/store/chat/store';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import type { VoiceMessage } from './reply';
import { waitForVoiceReply } from './waitForReply';

type TurnStore = Pick<
  ChatStore,
  'cancelOperation' | 'dbMessagesMap' | 'operations' | 'sendMessage'
>;

/** Include active children even after the send operation hands off and completes. */
const ownedOperations = (
  operations: Record<string, Operation>,
  userMessageId: string,
  owned: Set<string>,
) => {
  const rows = Object.values(operations);
  for (let changed = true; changed;) {
    changed = false;
    for (const operation of rows) {
      if (
        !owned.has(operation.id) &&
        ((operation.type === 'sendMessage' && operation.context.messageId === userMessageId) ||
          (operation.parentOperationId && owned.has(operation.parentOperationId)))
      ) {
        owned.add(operation.id);
        changed = true;
      }
    }
  }
  return rows.filter((operation) => owned.has(operation.id) && operation.status === 'running');
};

/** Observe the same transcript as chat; voice never starts a separate reasoning runtime. */
export const runVoiceTurn = async ({
  context,
  text,
  signal,
  onText,
  store,
  readMessages,
}: {
  context: ConversationContext;
  text: string;
  signal: AbortSignal;
  onText: (text: string) => Promise<void>;
  store: { getState: () => TurnStore; subscribe: (listener: () => void) => () => void };
  readMessages: () => Promise<VoiceMessage[]>;
}) => {
  signal.throwIfAborted();
  const userMessageId = generateEntityId('messages');
  const key = messageMapKey(context);
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  const owned = new Set<string>();
  const runningOperations = () =>
    ownedOperations(store.getState().operations, userMessageId, owned);
  const cancel = async () => {
    const running = runningOperations();
    const ids = new Set(running.map((operation) => operation.id));
    await Promise.all(
      running
        .filter((operation) => !ids.has(operation.parentOperationId ?? ''))
        .map((operation) =>
          store.getState().cancelOperation(operation.id, 'Voice turn interrupted'),
        ),
    );
  };
  let sending = true;
  let changed = () => {};
  // Subscribe before sendMessage: client runtimes resolve only after generation,
  // whereas gateway runtimes resolve on acceptance. Both stream into this store.
  const reply = waitForVoiceReply({
    signal: controller.signal,
    userMessageId,
    onText,
    isRunning: () => {
      // Remember ancestry before completed roots are pruned, including while
      // a client-side send is still awaiting its runtime.
      const running = runningOperations();
      return sending || running.length > 0;
    },
    readMessages: () => store.getState().dbMessagesMap[key] ?? [],
    readFinalMessages: readMessages,
    subscribe: (listener) => {
      changed = listener;
      return store.subscribe(listener);
    },
  });
  const send = store
    .getState()
    .sendMessage({
      context,
      inputEditor: null,
      message: text,
      optimisticUserMessageId: userMessageId,
      preserveComposer: true,
      signal: controller.signal,
    })
    .then((result) => {
      if (!result) throw new Error('The voice turn was not accepted');
    })
    .finally(() => {
      sending = false;
      changed();
    });
  try {
    await Promise.all([send, reply]);
  } finally {
    controller.abort();
    signal.removeEventListener('abort', abort);
    // Wait for startup too: cancelling the local send signal does not cancel
    // persistence. The gateway must learn the run ID and confirm its late stop.
    await cancel();
    await send.catch(() => {});
    await cancel();
  }
};
