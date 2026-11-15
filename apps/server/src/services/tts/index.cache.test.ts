// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TTSService } from './index';

const { files, findModel, findProvider, textToSpeech, initializeRuntime } = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  findModel: vi.fn(),
  findProvider: vi.fn(),
  initializeRuntime: vi.fn(),
  textToSpeech: vi.fn(),
}));

vi.mock('@/database/models/aiModel', () => ({
  AiModelModel: vi.fn(function () {
    return { findByIdAndProvider: findModel };
  }),
}));
vi.mock('@/server/modules/ModelRuntime', () => ({ initModelRuntimeFromDB: initializeRuntime }));
vi.mock('@/database/models/aiProvider', () => ({
  AiProviderModel: vi.fn(function () {
    return { findById: findProvider };
  }),
}));
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return {
      deleteFiles: async (keys: string[]) => {
        keys.forEach((key) => files.delete(key));
      },
      getFileByteArray: async (key: string) => new Uint8Array(files.get(key)!),
      listFileKeys: async (prefix: string, limit: number) =>
        [...files.keys()]
          .filter((key) => key.startsWith(prefix))
          .sort()
          .slice(0, limit),
      uploadBuffer: async (key: string, bytes: Buffer) => {
        files.set(key, bytes);
      },
    };
  }),
}));

const request = { input: 'Hello', model: 'tts-1', provider: 'openai' };
const service = () => new TTSService({} as any, 'user');
const spokenVoice = (audio: ArrayBuffer) => new TextDecoder().decode(audio);

beforeEach(() => {
  files.clear();
  vi.clearAllMocks();
  findModel.mockResolvedValue({ settings: { ttsVoice: 'nova' } });
  findProvider.mockResolvedValue({
    keyVaults: 'encrypted-endpoint-a',
    settings: { sdkType: 'openai' },
  });
  initializeRuntime.mockResolvedValue({ textToSpeech });
  textToSpeech.mockImplementation(async ({ voice }) => ({
    audio: new TextEncoder().encode(voice).buffer,
    format: 'mp3',
    usage: { inputCharacters: 5 },
  }));
});

describe('TTSService persistent speech cache', () => {
  it('regenerates after the provider endpoint or SDK changes without changing its ID', async () => {
    const custom = { ...request, provider: 'custom-speech' };
    await service().synthesize(custom);
    await service().synthesize(custom);
    expect(textToSpeech).toHaveBeenCalledTimes(1);

    findProvider.mockResolvedValue({
      keyVaults: 'encrypted-endpoint-b',
      settings: { sdkType: 'openai' },
    });
    await service().synthesize(custom);
    expect(textToSpeech).toHaveBeenCalledTimes(2);

    findProvider.mockResolvedValue({
      keyVaults: 'encrypted-endpoint-b',
      settings: { sdkType: 'fishaudio' },
    });
    await service().synthesize(custom);
    expect(textToSpeech).toHaveBeenCalledTimes(3);
  });

  it('bypasses stored audio if current provider configuration cannot be read', async () => {
    await service().synthesize(request);
    findProvider.mockRejectedValueOnce(new Error('provider lookup unavailable'));
    await service().synthesize(request);
    expect(textToSpeech).toHaveBeenCalledTimes(2);
  });

  it('replays the saved voice across requests, then regenerates when the preference changes', async () => {
    const first = await service().synthesize(request);
    const replay = await service().synthesize(request);
    expect(spokenVoice(first.audio)).toBe('nova');
    expect(replay.audio).toEqual(first.audio);
    expect(first.usage).toEqual({ inputCharacters: 5 });
    expect(replay.usage).toBeUndefined();
    expect(textToSpeech).toHaveBeenCalledTimes(1);

    findModel.mockResolvedValue({ settings: { ttsVoice: 'shimmer' } });
    expect(spokenVoice((await service().synthesize(request)).audio)).toBe('shimmer');
    expect(textToSpeech).toHaveBeenCalledTimes(2);
    expect(files.size).toBe(2);
  });

  it('keeps request validation and runtime initialization in front of cache reads', async () => {
    await service().synthesize(request);
    await expect(service().synthesize({ ...request, params: { speed: -1 } })).rejects.toThrow();
    initializeRuntime.mockRejectedValueOnce({ errorType: 'InvalidProviderAPIKey' });
    await expect(service().synthesize(request)).rejects.toThrow(/API Key/);
    expect(textToSpeech).toHaveBeenCalledTimes(1);
  });

  it('normalizes omitted model defaults and honors an explicit voice over the saved preference', async () => {
    await service().synthesize(request);
    await service().synthesize({ ...request, params: { speed: 1 } });
    expect(textToSpeech).toHaveBeenCalledTimes(1);
    expect(spokenVoice((await service().synthesize({ ...request, voice: 'alloy' })).audio)).toBe(
      'alloy',
    );
    expect(textToSpeech).toHaveBeenCalledTimes(2);
  });
});
