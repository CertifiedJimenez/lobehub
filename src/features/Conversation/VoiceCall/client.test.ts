// @vitest-environment node
import {
  VOICE_CANCEL_METHOD,
  VOICE_RESULT_TOPIC,
  VOICE_TURN_METHOD,
} from '@lobechat/livekit-bridge';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceCallClient } from './client';

type RpcHandler = (request: { callerIdentity: string; payload: string }) => Promise<string>;

const { rpc, write, close, streamText } = vi.hoisted(() => {
  const write = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  return {
    rpc: new Map<string, RpcHandler>(),
    write,
    close,
    streamText: vi.fn().mockResolvedValue({ write, close }),
  };
});
vi.mock('livekit-client', () => ({
  DisconnectReason: { CLIENT_INITIATED: 1 },
  ParticipantKind: { AGENT: 4 },
  RoomEvent: { Disconnected: 'disconnected' },
  RpcError: class extends Error {
    constructor(_code: number, message: string) {
      super(message);
    }
  },
  Room: class {
    localParticipant = { streamText };
    remoteParticipants = new Map([['worker', { kind: 4 }]]);
    on() {}
    registerTextStreamHandler() {}
    registerRpcMethod(name: string, handler: RpcHandler) {
      rpc.set(name, handler);
    }
    async disconnect() {}
    removeAllListeners() {}
  },
}));
const request = (method: string, requestId: string, callerIdentity = 'worker') =>
  rpc.get(method)!({ callerIdentity, payload: JSON.stringify({ requestId, text: 'Hello' }) });

beforeEach(() => {
  vi.clearAllMocks();
  rpc.clear();
});

describe('voice client streaming', () => {
  it('writes text before the turn finishes and frames completion in the same stream', async () => {
    let finish!: () => void;
    const end = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const client = new VoiceCallClient({
      onDisconnected: vi.fn(),
      onError: vi.fn(),
      onSpeech: vi.fn(),
      onWorking: vi.fn(),
      onTurn: async (_text, _signal, onText) => {
        await onText('First sentence.');
        await end;
      },
    });
    const requestId = crypto.randomUUID();
    expect(await request(VOICE_TURN_METHOD, requestId)).toBe('accepted');
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(streamText).toHaveBeenCalledWith({
      attributes: { requestId },
      destinationIdentities: ['worker'],
      topic: VOICE_RESULT_TOPIC,
    });
    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      ok: true,
      requestId,
      text: 'First sentence.',
    });
    expect(close).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(JSON.parse(write.mock.calls[1][0])).toEqual({ ok: true, requestId, done: true });
    await client.close();
  });

  it('waits for interrupted runtime cleanup before accepting the next turn', async () => {
    let finishStop!: () => void;
    const stopped = new Promise<void>((resolve) => {
      finishStop = resolve;
    });
    const onTurn = vi.fn(async (_text: string, signal: AbortSignal) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      await stopped;
      signal.throwIfAborted();
    });
    const onError = vi.fn();
    const client = new VoiceCallClient({
      onDisconnected: vi.fn(),
      onError,
      onSpeech: vi.fn(),
      onWorking: vi.fn(),
      onTurn,
    });
    const firstId = crypto.randomUUID();
    await request(VOICE_TURN_METHOD, firstId);
    await vi.waitFor(() => expect(onTurn).toHaveBeenCalledOnce());
    const cancel = request(VOICE_CANCEL_METHOD, firstId);
    const second = request(VOICE_TURN_METHOD, crypto.randomUUID());
    expect(onTurn).toHaveBeenCalledOnce();
    finishStop();
    await cancel;
    await expect(second).resolves.toBe('accepted');
    await vi.waitFor(() => expect(onTurn).toHaveBeenCalledTimes(2));
    expect(onError).not.toHaveBeenCalled();
    await client.close();
  });

  it('rejects unauthenticated participants before starting a turn', async () => {
    const onTurn = vi.fn();
    const client = new VoiceCallClient({
      onDisconnected: vi.fn(),
      onError: vi.fn(),
      onSpeech: vi.fn(),
      onWorking: vi.fn(),
      onTurn,
    });
    await expect(request(VOICE_TURN_METHOD, crypto.randomUUID(), 'stranger')).rejects.toThrow(
      'Only the voice worker',
    );
    expect(onTurn).not.toHaveBeenCalled();
    await client.close();
  });
});
