// @vitest-environment node
import { spawnSync } from 'node:child_process';

import { expect, it } from 'vitest';

import { decodeLiveKitAudio } from './livekitAudioDecoder';

const wavRecording = () => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + 48_000 * 4, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(48_000, 24);
  header.writeUInt32LE(48_000 * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(48_000 * 4, 40);
  return new Blob([header, Buffer.alloc(48_000 * 4)], { type: 'audio/wav' });
};

it('converts a stereo 48kHz recording into mono 16kHz PCM for LiveKit STT', async () => {
  const result = await decodeLiveKitAudio(wavRecording());
  expect(result).toMatchObject({ bitsPerSample: 16, channels: 1, sampleRate: 16_000 });
  expect(result.data.length).toBe(32_000);
});

it('rejects invalid recordings without passing decoder diagnostics to the caller', async () => {
  await expect(decodeLiveKitAudio(new Blob(['invalid media']))).rejects.toThrow(
    'could not be decoded',
  );
});

it('honors cancellation before starting a decoder', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(decodeLiveKitAudio(wavRecording(), controller.signal)).rejects.toBeDefined();
});

it('decodes a browser-compatible Opus WebM recording before inference', async () => {
  const { default: ffmpegPath } = await import('ffmpeg-static');
  const encoded = spawnSync(ffmpegPath!, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=mono',
    '-t',
    '0.25',
    '-c:a',
    'libopus',
    '-f',
    'webm',
    'pipe:1',
  ]);
  expect(encoded.status).toBe(0);
  const result = await decodeLiveKitAudio(
    new Blob([encoded.stdout], { type: 'audio/webm;codecs=opus' }),
  );
  expect(result.sampleRate).toBe(16_000);
  expect(result.channels).toBe(1);
  expect(result.data.length).toBe(8000);
});
