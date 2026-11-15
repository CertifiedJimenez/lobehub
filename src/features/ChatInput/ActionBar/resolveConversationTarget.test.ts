import { describe, expect, it } from 'vitest';

import { resolveConversationTarget } from './resolveConversationTarget';

describe('resolveConversationTarget', () => {
  it('starts a new conversation from an agent without a topic', () => {
    expect(resolveConversationTarget('/agent/my-agent', null)).toBe('new');
  });

  it('uses the existing topic when starting a call in a conversation', () => {
    expect(resolveConversationTarget('/agent/my-agent/my-topic', 'my-topic')).toBe('existing');
  });

  it('creates a new conversation from Home even with a previously active topic', () => {
    expect(resolveConversationTarget('/', 'previous-topic')).toBe('new');
  });
});
