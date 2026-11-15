import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReadAloudPlayer, splitSpeechText } from './player';

vi.mock('@/services/tts', () => ({ synthesizeSpeech: vi.fn() }));

class FakeAudio {
  static instances: FakeAudio[] = [];
  src = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
  constructor() {
    FakeAudio.instances.push(this);
  }
}
const audio = { audioBase64: 'AQID', format: 'mp3' as const, mimeType: 'audio/mpeg' };
const synthesize = vi.fn();
const onError = vi.fn();
let player: ReadAloudPlayer;

beforeEach(() => {
  vi.clearAllMocks();
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  synthesize.mockResolvedValue(audio);
  player = new ReadAloudPlayer(synthesize);
});
afterEach(() => {
  player.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('reply read-aloud', () => {
  it('shows loading then playing, and a second click stops playback and releases audio', async () => {
    const states: (string | undefined)[] = [];
    const unsubscribe = player.subscribe(() => states.push(player.getState('reply')));
    await player.toggle('reply', 'Hello', onError);
    expect(states).toContain('loading');
    expect(states.at(-1)).toBe('playing');
    await player.toggle('reply', 'Hello', onError);
    expect(player.getState('reply')).toBeUndefined();
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(synthesize).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('cancels pending synthesis and ignores its late result when another reply is selected', async () => {
    let resolve!: (value: typeof audio) => void;
    synthesize.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = player.toggle('first', 'First', onError);
    const signal = synthesize.mock.calls[0][1] as AbortSignal;
    await player.toggle('second', 'Second', onError);
    resolve(audio);
    await pending;
    expect(signal.aborted).toBe(true);
    expect(FakeAudio.instances[0].play).not.toHaveBeenCalled();
    expect(FakeAudio.instances[1].play).toHaveBeenCalledTimes(1);
    expect(player.getState('second')).toBe('playing');
    expect(onError).not.toHaveBeenCalled();
  });

  it('a cancelled request never plays or reports a stale error', async () => {
    let reject!: (reason: Error) => void;
    synthesize.mockReturnValueOnce(
      new Promise((_, r) => {
        reject = r;
      }),
    );
    const pending = player.toggle('reply', 'Hello', onError);
    await player.toggle('reply', 'Hello', onError);
    reject(new Error('cancelled'));
    await pending;
    expect(onError).not.toHaveBeenCalled();
    expect(FakeAudio.instances[0].play).not.toHaveBeenCalled();
  });

  it('plays long replies in order and resets when the final audio ends', async () => {
    const text = 'Hello world. '.repeat(150);
    await player.toggle('reply', text, onError);
    FakeAudio.instances[0].onended?.();
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(player.getState('reply')).toBe('playing'));
    FakeAudio.instances[0].onended?.();
    expect(player.getState('reply')).toBeUndefined();
    expect(synthesize.mock.calls.map(([input]) => input).join('')).toBe(text.trim());
  });

  it('cleans up and reports synthesis and media failures', async () => {
    synthesize.mockRejectedValueOnce(new Error('provider failure'));
    await player.toggle('reply', 'Hello', onError);
    expect(player.getState('reply')).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    await player.toggle('reply', 'Hello', onError);
    FakeAudio.instances[1].onerror?.();
    expect(player.getState('reply')).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('does not stop another reply when an inactive message unmounts', async () => {
    await player.toggle('reply', 'Hello', onError);
    player.stop('another-reply');
    expect(player.getState('reply')).toBe('playing');
  });

  it('retains generated audio when autoplay is blocked and retries from the next click', async () => {
    synthesize.mockImplementationOnce(async () => {
      FakeAudio.instances[0].play.mockRejectedValueOnce(
        new DOMException('User interaction required', 'NotAllowedError'),
      );
      return audio;
    });
    await player.toggle('reply', 'Hello', onError);
    expect(player.getState('reply')).toBe('ready');
    expect(onError).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await player.toggle('reply', 'Hello', onError);
    expect(player.getState('reply')).toBe('playing');
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(2);
  });

  it('does not stay in loading indefinitely when synthesis never completes', async () => {
    vi.useFakeTimers();
    try {
      synthesize.mockImplementationOnce(() => new Promise(() => {}));
      const pending = player.toggle('reply', 'Hello', onError);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(player.getState('reply')).toBeUndefined();
      expect((synthesize.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
      expect(onError).toHaveBeenCalledTimes(1);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports empty synthesis instead of attempting silent playback', async () => {
    synthesize.mockResolvedValueOnce({ ...audio, audioBase64: '' });
    await player.toggle('reply', 'Hello', onError);
    expect(player.getState('reply')).toBeUndefined();
    expect(FakeAudio.instances[0].play).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('preserves Unicode and respects the chunk limit for text without spaces', () => {
    const text = '🎧'.repeat(2500);
    const chunks = splitSpeechText(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((chunk) => Array.from(chunk).length <= 1000)).toBe(true);
    expect(splitSpeechText('   ')).toEqual([]);
  });
});
