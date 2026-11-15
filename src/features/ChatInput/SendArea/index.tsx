import { Flexbox } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { memo, useMemo } from 'react';

import { fileChatSelectors, useFileStore } from '@/store/file';
import { useServerConfigStore } from '@/store/serverConfig';

import { type ActionKey } from '../ActionBar/config';
import { actionMap } from '../ActionBar/config';
import { ConversationAction } from '../ActionBar/ConversationAction';
import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { useChatInputUploadKey } from '../hooks/useChatInputUpload';
import { useChatInputStore } from '../store';
import { resolveSendAreaActionKeys } from './resolveActionKeys';
import SendButton from './SendButton';

const mapActionsToItems = (keys: ActionKey[]) =>
  keys.map((actionKey) => {
    const Render = actionMap[actionKey];
    return <Render key={actionKey} />;
  });

interface SendAreaProps {
  /**
   * Strip `contextWindow` from the rendered actions because a ControlBar below
   * the composer hosts it instead. Composers without a ControlBar must pass
   * `false` or the token indicator has nowhere to render.
   */
  hideContextWindow?: boolean;
}

const SendArea = memo<SendAreaProps>(({ hideContextWindow = true }) => {
  const { canShowControls } = useChatInputResourceAccess();
  const rightActions = useChatInputStore((s) => s.rightActions, isEqual);
  const activeAudioInputMode = useChatInputStore((s) => s.activeAudioInputMode);
  const audioInputActive = activeAudioInputMode !== undefined;
  const markdown = useChatInputStore((s) => s.markdownContent);
  const conversationActive = useChatInputStore((s) => s.conversationActive);
  const uploadKey = useChatInputUploadKey();
  const hasFiles = useFileStore(fileChatSelectors.chatUploadFileListHasItem(uploadKey));
  const configured = useServerConfigStore((s) => s.serverConfig.livekitConfigured);
  const supportsConversation =
    Boolean(configured) && canShowControls && rightActions.includes('conversation');
  const hasContent = Boolean(markdown.trim()) || hasFiles;

  const items = useMemo(
    () =>
      canShowControls
        ? mapActionsToItems(
            resolveSendAreaActionKeys(
              rightActions as ActionKey[],
              hideContextWindow,
              activeAudioInputMode,
            ).filter(
              (key) =>
                key !== 'conversation' &&
                !(conversationActive && (key === 'voiceDictation' || key === 'voiceMessage')),
            ),
          )
        : [],
    [activeAudioInputMode, canShowControls, conversationActive, hideContextWindow, rightActions],
  );

  return (
    /** The model label must yield space before the footer clips Send on narrow panels. */
    <Flexbox horizontal align={'center'} flex={'0 1 auto'} gap={12} style={{ minWidth: 0 }}>
      {items}
      {supportsConversation ? (
        <ConversationAction>
          {(voiceControl) => (
            <SendButton
              hasContent={hasContent}
              hidden={audioInputActive}
              voiceControl={voiceControl}
            />
          )}
        </ConversationAction>
      ) : (
        !audioInputActive && <SendButton />
      )}
    </Flexbox>
  );
});

SendArea.displayName = 'SendArea';

export default SendArea;
