import { AgentRuntimeErrorType } from '@lobechat/types';
import { ModelProvider } from 'model-bank';
import livekitModels from 'model-bank/livekit';

import { createOpenAICompatibleRuntime } from '../../core/openaiCompatible';
import { OpenAICompatibleClient } from '../../core/openaiCompatible/client';
import type { ConstructorOptions } from '../../core/openaiCompatible/factoryOptions';
import type {
  ASROptions,
  ASRPayload,
  ChatMethodOptions,
  ChatStreamPayload,
  GenerateObjectOptions,
  GenerateObjectPayload,
  TextToSpeechOptions,
  TextToSpeechPayload,
} from '../../types';
import { AgentRuntimeError } from '../../utils/createError';
import { resolveMappedModelId } from '../../utils/modelIdMapping';
import { createLiveKitInferenceToken, LIVEKIT_INFERENCE_BASE_URL } from './auth';
import { createLiveKitSpeech, transcribeLiveKitAudio } from './speech';

export interface LiveKitRuntimeOptions {
  apiSecret?: string;
}

const LiveKitChatRuntime = createOpenAICompatibleRuntime({
  baseURL: LIVEKIT_INFERENCE_BASE_URL,
  customClient: {
    createClient: ({
      apiKey,
      apiSecret,
      fetch: customFetch,
      ...options
    }: ConstructorOptions<LiveKitRuntimeOptions>) => {
      if (!apiKey?.trim() || !apiSecret?.trim())
        throw AgentRuntimeError.createError(AgentRuntimeErrorType.InvalidProviderAPIKey, {
          message: 'LiveKit Inference requires both a project API key and API secret.',
        });
      return new OpenAICompatibleClient({
        ...options,
        apiKey: 'livekit-inference',
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set(
            'Authorization',
            `Bearer ${await createLiveKitInferenceToken(apiKey.trim(), apiSecret.trim())}`,
          );
          return (customFetch || fetch)(input, { ...init, headers });
        },
      });
    },
  },
  models: async () => livekitModels.map(({ id, displayName, type }) => ({ id, displayName, type })),
  provider: ModelProvider.LiveKit,
});

/** LiveKit's inference gateway uses chat completions and native speech WebSockets. */
export class LobeLiveKitAI extends LiveKitChatRuntime {
  private readonly credentials: { apiKey: string; apiSecret: string };
  private readonly mappingOptions: Pick<ConstructorOptions, 'modelIdMapping'>;

  constructor(options: ConstructorOptions<LiveKitRuntimeOptions> = {}) {
    super(options);
    this.credentials = { apiKey: options.apiKey!.trim(), apiSecret: options.apiSecret!.trim() };
    this.mappingOptions = { modelIdMapping: options.modelIdMapping };
  }

  override chat(payload: ChatStreamPayload, options?: ChatMethodOptions) {
    // Mirror the Agents SDK's sampling restrictions for OpenAI reasoning models.
    const unsupported = new Set([
      'temperature',
      'top_p',
      'presence_penalty',
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'top_logprobs',
      'n',
    ]);
    const model = resolveMappedModelId(payload.model, this.mappingOptions);
    const compatiblePayload = model.split('/').at(-1)?.startsWith('gpt-5')
      ? (Object.fromEntries(
          Object.entries(payload).filter(([key]) => !unsupported.has(key)),
        ) as unknown as ChatStreamPayload)
      : payload;
    return super.chat({ ...compatiblePayload, apiMode: 'chatCompletion' }, options);
  }

  override generateObject(payload: GenerateObjectPayload, options?: GenerateObjectOptions) {
    return super.generateObject({ ...payload, responseApi: false }, options);
  }

  override textToSpeech(payload: TextToSpeechPayload, options?: TextToSpeechOptions) {
    return createLiveKitSpeech(
      { ...payload, model: resolveMappedModelId(payload.model, this.mappingOptions) },
      { ...options, ...this.credentials, baseURL: this.baseURL! },
    );
  }

  override transcribe(payload: ASRPayload, options?: ASROptions) {
    return transcribeLiveKitAudio(
      { ...payload, model: resolveMappedModelId(payload.model, this.mappingOptions) },
      { ...options, ...this.credentials, baseURL: this.baseURL! },
    );
  }
}
