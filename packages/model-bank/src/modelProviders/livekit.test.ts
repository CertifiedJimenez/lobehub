import { describe, expect, it, vi } from 'vitest';

import { loadModels, LOBE_DEFAULT_MODEL_LIST } from '../aiModels';
import livekitModels from '../aiModels/livekit';
import { ModelProvider } from '../const/modelProvider';
import { DEFAULT_MODEL_PROVIDER_LIST, getProviderDisplayName, LiveKitProviderCard } from './index';

const getModels = () => LOBE_DEFAULT_MODEL_LIST.filter((model) => model.providerId === 'livekit');

describe('LiveKit built-in provider', () => {
  it('resolves a native provider and a supported chat connection-check model', () => {
    expect(ModelProvider.LiveKit).toBe('livekit');
    expect(DEFAULT_MODEL_PROVIDER_LIST.find((provider) => provider.id === 'livekit')).toBe(
      LiveKitProviderCard,
    );
    expect(getProviderDisplayName('livekit')).toBe('LiveKit');
    expect(getModels().find((model) => model.id === LiveKitProviderCard.checkModel)?.type).toBe(
      'chat',
    );
    expect(LiveKitProviderCard.settings).toMatchObject({
      disableBrowserRequest: true,
      showAddNewModel: false,
      showModelFetcher: false,
    });
  });

  it('loads chat, recognition, and synthesis from built-ins without network discovery', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const models = (await loadModels()).filter((model) => model.providerId === 'livekit');
      expect(models).toEqual(getModels());
      expect(models.filter((model) => model.type === 'chat')).toHaveLength(3);
      expect(models.filter((model) => model.type === 'asr')).toHaveLength(4);
      expect(models.filter((model) => model.type === 'tts')).toHaveLength(4);
      expect(models.every((model) => model.source === 'builtin' && model.enabled)).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
      expect(new Set(models.map((model) => model.id)).size).toBe(models.length);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses gateway IDs and a model-specific default voice for every synthesis card', () => {
    for (const model of livekitModels) {
      expect(model.id).toMatch(/^[^/]+\/.+/);
      if (model.type !== 'tts') continue;
      const defaultVoice = model.parameters?.voice?.default;
      expect(defaultVoice).toBeTruthy();
      if (model.voices) {
        expect(model.voices.some((voice) => voice.id === defaultVoice)).toBe(true);
      }
      expect(model.parameters?.speed).toBeUndefined();
    }
    for (const retired of [
      'cartesia/sonic-2',
      'speechmatics/enhanced',
      'google/gemini-2.5-flash',
    ]) {
      expect(getModels().some((model) => model.id === retired)).toBe(false);
    }
  });
});
