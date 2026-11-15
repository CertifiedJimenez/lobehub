import { spawn } from 'node:child_process';

interface PcmAudio {
  bitsPerSample: number;
  channels: number;
  data: Buffer;
  sampleRate: number;
}

/** Decode uploaded browser recordings to the gateway's mono PCM stream, with bounded work. */
export const decodeLiveKitAudio = async (file: Blob, signal?: AbortSignal): Promise<PcmAudio> => {
  signal?.throwIfAborted();
  if (!file.size || file.size > 25 * 1024 * 1024)
    throw new Error('Audio must contain between 1 byte and 25 MB.');
  const input = Buffer.from(await file.arrayBuffer());
  const { default: ffmpegPath } = await import('ffmpeg-static');
  if (!ffmpegPath) throw new Error('Audio decoding is unavailable: ffmpeg is not installed.');
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'pipe',
        '-i',
        'pipe:0',
        '-vn',
        '-t',
        '301',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-f',
        's16le',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      child.kill();
      if (error) reject(error);
      else if (!bytes) reject(new Error('The uploaded recording contains no decodable audio.'));
      else
        resolve({
          bitsPerSample: 16,
          channels: 1,
          data: Buffer.concat(chunks),
          sampleRate: 16_000,
        });
    };
    const abort = () => finish(new Error('Audio decoding was aborted.'));
    const timer = setTimeout(() => finish(new Error('Audio decoding timed out.')), 30_000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 300 * 16_000 * 2)
        return finish(new Error('Audio must be no longer than five minutes.'));
      chunks.push(chunk);
    });
    // Drain decoder diagnostics without leaking uploaded content or binary paths.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', () => finish(new Error('Could not start the audio decoder.')));
    child.once('close', (code) =>
      finish(code === 0 ? undefined : new Error('The recording could not be decoded.')),
    );
    child.stdin.end(input);
  });
};
