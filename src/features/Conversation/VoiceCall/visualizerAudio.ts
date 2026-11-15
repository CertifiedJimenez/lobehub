import type { AgentState, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';

type AudioTrack = LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;

/** Listening visualizes the local mic; speaking visualizes the assistant's playback. */
export const selectVisualizerAudioTrack = ({
  state,
  microphoneEnabled,
  microphoneTrack,
  agentTrack,
}: {
  state: AgentState;
  microphoneEnabled: boolean;
  microphoneTrack?: AudioTrack;
  agentTrack?: AudioTrack;
}) => {
  if (state === 'speaking') return agentTrack;
  if (state === 'listening' && microphoneEnabled) return microphoneTrack;
  return undefined;
};

export const resolveVisualizerBands = (state: AgentState, bands: number[], count: number) =>
  state === 'listening' || state === 'speaking' ? bands : Array.from({ length: count }, () => 0);
