import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { describe, expect, it } from 'vitest';

import { resolveVisualizerBands, selectVisualizerAudioTrack } from './visualizerAudio';

const microphoneTrack = { source: 'microphone' } as TrackReferenceOrPlaceholder;
const agentTrack = { source: 'unknown' } as TrackReferenceOrPlaceholder;
const tracks = { microphoneEnabled: true, microphoneTrack, agentTrack };

describe('conversation audio visualization', () => {
  it('reacts to microphone levels while listening', () => {
    expect(selectVisualizerAudioTrack({ ...tracks, state: 'listening' })).toBe(microphoneTrack);
    expect(resolveVisualizerBands('listening', [0.2, 0.8, 0.4], 3)).toEqual([0.2, 0.8, 0.4]);
  });

  it('switches to assistant playback while speaking', () => {
    expect(selectVisualizerAudioTrack({ ...tracks, state: 'speaking' })).toBe(agentTrack);
    expect(resolveVisualizerBands('speaking', [0.5, 0.3], 2)).toEqual([0.5, 0.3]);
  });

  it('stops visualizing a muted microphone without hiding assistant playback', () => {
    expect(
      selectVisualizerAudioTrack({ ...tracks, microphoneEnabled: false, state: 'listening' }),
    ).toBeUndefined();
    expect(
      selectVisualizerAudioTrack({ ...tracks, microphoneEnabled: false, state: 'speaking' }),
    ).toBe(agentTrack);
  });

  it('keeps the waiting animation separate from microphone levels', () => {
    expect(selectVisualizerAudioTrack({ ...tracks, state: 'thinking' })).toBeUndefined();
    expect(resolveVisualizerBands('thinking', [0.9, 0.8, 0.7], 3)).toEqual([0, 0, 0]);
  });
});
