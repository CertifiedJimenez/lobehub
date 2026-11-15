'use client';

import { lazy, type ReactNode, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { notifyVoiceCallError } from '@/features/Conversation/VoiceCall/notifyError';
import { isVoiceCallSpeechConfigured } from '@/features/Conversation/VoiceCall/speechModels';
import { topicService } from '@/services/topic';
import { useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import { useAgentId } from '../hooks/useAgentId';
import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { useTopicId } from '../hooks/useTopicId';
import type { VoiceComposerControl } from '../SendArea/presentation';
import SendButton from '../SendArea/SendButton';
import { resolveConversationTarget } from './resolveConversationTarget';

const VoiceCall = lazy(() =>
  import('@/features/Conversation/VoiceCall').then((module) => ({ default: module.VoiceCall })),
);

interface ConversationActionProps {
  children?: (control: VoiceComposerControl) => ReactNode;
}

const renderDefaultAction = (control: VoiceComposerControl) => (
  <SendButton voiceControl={control} />
);

const NewConversation = ({ children = renderDefaultAction }: ConversationActionProps) => {
  const agentId = useAgentId();
  const { canUseResource } = useChatInputResourceAccess();
  const navigate = useNavigate();
  const { t } = useTranslation('chat');
  const [busy, setBusy] = useState(false);
  return children({
    active: false,
    disabled: !agentId || !canUseResource || busy,
    loading: busy,
    onClick: () => {
      const state = useUserStore.getState();
      if (!isVoiceCallSpeechConfigured(settingsSelectors.currentSystemAgent(state))) {
        navigate('/settings/service-model');
        return;
      }
      setBusy(true);
      void topicService
        .createTopic({ sessionId: agentId, title: t('voiceCall.start') })
        .then((topicId) => navigate(`/agent/${agentId}/${topicId}?conversation=start`))
        .catch((error) => notifyVoiceCallError(error))
        .finally(() => setBusy(false));
    },
  });
};

export const ConversationAction = ({ children = renderDefaultAction }: ConversationActionProps) => {
  const { pathname } = useLocation();
  const topicId = useTopicId();
  const configured = useServerConfigStore((s) => s.serverConfig.livekitConfigured);
  if (!configured) return null;
  return resolveConversationTarget(pathname, topicId) === 'new' ? (
    <NewConversation>{children}</NewConversation>
  ) : (
    <Suspense fallback={children({ active: false, disabled: true, onClick: () => {} })}>
      <VoiceCall>{children}</VoiceCall>
    </Suspense>
  );
};
