// @vitest-environment node
import { LobeLiveKitAI } from '@lobechat/model-runtime';
import { ModelProvider } from 'model-bank';
import { expect, it, vi } from 'vitest';

import {
  buildPayloadFromKeyVaults,
  getParamsFromPayload,
  initModelRuntimeWithUserPayload,
} from './index';

vi.mock('@/server/globalConfig', () => ({ getServerAiProviderConfig: vi.fn() }));
vi.mock('@/envs/llm', () => ({
  getLLMConfig: () => ({
    LIVEKIT_INFERENCE_API_KEY: 'server-key',
    LIVEKIT_INFERENCE_API_SECRET: 'server-secret',
  }),
}));

it('forwards both encrypted vault fields into the builtin runtime', () => {
  const payload = buildPayloadFromKeyVaults(
    { apiKey: 'user-key', apiSecret: 'user-secret' },
    ModelProvider.LiveKit,
  );
  expect(payload).toMatchObject({
    apiKey: 'user-key',
    apiSecret: 'user-secret',
    runtimeProvider: 'livekit',
  });
  expect(
    initModelRuntimeWithUserPayload(ModelProvider.LiveKit, payload)['_runtime'],
  ).toBeInstanceOf(LobeLiveKitAI);
});

it('uses the inference-specific deployment pair only when no user credentials are supplied', () => {
  expect(getParamsFromPayload(ModelProvider.LiveKit, {})).toMatchObject({
    apiKey: 'server-key',
    apiSecret: 'server-secret',
  });
  expect(getParamsFromPayload(ModelProvider.LiveKit, { apiKey: 'user-key' })).toMatchObject({
    apiKey: 'user-key',
    apiSecret: undefined,
  });
  expect(() =>
    initModelRuntimeWithUserPayload(ModelProvider.LiveKit, { apiKey: 'user-key' }),
  ).toThrow();
});

it('does not expose deployment credentials to a custom runtime or endpoint', () => {
  expect(getParamsFromPayload('custom-livekit', { runtimeProvider: 'livekit' })).toMatchObject({
    apiKey: undefined,
    apiSecret: undefined,
  });
  expect(
    getParamsFromPayload(ModelProvider.LiveKit, { baseURL: 'https://other.example/v1' }),
  ).toMatchObject({ apiKey: undefined, apiSecret: undefined });
});
