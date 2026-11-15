import { createHmac } from 'node:crypto';

import type { ConversationTTSCredentials } from './conversationTTS.js';

export const fetchConversationCredentials = async (
  ticket: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ConversationTTSCredentials> => {
  if (!env.LOBEHUB_URL || !env.LIVEKIT_API_SECRET)
    throw new Error(
      'Set LOBEHUB_URL and LIVEKIT_API_SECRET in the Conversation worker deployment.',
    );
  const url = new URL('/trpc/lambda/livekit.credentials', env.LOBEHUB_URL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password
  )
    throw new Error('LOBEHUB_URL must use HTTPS, except for loopback local development.');
  const signature = createHmac('sha256', env.LIVEKIT_API_SECRET)
    .update(`lobehub.voice.credentials:${ticket}`)
    .digest('hex');
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { ticket, signature } }),
  });
  if (!response.ok)
    throw new Error('Could not load the selected speech provider credentials from LobeHub.');
  const body = (await response.json()) as {
    result?: { data?: { json?: ConversationTTSCredentials } };
  };
  const credentials = body.result?.data?.json;
  if (!credentials?.apiKey || !credentials.model || !credentials.provider)
    throw new Error('LobeHub returned invalid speech provider credentials.');
  return credentials;
};
