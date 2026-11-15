import { LOADING_FLAT } from '@lobechat/const';
import { toast } from '@lobehub/ui';
import { Square, Volume2 } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { readAloudPlayer } from '@/features/Conversation/ReadAloud/player';
import { SpeechOutputNotConfiguredError } from '@/services/tts';
import { markdownToTxt } from '@/utils/markdownToTxt';

import { defineAction } from '../defineAction';

export const ttsAction = defineAction({
  key: 'tts',
  useBuild: (ctx) => {
    const { t } = useTranslation('chat');
    const state = useSyncExternalStore(
      readAloudPlayer.subscribe,
      () => readAloudPlayer.getState(ctx.id),
      () => undefined,
    );
    useEffect(() => () => readAloudPlayer.stop(ctx.id), [ctx.id]);

    const content = ctx.role === 'group' ? ctx.contentBlock?.content : ctx.data.content;
    if (ctx.role === 'user' || !content?.trim() || content === LOADING_FLAT) return null;

    return {
      handleClick: () =>
        readAloudPlayer.toggle(ctx.id, markdownToTxt(content), (error) => {
          toast.error({
            description: t(
              error instanceof SpeechOutputNotConfiguredError
                ? 'readAloud.notConfigured'
                : 'readAloud.error',
            ),
            id: 'read-aloud-error',
          });
        }),
      icon: state ? Square : Volume2,
      key: 'tts',
      label: t(
        state === 'loading'
          ? 'readAloud.cancel'
          : state === 'playing'
            ? 'readAloud.stop'
            : 'readAloud.start',
      ),
    };
  },
});
