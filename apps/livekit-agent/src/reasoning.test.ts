// @vitest-environment node
import { ReadableStream } from 'node:stream/web';

import { initializeLogger, llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';

import type { LobeHubBridge } from './bridge';
import { LobeHubReasoning } from './reasoning';

initializeLogger({ pretty: false, level: 'silent' });

describe('LobeHub reasoning adapter', () => {
  it('registers a native reasoning stage and delegates to the selected LobeHub runtime', async () => {
    const run = vi.fn(
      () =>
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue('Selected harness reply');
            controller.close();
          },
        }),
    );
    const runtime = new LobeHubReasoning({ run } as unknown as LobeHubBridge);
    expect(runtime).toBeInstanceOf(llm.LLM);
    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({ role: 'user', content: 'Hello' });
    const stream = runtime.chat({ chatCtx });
    const result = await stream.collect();
    expect(run).toHaveBeenCalledExactlyOnceWith('Hello');
    expect(result.text).toBe('Selected harness reply');
    stream.close();
  });
});
