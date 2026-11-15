import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { z } from 'zod';

const ticketSchema = z.object({
  userId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  provider: z.string().min(1),
  model: z.string().min(1),
  expiresAt: z.number(),
});
type Ticket = z.infer<typeof ticketSchema>;
const key = (secret: string) =>
  createHash('sha256').update(`lobehub.voice.ticket:${secret}`).digest();

/** This envelope contains a reference to provider settings, never provider credentials. */
export const issueCredentialTicket = (payload: Omit<Ticket, 'expiresAt'>, secret: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ ...payload, expiresAt: Date.now() + 120_000 })),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
};

export const redeemCredentialTicket = (ticket: string, signature: string, secret: string) => {
  const expected = createHmac('sha256', secret)
    .update(`lobehub.voice.credentials:${ticket}`)
    .digest();
  const actual = Buffer.from(signature, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('Invalid worker authentication');
  const bytes = Buffer.from(ticket, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const payload = ticketSchema.parse(
    JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()),
  );
  if (payload.expiresAt <= Date.now()) throw new Error('Expired voice credential ticket');
  return payload;
};
