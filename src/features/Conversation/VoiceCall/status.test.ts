import { describe, expect, it } from 'vitest';

import { getVoiceStatusKey } from './status';

describe('composer voice status', () => {
  it('shows muted even while the assistant is speaking or thinking', () => {
    expect(getVoiceStatusKey('speaking', false)).toBe('voiceCall.muted');
    expect(getVoiceStatusKey('thinking', false)).toBe('voiceCall.muted');
    expect(getVoiceStatusKey('listening', false)).toBe('voiceCall.muted');
  });

  it('reports readiness while the microphone can accept speech', () => {
    expect(getVoiceStatusKey('listening', true)).toBe('voiceCall.agentState.listening');
    expect(getVoiceStatusKey('speaking', true)).toBe('voiceCall.agentState.listening');
    expect(getVoiceStatusKey('idle', true)).toBe('voiceCall.agentState.listening');
  });

  it('reports thinking without duplicating tool execution details', () => {
    expect(getVoiceStatusKey('thinking', true)).toBe('voiceCall.agentState.thinking');
  });

  it('does not claim to be listening before the room is ready', () => {
    expect(getVoiceStatusKey('connecting', true)).toBe('voiceCall.agentState.connecting');
    expect(getVoiceStatusKey('initializing', false)).toBe('voiceCall.agentState.connecting');
  });
});
