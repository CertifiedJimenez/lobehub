import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useConversationTarget } from './useConversationTarget';

const state = vi.hoisted(() => ({ topicId: undefined as string | null | undefined }));
vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/agent/my-agent/previous-topic' }),
}));
vi.mock('../store', () => ({
  useChatInputStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (value: { activeTopicId: string }) => unknown) =>
    selector({ activeTopicId: 'previous-topic' }),
}));

describe('voice conversation ownership', () => {
  it('keeps an unowned composer out of VoiceCall even on an existing topic URL', () => {
    state.topicId = undefined;
    expect(renderHook(useConversationTarget).result.current).toBe('new');
  });

  it('does not inherit the surrounding topic when this composer has none', () => {
    state.topicId = null;
    expect(renderHook(useConversationTarget).result.current).toBe('new');
  });

  it('allows VoiceCall for the topic owned by this composer', () => {
    state.topicId = 'owned-topic';
    expect(renderHook(useConversationTarget).result.current).toBe('existing');
  });
});
