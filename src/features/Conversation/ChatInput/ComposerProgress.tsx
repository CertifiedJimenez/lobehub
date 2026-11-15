import { useChatInputStore } from '@/features/ChatInput/store';

import TodoProgress from '../TodoProgress';
import LinkedGoalTray from './LinkedGoalTray';
import OpStatusTray from './OpStatusTray';
import { getComposerProgressState } from './progressState';

/** Voice has one status indicator; detailed run progress remains in the message timeline. */
export const ComposerProgress = (props: {
  hasOpStatus: boolean;
  hasQueue: boolean;
  hasTodos: boolean;
}) => {
  const voiceActive = useChatInputStore((s) => s.conversationActive);
  const { showRunProgress, goalTopAttached } = getComposerProgressState({ ...props, voiceActive });

  return (
    <>
      {showRunProgress && (
        <>
          <TodoProgress topAttached={props.hasQueue} />
          <OpStatusTray topAttached={props.hasQueue || props.hasTodos} />
        </>
      )}
      <LinkedGoalTray topAttached={goalTopAttached} />
    </>
  );
};
