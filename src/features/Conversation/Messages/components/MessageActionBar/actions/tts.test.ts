import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readAloudPlayer } from '@/features/Conversation/ReadAloud/player';
import { synthesizeSpeech } from '@/services/tts';

import type { MessageActionContext } from '../types';
import { ttsAction } from './tts';

vi.mock('@/services/tts', () => ({
  SpeechOutputNotConfiguredError: class extends Error {},
  synthesizeSpeech: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/Conversation/store', () => ({
  useConversationStore: (select: (state: unknown) => unknown) =>
    select({ context: { agentId: 'agent', topicId: 'topic' } }),
}));

const context = (id: string): MessageActionContext => ({
  id,
  role: 'assistant',
  data: {
    id,
    content: 'This is a spoken reply.',
    role: 'assistant',
  } as MessageActionContext['data'],
});

afterEach(() => {
  readAloudPlayer.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('read-aloud toolbar ownership', () => {
  it('keeps pending playback when the singleton toolbar moves to another message', async () => {
    const play = vi.fn(async () => {});
    vi.stubGlobal(
      'Audio',
      class {
        play = play;
        pause = vi.fn();
        load = vi.fn();
        removeAttribute = vi.fn();
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:speech');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let resolve!: (value: Awaited<ReturnType<typeof synthesizeSpeech>>) => void;
    vi.mocked(synthesizeSpeech).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result, rerender, unmount } = renderHook(({ id }) => ttsAction.useBuild(context(id)), {
      initialProps: { id: 'spoken-reply' },
    });
    let pending: unknown;
    act(() => {
      pending = result.current?.handleClick?.();
    });
    rerender({ id: 'hovered-reply' });
    // Hover controls are transient; they do not own the active audio stream.
    unmount();
    await act(async () => {
      resolve({ audioBase64: 'AQID', format: 'mp3', mimeType: 'audio/mpeg' });
      await pending;
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(readAloudPlayer.getState('spoken-reply')).toBe('playing');
  });
});
