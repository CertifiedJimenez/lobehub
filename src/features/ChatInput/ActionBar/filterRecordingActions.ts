import type { ActionKeys } from './config';

/** The call owns the microphone until it ends, including while connecting. */
export const filterRecordingActions = (actions: ActionKeys[]): ActionKeys[] =>
  actions.flatMap((action): ActionKeys[] => {
    if (Array.isArray(action)) {
      const group = action.filter((key) => key !== 'voiceDictation' && key !== 'voiceMessage');
      return group.length ? [group] : [];
    }
    return action === 'voiceDictation' || action === 'voiceMessage' ? [] : [action];
  });
