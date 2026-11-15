import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNewConversationControl } from './ConversationAction';

const mocks = vi.hoisted(() => ({
  createTopic: vi.fn(async () => 'unscoped-topic'),
  internal_createTopic: vi.fn(async () => 'scoped-topic'),
  navigate: vi.fn(),
  projectId: 'my-project' as string | undefined,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ projectId: mocks.projectId }),
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/store/chat', () => ({
  useChatStore: { getState: () => ({ internal_createTopic: mocks.internal_createTopic }) },
}));
vi.mock('@/services/topic', () => ({ topicService: { createTopic: mocks.createTopic } }));
vi.mock('@/store/user', () => ({ useUserStore: { getState: () => ({}) } }));
vi.mock('@/store/user/selectors', () => ({
  settingsSelectors: { currentSystemAgent: () => ({}) },
}));
vi.mock('@/features/Conversation/VoiceCall/speechModels', () => ({
  isVoiceCallSpeechConfigured: () => true,
}));
vi.mock('../hooks/useAgentId', () => ({ useAgentId: () => 'my-agent' }));
vi.mock('../hooks/useChatInputResourceAccess', () => ({
  useChatInputResourceAccess: () => ({ canUseResource: true }),
}));
vi.mock('./useConversationTarget', () => ({ useConversationTarget: () => 'new' }));
vi.mock('@/store/serverConfig', () => ({ useServerConfigStore: vi.fn() }));
vi.mock('../SendArea/SendButton', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectId = 'my-project';
});

describe('new voice conversation', () => {
  it('opens the shared policy topic on the agent route outside a project', async () => {
    mocks.projectId = undefined;
    const { result } = renderHook(useNewConversationControl);
    await act(async () => result.current.onClick());
    expect(mocks.navigate).toHaveBeenCalledWith('/agent/my-agent/scoped-topic?conversation=start');
    expect(mocks.createTopic).not.toHaveBeenCalled();
  });

  it('opens the topic produced by the shared creation policy within its project', async () => {
    const { result } = renderHook(useNewConversationControl);
    await act(async () => result.current.onClick());
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/project/my-project/topic/scoped-topic?conversation=start',
    );
    expect(mocks.createTopic).not.toHaveBeenCalled();
  });
});
