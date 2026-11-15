import { useChatInputStore } from '../store';
import { resolveConversationTarget } from './resolveConversationTarget';

export const useConversationTarget = () => {
  // Only Conversation/ChatInput publishes an existing topic. A global active topic
  // does not imply that this composer is mounted under ConversationProvider.
  const topicId = useChatInputStore((s) => s.topicId);
  return resolveConversationTarget(topicId ?? null);
};
