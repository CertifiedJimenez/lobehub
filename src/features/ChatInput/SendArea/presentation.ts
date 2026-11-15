import type { ReactNode } from 'react';

export interface VoiceComposerControl {
  active: boolean;
  disabled?: boolean;
  loading?: boolean;
  microphone?: ReactNode;
  onClick: () => void;
}

/** The primary control changes its action in place; the microphone is independent. */
export const getVoiceComposerAction = ({
  active,
  generating,
  hasContent,
  showSendWhileGenerating,
}: {
  active: boolean;
  generating: boolean;
  hasContent: boolean;
  showSendWhileGenerating: boolean;
}): 'voice' | 'end' | 'send' | 'stop' => {
  if (hasContent) return generating && !showSendWhileGenerating ? 'stop' : 'send';
  if (active) return 'end';
  return generating ? 'stop' : 'voice';
};
