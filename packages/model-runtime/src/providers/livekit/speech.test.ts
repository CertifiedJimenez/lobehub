// @vitest-environment node
import { EventEmitter } from 'node:events';

import { jwtVerify } from 'jose';
import { afterEach, expect, it, vi } from 'vitest';

import { encodeWav } from '../google/speechAudio';
import { createLiveKitSpeech, transcribeLiveKitAudio } from './speech';

const { sessions, replies } = vi.hoisted(() => ({
  sessions: [] as any[],
  replies: { tts: [] as any[], stt: [] as any[] },
}));
vi.mock('ws', () => ({
  WebSocket: class extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    events: any[] = [];
    constructor(
      readonly url: URL,
      readonly options: any,
    ) {
      super();
      sessions.push(this);
      queueMicrotask(() => this.emit('open'));
    }
    send(message: string) {
      const event = JSON.parse(message);
      this.events.push(event);
      const result =
        event.type === 'session.flush'
          ? replies.tts
          : event.type === 'session.finalize'
            ? replies.stt
            : [];
      queueMicrotask(() => {
        for (const event of result) this.emit('message', Buffer.from(JSON.stringify(event)));
      });
    }
    close() {
      this.readyState = 3;
    }
    terminate() {
      this.readyState = 3;
    }
  },
}));

const options = {
  apiKey: 'key',
  apiSecret: 'secret',
  baseURL: 'https://agent-gateway.livekit.cloud/v1',
};
afterEach(() => {
  sessions.length = 0;
  replies.tts = [];
  replies.stt = [];
});

it('sends native TTS messages with signed auth and returns a PCM WAV container', async () => {
  replies.tts = [
    { type: 'session.created' },
    { type: 'output_audio', audio: 'AAABAA==' },
    { type: 'done' },
  ];
  const result = await createLiveKitSpeech(
    { input: 'Hello', model: 'cartesia/sonic-3.6', voice: 'voice', params: { format: 'wav' } },
    options,
  );
  expect(Buffer.from(result.audio).subarray(0, 4).toString()).toBe('RIFF');
  expect(result.format).toBe('wav');
  expect(sessions[0].url.toString()).toBe(
    'wss://agent-gateway.livekit.cloud/v1/tts?model=cartesia%2Fsonic-3.6',
  );
  expect(sessions[0].events).toEqual([
    expect.objectContaining({
      type: 'session.create',
      model: 'cartesia/sonic-3.6',
      voice: 'voice',
      encoding: 'pcm_s16le',
      sample_rate: '24000',
    }),
    expect.objectContaining({ type: 'input_transcript', transcript: 'Hello' }),
    { type: 'session.flush' },
  ]);
  const token = sessions[0].options.headers.Authorization.slice(7);
  expect((await jwtVerify(token, new TextEncoder().encode('secret'))).payload.inference).toEqual({
    perform: true,
  });
});

it('rejects gateway errors and closes the socket', async () => {
  replies.tts = [{ type: 'error', message: 'Voice unavailable' }];
  await expect(
    createLiveKitSpeech({ input: 'Hello', model: 'cartesia/sonic-3.6', voice: 'bad' }, options),
  ).rejects.toBeDefined();
  expect(sessions[0].readyState).toBe(3);
});

it('sends decoded PCM frames to STT and collects final transcripts', async () => {
  replies.stt = [
    { type: 'final_transcript', transcript: 'Hello world' },
    { type: 'session.closed' },
  ];
  const audio = encodeWav({
    bitsPerSample: 16,
    channels: 1,
    data: Buffer.alloc(6400),
    sampleRate: 16_000,
  });
  expect(
    await transcribeLiveKitAudio(
      { file: new Blob([audio]), model: 'deepgram/nova-3', language: 'en' },
      options,
    ),
  ).toEqual({ text: 'Hello world' });
  expect(sessions[0].events[0]).toEqual({
    type: 'session.create',
    model: 'deepgram/nova-3',
    settings: { encoding: 'pcm_s16le', sample_rate: '16000', language: 'en', extra: {} },
  });
  expect(sessions[0].events.filter((event: any) => event.type === 'input_audio')).toHaveLength(2);
  expect(sessions[0].events.at(-1)).toEqual({ type: 'session.finalize' });
});

it('honors cancellation before opening a speech socket', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    createLiveKitSpeech(
      { input: 'Hello', model: 'cartesia/sonic-3.6', voice: 'voice' },
      { ...options, signal: controller.signal },
    ),
  ).rejects.toBeDefined();
  expect(sessions).toHaveLength(0);
});

it('finishes STT after its transcript grace period when the gateway omits session.closed', async () => {
  vi.useFakeTimers();
  try {
    replies.stt = [{ type: 'final_transcript', transcript: 'Final words' }];
    const audio = encodeWav({
      bitsPerSample: 16,
      channels: 1,
      data: Buffer.alloc(3200),
      sampleRate: 16_000,
    });
    const result = transcribeLiveKitAudio(
      { file: new Blob([audio]), model: 'deepgram/nova-3' },
      options,
    );
    await vi.waitFor(() =>
      expect(sessions[0]?.events.some((event: any) => event.type === 'session.finalize')).toBe(
        true,
      ),
    );
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toEqual({ text: 'Final words' });
    expect(sessions[0].events.at(-1)).toEqual({ type: 'session.close' });
  } finally {
    vi.useRealTimers();
  }
});
