/** A composer must own a topic before starting its media session. */
export const resolveConversationTarget = (topicId: string | null) => (topicId ? 'existing' : 'new');
