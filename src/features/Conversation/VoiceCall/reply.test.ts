import { describe, expect, it } from 'vitest';

import { getVoiceReply } from './reply';

describe('getVoiceReply', () => {
  it('reads the final reply after tools, excluding reasoning and unrelated operations', () => {
    expect(
      getVoiceReply(
        [
          { id: 'user', role: 'user', content: 'Find it' },
          { id: 'call', parentId: 'user', role: 'assistant', content: 'Searching', tools: [{}] },
          { id: 'tool', parentId: 'call', role: 'tool', content: 'Tool result' },
          { id: 'answer', parentId: 'tool', role: 'assistant', content: 'Here it is.' },
          { id: 'other', parentId: 'someone-else', role: 'assistant', content: 'Unrelated' },
        ],
        'user',
      ),
    ).toBe('Here it is.');
  });

  it('speaks final Codex text even when its row also contains CLI tool events', () => {
    expect(
      getVoiceReply(
        [
          { id: 'user', role: 'user', content: 'Hello' },
          {
            id: 'assistant',
            parentId: 'user',
            role: 'assistant',
            content: 'Hello back.',
            tools: [{}],
          },
          { id: 'tool', parentId: 'assistant', role: 'tool', content: 'Internal CLI event' },
        ],
        'user',
      ),
    ).toBe('Hello back.');
  });
  it('does not cross into another user turn when selecting the reply', () => {
    expect(
      getVoiceReply(
        [
          { id: 'user', role: 'user' },
          { id: 'answer', parentId: 'user', role: 'assistant', content: 'First reply' },
          { id: 'next-user', parentId: 'answer', role: 'user' },
          { id: 'next-answer', parentId: 'next-user', role: 'assistant', content: 'Another reply' },
        ],
        'user',
      ),
    ).toBe('First reply');
  });
  it('handles out-of-order persisted tool results', () => {
    expect(
      getVoiceReply(
        [
          { id: 'answer', parentId: 'tool', role: 'assistant', content: 'Done' },
          { id: 'tool', parentId: 'call', role: 'tool' },
          { id: 'call', parentId: 'user', role: 'assistant', tools: [{}] },
        ],
        'user',
      ),
    ).toBe('Done');
  });

  it('does not read a failed response or tool output as the answer', () => {
    expect(() =>
      getVoiceReply(
        [
          {
            id: 'error',
            parentId: 'user',
            role: 'assistant',
            content: 'Secret provider error',
            error: {},
          },
          { id: 'tool', parentId: 'user', role: 'tool', content: 'Raw tool output' },
        ],
        'user',
      ),
    ).toThrow('did not return');
  });
});
