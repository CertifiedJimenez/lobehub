// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpeechCacheIdentity } from './SpeechAudioCache';
import {
  SPEECH_CACHE_LIMIT,
  SPEECH_CACHE_MAX_BYTES,
  SPEECH_CACHE_TIMEOUT_MS,
  SpeechAudioCache,
} from './SpeechAudioCache';

const background: Promise<unknown>[] = [];
vi.mock('@/server/utils/scheduleAfterResponse', () => ({
  after: (work: () => Promise<unknown>) => {
    background.push(work());
  },
}));
const flushCache = async () => {
  await Promise.all(background.splice(0));
};

const identity: SpeechCacheIdentity = {
  input: 'Hello',
  model: 'tts-1',
  provider: 'openai',
  voice: 'alloy',
  voiceIsDefault: false,
  params: { format: 'mp3', speed: 1 },
};
const audio = {
  audio: new Uint8Array([1, 2, 3]).buffer,
  format: 'mp3' as const,
  mimeType: 'audio/mpeg',
  usage: { inputCharacters: 5 },
};
const files = new Map<string, Buffer>();
const storage = {
  listFileKeys: vi.fn(async (prefix: string, limit = 1000) =>
    [...files.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .slice(0, limit),
  ),
  getFileByteArray: vi.fn(async (key: string) => {
    const value = files.get(key);
    if (!value) throw new Error('NoSuchKey');
    return new Uint8Array(value);
  }),
  uploadBuffer: vi.fn(
    async (key: string, data: Buffer, _mime: string, _options?: { private?: boolean }) => {
      files.set(key, data);
      return { key };
    },
  ),
  deleteFiles: vi.fn(async (keys: string[]) => {
    keys.forEach((key) => files.delete(key));
  }),
};
const cache = (user = 'user-a', workspace?: string) =>
  new SpeechAudioCache(() => storage, user, workspace);
const generate = vi.fn(async () => audio);

beforeEach(() => {
  files.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
});
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(SPEECH_CACHE_TIMEOUT_MS);
  await flushCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('speech object cache', () => {
  it('returns audio before the bucket upload completes', async () => {
    let finishUpload!: () => void;
    storage.uploadBuffer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpload = () => resolve({ key: 'stored' });
        }),
    );
    let returned = false;
    const result = cache()
      .synthesize(identity, generate)
      .then((value) => {
        returned = true;
        return value;
      });
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(returned).toBe(true);
      await expect(result).resolves.toEqual(audio);
    } finally {
      finishUpload();
    }
    await vi.advanceTimersByTimeAsync(0);
  });

  it('reuses stored bytes across service instances, without repeating usage', async () => {
    expect(await cache().synthesize(identity, generate)).toEqual(audio);
    expect(await cache().synthesize(identity, generate)).toEqual({
      audio: audio.audio,
      format: 'mp3',
      mimeType: 'audio/mpeg',
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(storage.uploadBuffer).toHaveBeenCalledWith(
      expect.any(String),
      Buffer.from(audio.audio),
      'audio/mpeg',
      { private: true },
    );
    expect([...files.keys()][0]).not.toContain('Hello');
    expect([...files.keys()][0]).not.toContain('user-a');
  });

  it.each([
    { input: 'Different text' },
    { provider: 'fishaudio' },
    { model: 'tts-2' },
    { voice: 'nova' },
    { voiceIsDefault: true },
    { params: { speed: 2 } },
  ])('regenerates for a changed speech choice: %j', async (change) => {
    await cache().synthesize(identity, generate);
    await cache().synthesize({ ...identity, ...change }, generate);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('normalizes parameter order and separates users and workspaces', async () => {
    await cache().synthesize(identity, generate);
    await cache().synthesize({ ...identity, params: { speed: 1, format: 'mp3' } }, generate);
    await cache('user-b').synthesize(identity, generate);
    await cache('user-a', 'workspace').synthesize(identity, generate);
    expect(generate).toHaveBeenCalledTimes(3);
    await flushCache();
    expect(files.size).toBe(3);
  });

  it('coalesces simultaneous requests in this server process', async () => {
    const results = await Promise.all([
      cache().synthesize(identity, generate),
      cache().synthesize(identity, generate),
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(results[0].usage).toBeDefined();
    expect(results[1].usage).toBeUndefined();
  });

  it('prunes older clips while retaining other users files', async () => {
    await cache('user-b').synthesize(identity, generate);
    for (let i = 0; i <= SPEECH_CACHE_LIMIT; i++) {
      vi.setSystemTime(Date.now() + 1);
      await cache().synthesize({ ...identity, input: `clip ${i}` }, generate);
    }
    await flushCache();
    expect(files.size).toBe(SPEECH_CACHE_LIMIT + 1);
    const count = generate.mock.calls.length;
    await cache().synthesize({ ...identity, input: `clip ${SPEECH_CACHE_LIMIT}` }, generate);
    await cache('user-b').synthesize(identity, generate);
    expect(generate).toHaveBeenCalledTimes(count);
    await cache().synthesize({ ...identity, input: 'clip 0' }, generate);
    expect(generate).toHaveBeenCalledTimes(count + 1);
  });

  it('falls back when a listed object is missing or storage is unavailable', async () => {
    await cache().synthesize(identity, generate);
    await flushCache();
    storage.getFileByteArray.mockRejectedValueOnce(new Error('NoSuchKey'));
    expect(await cache().synthesize(identity, generate)).toEqual(audio);
    await flushCache();
    storage.listFileKeys.mockRejectedValueOnce(new Error('Offline'));
    storage.uploadBuffer.mockRejectedValueOnce(new Error('Offline'));
    expect(await cache().synthesize(identity, generate)).toEqual(audio);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('never caches failures or empty/oversized results', async () => {
    const fail = vi
      .fn()
      .mockRejectedValueOnce(new Error('Provider failed'))
      .mockResolvedValue(audio);
    await expect(cache().synthesize(identity, fail)).rejects.toThrow('Provider failed');
    await cache().synthesize(identity, fail);
    expect(fail).toHaveBeenCalledTimes(2);
    await flushCache();
    files.clear();
    storage.uploadBuffer.mockClear();
    for (const bytes of [0, SPEECH_CACHE_MAX_BYTES + 1]) {
      await cache().synthesize(identity, async () => ({ ...audio, audio: new ArrayBuffer(bytes) }));
    }
    expect(storage.uploadBuffer).not.toHaveBeenCalled();
  });

  it('returns generated audio when storage never responds', async () => {
    storage.listFileKeys.mockImplementationOnce(() => new Promise(() => {}));
    storage.uploadBuffer.mockImplementationOnce(() => new Promise(() => {}));
    const result = cache().synthesize(identity, generate);
    await vi.advanceTimersByTimeAsync(SPEECH_CACHE_TIMEOUT_MS * 2);
    await expect(result).resolves.toEqual(audio);
    // A stalled cache operation must not leave this clip permanently in flight.
    await cache().synthesize(identity, generate);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
