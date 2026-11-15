'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { ConversationButton } from '@/features/Conversation/VoiceCall/ConversationButton';
import { isVoiceCallSpeechConfigured } from '@/features/Conversation/VoiceCall/speechModels';
import { topicService } from '@/services/topic';
import { useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import { useAgentId } from '../hooks/useAgentId';
import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { useTopicId } from '../hooks/useTopicId';
import { resolveConversationTarget } from './resolveConversationTarget';

const VoiceCall = lazy(() =>
  import('@/features/Conversation/VoiceCall').then((module) => ({ default: module.VoiceCall })),
);

/** The settings/profile shell should not load the call SDK or its media UI. */
const ExistingConversation = ({ showStart }: { showStart: boolean }) => (
  <Suspense fallback={null}>
    <VoiceCall showStart={showStart} />
  </Suspense>
);

const NewConversation = ({ showStart }: { showStart: boolean }) => {
  const agentId = useAgentId();
  const { canUseResource } = useChatInputResourceAccess();
  const navigate = useNavigate();
  const { t } = useTranslation('chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!showStart) return null;
  return (
    <>
      <ConversationButton
        disabled={!agentId || !canUseResource || busy}
        title={t('voiceCall.start')}
        onClick={() => {
          const state = useUserStore.getState();
          if (!isVoiceCallSpeechConfigured(settingsSelectors.currentSystemAgent(state))) {
            navigate('/settings/service-model');
            return;
          }
          setBusy(true);
          setError(false);
          void topicService
            .createTopic({ sessionId: agentId, title: t('voiceCall.start') })
            .then((topicId) => navigate(`/agent/${agentId}/${topicId}?conversation=start`))
            .catch(() => setError(true))
            .finally(() => setBusy(false));
        }}
      />
      {error && <span role="alert">{t('voiceCall.error')}</span>}
    </>
  );
};

export const ConversationAction = ({ showStart = true }: { showStart?: boolean }) => {
  const { pathname } = useLocation();
  const topicId = useTopicId();
  const configured = useServerConfigStore((s) => s.serverConfig.livekitConfigured);
  if (!configured) return null;
  return resolveConversationTarget(pathname, topicId) === 'new' ? (
    <NewConversation showStart={showStart} />
  ) : (
    <ExistingConversation showStart={showStart} />
  );
};
