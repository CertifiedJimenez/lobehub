'use client';

import { ActionIcon } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { type LucideIcon, MessageCircle } from 'lucide-react';

const styles = stylex.create({
  button: {
    borderRadius: '50%',
    backgroundColor: cssVar.colorPrimary,
    color: cssVar.colorTextLightSolid,
  },
});

export const ConversationButton = ({
  title,
  disabled,
  icon = MessageCircle,
  onClick,
}: {
  title: string;
  disabled?: boolean;
  icon?: LucideIcon;
  onClick: () => void;
}) => (
  <ActionIcon
    aria-label={title}
    className={stylex.props(styles.button).className}
    disabled={disabled}
    icon={icon}
    size={{ blockSize: 36, size: 18 }}
    title={title}
    onClick={onClick}
  />
);
