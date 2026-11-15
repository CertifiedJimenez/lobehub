import { SendButton as Send } from '@lobehub/editor/react';
import { ActionIcon, Button, DropdownMenu, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { ArrowUp, AudioLines, ChevronDown, Square, X } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';

import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { selectors, useChatInputStore } from '../store';
import { getVoiceComposerAction, type VoiceComposerControl } from './presentation';

interface SendButtonProps {
  hasContent?: boolean;
  hidden?: boolean;
  voiceControl?: VoiceComposerControl;
}

const SendButton = memo<SendButtonProps>(({ hasContent = false, hidden, voiceControl }) => {
  const { t } = useTranslation('setting');
  const sendMenu = useChatInputStore((s) => s.sendMenu);
  const shape = useChatInputStore((s) => s.sendButtonProps?.shape);
  const size = useChatInputStore((s) => s.sendButtonProps?.size);
  const { generating, disabled, showSendWhileGenerating } = useChatInputStore(
    selectors.sendButtonProps,
    isEqual,
  );
  const [send, handleStop] = useChatInputStore((s) => [s.handleSendButton, s.handleStop]);
  // Market agents/skills picked from the @ menu install before the send commits.
  const installing = useChatInputStore((s) => s.installingMarketMentions);

  // Workspace viewer doesn't have `message:create` → backend would 403.
  // OR the permission gate into the existing disabled prop so the button
  // visibly grays out and a tooltip explains why.
  const { allowed: canCreate, reason } = usePermission('create_content');

  // Per-resource General-access gating: a member with view-only access on the
  // bound agent/group can read the conversation but the server rejects sends.
  const { canUseResource } = useChatInputResourceAccess();
  const viewOnly = !canUseResource;
  const canSend = canCreate && !viewOnly;

  if (voiceControl) {
    const mode = getVoiceComposerAction({
      active: voiceControl.active,
      generating,
      hasContent,
      showSendWhileGenerating: Boolean(showSendWhileGenerating),
    });
    const isVoiceAction = mode === 'voice' || mode === 'end';
    const blocked =
      mode === 'send'
        ? disabled || !canSend
        : mode === 'voice'
          ? voiceControl.disabled || !canSend
          : false;
    const title =
      (mode === 'send' || mode === 'voice') && !canSend
        ? reason || t('permission.viewOnlySendTip')
        : mode === 'voice' || mode === 'end'
          ? t(mode === 'voice' ? 'voiceCall.start' : 'voiceCall.end', { ns: 'chat' })
          : t(mode, { ns: 'common' });
    const blockSize = size ?? 36;
    const icon = { end: X, send: ArrowUp, stop: Square, voice: AudioLines }[mode];

    return (
      <Flexbox horizontal align="center" gap={8} style={{ display: hidden ? 'none' : undefined }}>
        {voiceControl.microphone}
        {generating && mode !== 'stop' && (
          <ActionIcon
            aria-label={t('stop', { ns: 'common' })}
            icon={Square}
            size={{ blockSize, borderRadius: '50%', size: blockSize < 36 ? 16 : 18 }}
            title={t('stop', { ns: 'common' })}
            variant="filled"
            onClick={() => handleStop()}
          />
        )}
        <Tooltip title={title}>
          <Button
            aria-label={title}
            data-voice-composer-action={mode}
            disabled={blocked}
            icon={<Icon icon={icon} size={blockSize < 36 ? 16 : 18} />}
            key="primary"
            loading={isVoiceAction ? voiceControl.loading : installing}
            shape="round"
            type={mode === 'stop' ? 'fill' : 'primary'}
            style={{
              width: blockSize,
              height: blockSize,
              minWidth: blockSize,
              padding: 0,
              flexShrink: 0,
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (blocked) return;
              if (isVoiceAction) voiceControl.onClick();
              else if (mode === 'stop') handleStop();
              else send();
            }}
          />
        </Tooltip>
        {mode === 'send' && canSend && sendMenu && (
          <DropdownMenu items={sendMenu.items} placement="topRight">
            <ActionIcon aria-label={t('send', { ns: 'common' })} icon={ChevronDown} size="small" />
          </DropdownMenu>
        )}
      </Flexbox>
    );
  }

  // Stop keeps its spinner so the running state stays visible; Send sits beside
  // it for the follow-up the user typed (Enter sends too).
  const button =
    generating && showSendWhileGenerating ? (
      <Flexbox horizontal align={'center'} gap={8}>
        <Send generating shape={shape} size={size} onStop={() => handleStop()} />
        <Send
          disabled={disabled || !canSend}
          loading={installing}
          shape={shape}
          size={size}
          onClick={canSend ? () => send() : undefined}
        />
      </Flexbox>
    ) : (
      <Send
        disabled={disabled || !canSend}
        generating={generating}
        loading={installing}
        menu={canSend ? (sendMenu as any) : undefined}
        placement={'topRight'}
        shape={shape}
        size={size}
        trigger={['hover']}
        onClick={generating || !canSend ? undefined : () => send()}
        onStop={() => handleStop()}
      />
    );

  if (!canCreate) return <Tooltip title={reason}>{button}</Tooltip>;
  if (viewOnly) return <Tooltip title={t('permission.viewOnlySendTip')}>{button}</Tooltip>;
  return button;
});

SendButton.displayName = 'SendButton';

export default SendButton;
