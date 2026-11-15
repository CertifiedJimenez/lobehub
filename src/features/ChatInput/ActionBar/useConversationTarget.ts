import { useLocation } from 'react-router';

import { useChatInputStore } from '../store';
import { resolveConversationTarget } from './resolveConversationTarget';

export const useConversationTarget = () => {
  const { pathname } = useLocation();
  // Only Conversation/ChatInput publishes an existing topic. A global active topic
  // does not imply that this composer is mounted under ConversationProvider.
  const topicId = useChatInputStore((s) => s.topicId);
  return resolveConversationTarget(pathname, topicId ?? null);
};
