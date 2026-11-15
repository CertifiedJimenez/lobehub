/** An agent's empty composer must create a topic before starting its media session. */
export const resolveConversationTarget = (pathname: string, topicId: string | null) =>
  !pathname.includes('/agent/') || !topicId ? 'new' : 'existing';
