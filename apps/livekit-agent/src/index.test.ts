// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import agent from './index';

const { AgentSession } = vi.hoisted(() => ({
  AgentSession: vi.fn(function () {
    return { start: vi.fn() };
  }),
}));
vi.mock('@livekit/agents', () => ({
  cli: { runApp: vi.fn() },
  defineAgent: (agent: unknown) => agent,
  ServerOptions: vi.fn(),
  voice: { AgentSession, Agent: { create: vi.fn() } },
}));
vi.mock('@livekit/agents-plugin-silero', () => ({ VAD: { load: vi.fn() } }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('./bridge.js', () => ({ LobeHubBridge: vi.fn() }));
vi.mock('./reasoning.js', () => ({ LobeHubReasoning: vi.fn() }));
vi.mock('./conversationSTT.js', () => ({ createConversationSTT: vi.fn() }));
vi.mock('./conversationTTS.js', () => ({ createConversationTTS: vi.fn() }));
vi.mock('./credentials.js', () => ({ fetchConversationCredentials: vi.fn() }));

describe('voice session turn handling', () => {
  it('passes the configured silence delay in the Node SDK millisecond units', async () => {
    await agent.entry!({
      job: {
        metadata: JSON.stringify({ participantIdentity: 'browser', config: { silenceMs: 700 } }),
      },
      room: {},
      proc: { userData: {} },
      addShutdownCallback: vi.fn(),
      connect: vi.fn(),
    } as never);
    expect(AgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        turnHandling: {
          turnDetection: 'vad',
          endpointing: { minDelay: 700 },
          preemptiveGeneration: { enabled: false },
        },
      }),
    );
  });
});
