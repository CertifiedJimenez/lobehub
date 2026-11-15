import { LOADING_FLAT } from '@lobechat/const';
import { Icon, toast } from '@lobehub/ui';
import { LoaderCircle, Play, Square, Volume2 } from 'lucide-react';
import { createElement, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import {
  readAloudPlayer,
  SpeechPlaybackTimeoutError,
} from '@/features/Conversation/ReadAloud/player';
import { useConversationStore } from '@/features/Conversation/store';
import { SpeechOutputNotConfiguredError } from '@/services/tts';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { markdownToTxt } from '@/utils/markdownToTxt';

import { defineAction } from '../defineAction';

export const ttsAction = defineAction({
  key: 'tts',
  useBuild: (ctx) => {
    const { t } = useTranslation('chat');
    const scope = useConversationStore((s) => messageMapKey(s.context));
    const state = useSyncExternalStore(
      readAloudPlayer.subscribe,
      () => readAloudPlayer.getState(ctx.id),
      () => undefined,
    );

    const content = ctx.role === 'group' ? ctx.contentBlock?.content : ctx.data.content;
    if (ctx.role === 'user' || !content?.trim() || content === LOADING_FLAT) return null;

    return {
      handleClick: () =>
        readAloudPlayer.toggle(
          ctx.id,
          markdownToTxt(content),
          (error) => {
            toast.error({
              description: t(
                error instanceof SpeechOutputNotConfiguredError
                  ? 'readAloud.notConfigured'
                  : error instanceof SpeechPlaybackTimeoutError
                    ? 'readAloud.timeout'
                    : 'readAloud.error',
              ),
              id: 'read-aloud-error',
            });
          },
          scope,
        ),
      // Keep cancellation enabled while showing the native loading indicator.
      icon:
        state === 'loading'
          ? createElement(Icon, { icon: LoaderCircle, spin: true })
          : state === 'ready'
            ? Play
            : state === 'playing'
              ? Square
              : Volume2,
      key: 'tts',
      label: t(
        state === 'loading'
          ? 'readAloud.cancel'
          : state === 'playing'
            ? 'readAloud.stop'
            : state === 'ready'
              ? 'readAloud.play'
              : 'readAloud.start',
      ),
    };
  },
});
