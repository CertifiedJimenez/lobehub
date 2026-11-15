export const getComposerProgressState = ({
  hasOpStatus,
  hasQueue,
  hasTodos,
  voiceActive,
}: {
  hasOpStatus: boolean;
  hasQueue: boolean;
  hasTodos: boolean;
  voiceActive: boolean;
}) => ({
  goalTopAttached: hasQueue || (!voiceActive && (hasTodos || hasOpStatus)),
  showRunProgress: !voiceActive,
});
