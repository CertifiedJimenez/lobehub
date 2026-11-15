import { describe, expect, it } from 'vitest';

import { filterRecordingActions } from './filterRecordingActions';

describe('call toolbar actions', () => {
  it('replaces dictation and recording with call controls without losing attachments or models', () => {
    expect(filterRecordingActions(['plus', 'voiceDictation', 'model', 'voiceMessage'])).toEqual([
      'plus',
      'model',
    ]);
  });

  it('handles collapsed groups and drops empty recording groups', () => {
    expect(filterRecordingActions([['plus', 'voiceDictation'], ['voiceMessage'], 'model'])).toEqual(
      [['plus'], 'model'],
    );
  });
});
