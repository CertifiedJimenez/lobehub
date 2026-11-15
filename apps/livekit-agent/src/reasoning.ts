import { randomUUID } from 'node:crypto';

import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';

import type { LobeHubBridge } from './bridge.js';

/** Registers the reasoning stage with LiveKit; LobeHub executes the actual model and tools. */
export class LobeHubReasoning extends llm.LLM {
  constructor(readonly bridge: LobeHubBridge) {
    super();
  }
  label() {
    return 'lobehub.selected-agent';
  }
  chat(options: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    // Retrying an application turn could duplicate tool actions or history.
    return new LobeHubReasoningStream(this, {
      ...options,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, ...options.connOptions, maxRetry: 0 },
    });
  }
}

class LobeHubReasoningStream extends llm.LLMStream {
  constructor(
    private readonly runtime: LobeHubReasoning,
    options: ConstructorParameters<typeof llm.LLMStream>[1],
  ) {
    super(runtime, options);
  }
  protected async run() {
    const message = this.chatCtx.items.findLast(
      (item) => item.type === 'message' && item.role === 'user',
    );
    if (!message || message.type !== 'message' || !message.textContent) {
      this.queue.close();
      return;
    }
    this.abortController.signal.throwIfAborted();
    const reader = this.runtime.bridge.run(message.textContent).getReader();
    const abort = () => {
      void reader.cancel().catch(() => {});
    };
    this.abortController.signal.addEventListener('abort', abort, { once: true });
    const id = randomUUID();
    try {
      this.abortController.signal.throwIfAborted();
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        this.abortController.signal.throwIfAborted();
        this.queue.put({ id, delta: { role: 'assistant', content: result.value } });
      }
    } finally {
      this.abortController.signal.removeEventListener('abort', abort);
      reader.releaseLock();
      this.queue.close();
    }
  }
}
