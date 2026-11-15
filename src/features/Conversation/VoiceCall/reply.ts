export interface VoiceMessage {
  content?: string;
  error?: unknown;
  id: string;
  parentId?: string | null;
  role: string;
  tools?: unknown[] | null;
}

/** Only assistant content descended from this turn; never tool payloads or another user turn. */
export const getVoiceReplyMessages = (messages: VoiceMessage[], userMessageId: string) => {
  const descendants = new Set([userMessageId]);
  // Tool/sub-agent rows may arrive out of order while the transcript rehydrates.
  for (let changed = true; changed;) {
    changed = false;
    for (const message of messages) {
      if (
        message.role !== 'user' &&
        message.parentId &&
        descendants.has(message.parentId) &&
        !descendants.has(message.id)
      ) {
        descendants.add(message.id);
        changed = true;
      }
    }
  }
  return messages.filter(
    (message) =>
      descendants.has(message.id) &&
      message.role === 'assistant' &&
      !message.error &&
      Boolean(message.content?.trim()),
  );
};

export const getVoiceReply = (messages: VoiceMessage[], userMessageId: string): string => {
  const reply = getVoiceReplyMessages(messages, userMessageId).at(-1);
  if (!reply?.content)
    throw new Error(
      'The agent did not return a spoken reply. Check the conversation for errors or approvals.',
    );
  return reply.content;
};
