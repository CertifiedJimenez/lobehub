import { createHash } from 'node:crypto';

import debug from 'debug';
import { withTimeout } from 'es-toolkit';
import { TTS_AUDIO_FORMATS, TTS_AUDIO_MIME_TYPES, type TTSAudioFormat } from 'model-bank';

import type { FileService } from '@/server/services/file';
import { after } from '@/server/utils/scheduleAfterResponse';

import type { TTSSynthesizeResult } from './index';

const log = debug('lobe-tts:cache');
export const SPEECH_CACHE_LIMIT = 50;
export const SPEECH_CACHE_MAX_BYTES = 4 * 1024 * 1024;
export const SPEECH_CACHE_TIMEOUT_MS = 1500;
const pending = new Map<string, Promise<TTSSynthesizeResult>>();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

type Storage = Pick<
  FileService,
  'deleteFiles' | 'getFileByteArray' | 'listFileKeys' | 'uploadBuffer'
>;

export interface SpeechCacheIdentity {
  input: string;
  model: string;
  params: Record<string, unknown>;
  provider: string;
  providerRevision?: string;
  voice: string;
  voiceIsDefault: boolean;
}

/** Recent generated clips, separate from library files; all access stays behind the TTS route. */
export class SpeechAudioCache {
  private readonly prefix: string;

  constructor(
    private readonly storage: () => Storage,
    userId: string,
    workspaceId?: string,
  ) {
    this.prefix = `tts-cache/v1/${hash([userId, workspaceId ?? null])}/`;
  }

  private parse(key: string) {
    if (!key.startsWith(this.prefix)) return;
    const match = /^(\d{13})-([a-f0-9]{64})\.([a-z0-9]+)$/.exec(key.slice(this.prefix.length));
    if (!match || !TTS_AUDIO_FORMATS.includes(match[3] as TTSAudioFormat)) return;
    return { digest: match[2], format: match[3] as TTSAudioFormat, key };
  }

  private async read(digest: string): Promise<TTSSynthesizeResult | undefined> {
    try {
      return await withTimeout(async () => {
        // Reverse timestamps sort newest first. A read examines at most the retained window.
        const keys = await this.storage().listFileKeys(this.prefix, SPEECH_CACHE_LIMIT);
        const found = keys.map((key) => this.parse(key)).find((entry) => entry?.digest === digest);
        if (!found) return;
        const bytes = await this.storage().getFileByteArray(found.key);
        if (!bytes.length || bytes.length > SPEECH_CACHE_MAX_BYTES) return;
        return {
          audio: new Uint8Array(bytes).buffer,
          format: found.format,
          mimeType: TTS_AUDIO_MIME_TYPES[found.format],
        };
      }, SPEECH_CACHE_TIMEOUT_MS);
    } catch {
      log('Cache unavailable; synthesizing speech');
    }
  }

  private async write(digest: string, result: TTSSynthesizeResult) {
    if (!result.audio.byteLength || result.audio.byteLength > SPEECH_CACHE_MAX_BYTES) return;
    try {
      await withTimeout(async () => {
        const newestFirst = String(9_999_999_999_999 - Date.now()).padStart(13, '0');
        const key = `${this.prefix}${newestFirst}-${digest}.${result.format}`;
        const storage = this.storage();
        await storage.uploadBuffer(key, Buffer.from(result.audio), result.mimeType, {
          private: true,
        });
        // Bounded, best-effort cleanup follows FileService's transient-download pattern.
        // Concurrent writers may briefly exceed 50; every successful write reconciles the window.
        const keys = await storage.listFileKeys(this.prefix, 1000);
        const older = keys
          .filter((item) => this.parse(item))
          .sort()
          .slice(SPEECH_CACHE_LIMIT);
        if (older.length) await storage.deleteFiles(older);
      }, SPEECH_CACHE_TIMEOUT_MS);
    } catch {
      log('Could not retain/prune speech cache; returning generated audio');
    }
  }

  async synthesize(identity: SpeechCacheIdentity, generate: () => Promise<TTSSynthesizeResult>) {
    const digest = hash({
      ...identity,
      params: Object.fromEntries(
        Object.entries(identity.params).sort(([a], [b]) => a.localeCompare(b)),
      ),
    });
    const key = this.prefix + digest;
    const inFlight = pending.get(key);
    if (inFlight) {
      const { usage: _, ...audio } = await inFlight;
      return audio;
    }
    let retaining = false;
    const release = () => {
      if (pending.get(key) === request) pending.delete(key);
    };
    const request = (async () => {
      const cached = await this.read(digest);
      if (cached) return cached;
      const result = await generate();
      retaining = true;
      // Let playback start while the host retains/prunes the private clip. Keep
      // coalescing requests until persistence finishes so replay does not rebill.
      after(async () => {
        try {
          await this.write(digest, result);
        } finally {
          release();
        }
      });
      return result;
    })();
    pending.set(key, request);
    try {
      return await request;
    } finally {
      if (!retaining) release();
    }
  }
}
