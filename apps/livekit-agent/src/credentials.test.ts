// @vitest-environment node
import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchConversationCredentials } from './credentials';

afterEach(() => vi.unstubAllGlobals());
describe('speech credential exchange', () => {
  it('uses only the trusted deployment URL and authenticates the opaque ticket', async () => {
    const credentials = { apiKey: 'provider-secret', provider: 'fishaudio', model: 's2-pro' };
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ result: { data: { json: credentials } } }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await fetchConversationCredentials('opaque-ticket', {
        LOBEHUB_URL: 'https://lobe.example',
        LIVEKIT_API_SECRET: 'worker-secret',
      }),
    ).toEqual(credentials);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://lobe.example/trpc/lambda/livekit.credentials');
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body).json).toEqual({
      ticket: 'opaque-ticket',
      signature: createHmac('sha256', 'worker-secret')
        .update('lobehub.voice.credentials:opaque-ticket')
        .digest('hex'),
    });
  });
  it('rejects remote plaintext credential exchange before network access', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      fetchConversationCredentials('opaque-ticket', {
        LOBEHUB_URL: 'http://lobe.example',
        LIVEKIT_API_SECRET: 'worker-secret',
      }),
    ).rejects.toThrow('HTTPS');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fails before network access if deployment exchange is not configured', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchConversationCredentials('opaque-ticket', {})).rejects.toThrow('LOBEHUB_URL');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
