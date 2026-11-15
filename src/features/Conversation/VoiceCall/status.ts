import type { AgentState } from '@livekit/components-react';

/** The composer reports voice readiness; tool execution details belong in chat. */
export const getVoiceStatusKey = (state: AgentState, microphoneEnabled: boolean) => {
  if (['connecting', 'initializing', 'pre-connect-buffering'].includes(state)) {
    return 'voiceCall.agentState.connecting';
  }
  if (!microphoneEnabled) return 'voiceCall.muted';
  if (state === 'thinking') return 'voiceCall.agentState.thinking';
  return 'voiceCall.agentState.listening';
};
