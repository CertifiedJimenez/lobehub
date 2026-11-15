import { synthesizeSpeech } from '@/services/tts';

type PlaybackState = 'loading' | 'playing' | 'ready';
type Synthesize = typeof synthesizeSpeech;

export class SpeechPlaybackTimeoutError extends Error {}

/** Bound each request and prefer word boundaries without dropping any reply text. */
export const splitSpeechText = (text: string): string[] => {
  const chunks: string[] = [];
  let remaining = Array.from(text.trim());
  while (remaining.length) {
    let end = Math.min(1000, remaining.length);
    if (remaining.length > end) {
      for (let index = end - 1; index > 500; index--) {
        if (/\s/.test(remaining[index])) {
          end = index + 1;
          break;
        }
      }
    }
    chunks.push(remaining.slice(0, end).join(''));
    remaining = remaining.slice(end);
  }
  return chunks;
};

/** One read-aloud stream at a time; stale synthesis may never start playback. */
export class ReadAloudPlayer {
  private listeners = new Set<() => void>();
  private current?: {
    abort: AbortController;
    audio: HTMLAudioElement;
    id: string;
    play: () => Promise<void>;
    state: PlaybackState;
    url?: string;
  };

  constructor(private synthesize: Synthesize = synthesizeSpeech) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (id: string) => (this.current?.id === id ? this.current.state : undefined);

  private emit = () => {
    this.listeners.forEach((listener) => listener());
  };

  stop = (id?: string) => {
    const current = this.current;
    if (!current || (id && id !== current.id)) return;
    this.current = undefined;
    current.abort.abort();
    current.audio.onended = null;
    current.audio.onerror = null;
    current.audio.pause();
    current.audio.removeAttribute('src');
    current.audio.load();
    if (current.url) URL.revokeObjectURL(current.url);
    this.emit();
  };

  toggle = async (id: string, text: string, onError: (error: unknown) => void) => {
    if (this.current?.id === id) {
      // Retry from the user's click without another request or losing the generated audio.
      if (this.current.state === 'ready') return this.current.play();
      this.stop();
      return;
    }
    this.stop();
    const chunks = splitSpeechText(text);
    if (!chunks.length) return;

    const current = {
      abort: new AbortController(),
      audio: new Audio(),
      id,
      play: async () => {},
      state: 'loading' as PlaybackState,
      url: undefined as string | undefined,
    };
    this.current = current;
    this.emit();
    const fail = (error: unknown) => {
      if (this.current !== current) return;
      this.stop();
      onError(error);
    };
    current.play = async () => {
      try {
        await current.audio.play();
        if (this.current !== current) return;
        current.state = 'playing';
        this.emit();
      } catch (error) {
        if (this.current !== current) return;
        if (error instanceof Error && error.name === 'NotAllowedError') {
          current.state = 'ready';
          this.emit();
        } else {
          fail(error);
        }
      }
    };
    const next = async (): Promise<void> => {
      if (this.current !== current) return;
      const input = chunks.shift();
      if (!input) {
        this.stop();
        return;
      }
      current.state = 'loading';
      this.emit();
      const { signal } = current.abort;
      let onAbort!: () => void;
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
      });
      const timeout = setTimeout(
        () => current.abort.abort(new SpeechPlaybackTimeoutError('Speech generation timed out')),
        60_000,
      );
      try {
        const result = await Promise.race([this.synthesize(input, signal), aborted]);
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        if (this.current !== current) return;
        if (current.url) URL.revokeObjectURL(current.url);
        const bytes = Uint8Array.from(atob(result.audioBase64), (value) => value.charCodeAt(0));
        if (!bytes.length) throw new Error('Speech generation returned empty audio');
        current.url = URL.createObjectURL(new Blob([bytes], { type: result.mimeType }));
        current.audio.src = current.url;
        await current.play();
      } catch (error) {
        fail(error);
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
      }
    };
    current.audio.onended = () => {
      void next();
    };
    current.audio.onerror = () => fail(new Error('Speech playback failed'));
    await next();
  };
}

export const readAloudPlayer = new ReadAloudPlayer();
