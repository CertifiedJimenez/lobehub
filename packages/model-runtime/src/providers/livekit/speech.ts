import { AgentRuntimeErrorType } from '@lobechat/types';
import livekitModels from 'model-bank/livekit';
import { WebSocket } from 'ws';

import type { ASROptions, ASRPayload, TextToSpeechOptions, TextToSpeechPayload } from '../../types';
import { resolveTextToSpeechParams } from '../../types/tts';
import { AgentRuntimeError } from '../../utils/createError';
import {
  encodeMp3,
  encodeWav,
  parseWav,
  type PcmAudio,
  toArrayBuffer,
} from '../google/speechAudio';
import { createLiveKitInferenceToken } from './auth';

interface SpeechConnectionOptions {
  apiKey: string;
  apiSecret: string;
  baseURL: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

type AudioDecoder = (file: Blob, signal?: AbortSignal) => Promise<PcmAudio>;
let audioDecoder: AudioDecoder | undefined;

/** Servers inject their media decoder; the shared runtime never imports a process/RTC SDK. */
export const setLiveKitAudioDecoder = (decoder: AudioDecoder) => {
  audioDecoder = decoder;
};

const speechError = (message: string) =>
  AgentRuntimeError.createError(AgentRuntimeErrorType.ProviderBizError, {
    message,
    provider: 'livekit',
  });

/** Single utterance protocol used by @livekit/agents inference.STT / inference.TTS. */
const runSpeechSession = async (
  kind: 'stt' | 'tts',
  model: string,
  options: SpeechConnectionOptions,
  start: (send: (event: Record<string, unknown>) => void, complete: () => void) => void,
  receive: (event: Record<string, unknown>) => boolean,
) => {
  options.signal?.throwIfAborted();
  const token = await createLiveKitInferenceToken(options.apiKey, options.apiSecret);
  const url = new URL(`${options.baseURL.replace(/\/$/, '')}/${kind}`);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.searchParams.set('model', model);
  return new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
      maxPayload: 8 * 1024 * 1024,
    });
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      socket.removeAllListeners();
      // Keep an error handler while closing a connection still being established.
      socket.on('error', () => {});
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else socket.terminate();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(options.signal?.reason || new Error('LiveKit request aborted'));
    const timer = setTimeout(
      () => finish(speechError('LiveKit speech request timed out.')),
      120_000,
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) return abort();
    socket.once('open', () => {
      try {
        start(
          (event) => socket.send(JSON.stringify(event)),
          () => finish(),
        );
      } catch (error) {
        finish(error);
      }
    });
    socket.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        if (event.type === 'error')
          return finish(
            speechError(`LiveKit speech request failed: ${event.message || 'Unknown error'}`),
          );
        if (receive(event)) finish();
      } catch {
        finish(speechError('LiveKit returned an invalid speech response.'));
      }
    });
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      finish(
        AgentRuntimeError.createError(
          response.statusCode === 401 || response.statusCode === 403
            ? AgentRuntimeErrorType.InvalidProviderAPIKey
            : AgentRuntimeErrorType.ProviderBizError,
          {
            message: `LiveKit speech gateway returned HTTP ${response.statusCode}.`,
            provider: 'livekit',
          },
        ),
      );
    });
    socket.once('error', () =>
      finish(speechError('Could not connect to the LiveKit speech gateway.')),
    );
    socket.once('close', () =>
      finish(speechError('LiveKit closed the speech connection before completion.')),
    );
  });
};

