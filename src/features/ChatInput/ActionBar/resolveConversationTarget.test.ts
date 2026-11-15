import { describe, expect, it } from 'vitest';

import { resolveConversationTarget } from './resolveConversationTarget';

describe('resolveConversationTarget', () => {
  it('starts a new conversation from an agent without a topic', () => {
    expect(resolveConversationTarget(null)).toBe('new');
  });

  it('uses the existing topic when starting a call in a conversation', () => {
    expect(resolveConversationTarget('my-topic')).toBe('existing');
  });
});
