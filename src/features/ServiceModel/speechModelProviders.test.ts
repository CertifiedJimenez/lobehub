import type { EnabledAiModel, EnabledProvider } from 'model-bank';
import { describe, expect, it } from 'vitest';

import { speechModelProviders } from './speechModelProviders';

const model = (id: string, patch: Partial<EnabledAiModel> = {}): EnabledAiModel => ({
  abilities: {},
  id,
  providerId: 'custom-speech',
  type: 'tts',
  ...patch,
});
const providers: EnabledProvider[] = [{ id: 'custom-speech', source: 'custom' }];

describe('speechModelProviders', () => {
  it('offers visible enabled TTS models from the enabled catalog, including custom providers', () => {
    const result = speechModelProviders(
      [
        model('speech/model'),
        model('chat', { type: 'chat' }),
        model('transcription', { type: 'asr' }),
        model('disabled', { enabled: false }),
        model('hidden', { visible: false }),
        model('disabled-provider', { providerId: 'other' }),
      ],
      providers,
    );

    expect(
      result.map(({ name, children }) => ({ name, ids: children.map(({ id }) => id) })),
    ).toEqual([{ ids: ['speech/model'], name: 'custom-speech' }]);
  });

  it('omits providers without speech output models', () => {
    expect(speechModelProviders([], providers)).toEqual([]);
    expect(speechModelProviders([model('speech')], [])).toEqual([]);
  });
});