export const createLiveKitSpeech = async (
  payload: TextToSpeechPayload,
  options: SpeechConnectionOptions & TextToSpeechOptions,
) => {
  const params = resolveTextToSpeechParams(payload);
  const format = params.format || 'mp3';
  if (!['mp3', 'wav', 'pcm'].includes(format))
    throw speechError(`LiveKit speech supports mp3, wav and pcm output; received ${format}.`);
  if (!payload.input.trim() || payload.input.length > 4096)
    throw speechError('LiveKit speech input must contain between 1 and 4096 characters.');
  const card = livekitModels.find((card) => card.id === payload.model);
  const voice =
    payload.voice?.trim() || (card?.type === 'tts' ? card.parameters?.voice?.default : undefined);
  if (!voice) throw speechError('Select a LiveKit Inference voice.');
  const sampleRate = params.sampleRate || 24_000;
  if (![8000, 16_000, 22_050, 24_000, 44_100, 48_000].includes(sampleRate))
    throw speechError('Unsupported LiveKit speech sample rate.');
  const chunks: Buffer[] = [];
  let size = 0;
  await runSpeechSession(
    'tts',
    payload.model,
    options,
    (send) => {
      send({
        type: 'session.create',
        model: payload.model,
        voice,
        sample_rate: String(sampleRate),
        encoding: 'pcm_s16le',
        extra: {},
      });
      send({
        type: 'input_transcript',
        transcript: payload.input,
        generation_config: { model: payload.model, voice },
      });
      send({ type: 'session.flush' });
    },
    (event) => {
      if (event.type === 'output_audio' && typeof event.audio === 'string') {
        const chunk = Buffer.from(event.audio, 'base64');
        size += chunk.length;
        if (size > 24 * 1024 * 1024)
          throw new Error('LiveKit speech output exceeded the size limit.');
        chunks.push(chunk);
      }
      return event.type === 'done' || event.type === 'session.closed';
    },
  );
  if (!size) throw speechError('LiveKit returned empty speech audio.');
  const pcm: PcmAudio = { bitsPerSample: 16, channels: 1, data: Buffer.concat(chunks), sampleRate };
  const audio =
    format === 'mp3' ? await encodeMp3(pcm) : format === 'wav' ? encodeWav(pcm) : pcm.data;
  return { audio: toArrayBuffer(audio), format };
};

export const transcribeLiveKitAudio = async (
  payload: ASRPayload,
  options: SpeechConnectionOptions & ASROptions,
) => {
  if (!payload.file.size || payload.file.size > 25 * 1024 * 1024)
    throw speechError('LiveKit transcription audio must contain between 1 byte and 25 MB.');
  if (
    payload.responseFormat &&
    payload.responseFormat !== 'json' &&
    payload.responseFormat !== 'text'
  )
    throw speechError('LiveKit transcription supports json and text responses.');
  let audio: PcmAudio;
  try {
    audio = audioDecoder
      ? await audioDecoder(payload.file, options.signal)
      : parseWav(Buffer.from(await payload.file.arrayBuffer()));
  } catch (error) {
    options.signal?.throwIfAborted();
    throw speechError(
      error instanceof Error
        ? error.message.replaceAll('Gemini', 'LiveKit')
        : 'The recording could not be decoded.',
    );
  }
  if (
    audio.bitsPerSample !== 16 ||
    audio.channels !== 1 ||
    !Number.isFinite(audio.sampleRate) ||
    audio.sampleRate < 8000 ||
    audio.sampleRate > 48_000 ||
    audio.data.length % 2 !== 0
  )
    throw speechError('LiveKit transcription requires mono 16-bit PCM audio.');
  if (audio.data.length / (audio.sampleRate * 2) > 300)
    throw speechError('LiveKit transcription audio must be no longer than five minutes.');
  const transcripts: string[] = [];
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let closeSession: (() => void) | undefined;
  const scheduleClose = (delay: number) => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => closeSession?.(), delay);
  };
  try {
    await runSpeechSession(
      'stt',
      payload.model,
      options,
      (send, complete) => {
        send({
          type: 'session.create',
          model: payload.model,
          settings: {
            sample_rate: String(audio.sampleRate),
            encoding: 'pcm_s16le',
            extra: {},
            ...(payload.language ? { language: payload.language } : {}),
          },
        });
        // Bound each frame to 100ms, as in the Agents SDK audio stream.
        const frameBytes = Math.floor(audio.sampleRate / 10) * 2;
        for (let offset = 0; offset < audio.data.length; offset += frameBytes)
          send({
            type: 'input_audio',
            audio: audio.data.subarray(offset, offset + frameBytes).toString('base64'),
          });
        send({ type: 'session.finalize' });
        // session.closed is optional; the Agents SDK finishes after a finalization
        // grace period, rather than waiting indefinitely for that acknowledgment.
        closeSession = () => {
          send({ type: 'session.close' });
          complete();
        };
        scheduleClose(30_000);
      },
      (event) => {
        if (event.type === 'final_transcript' && typeof event.transcript === 'string') {
          transcripts.push(event.transcript);
          scheduleClose(3000);
        }
        return event.type === 'session.closed';
      },
    );
  } finally {
    clearTimeout(closeTimer);
  }
  return { text: transcripts.join(' ').trim() };
};
