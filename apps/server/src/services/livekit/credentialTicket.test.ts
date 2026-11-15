// @vitest-environment node
import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { issueCredentialTicket, redeemCredentialTicket } from './credentialTicket';

const secret = 'deployment-secret';
const sign = (ticket: string) =>
  createHmac('sha256', secret).update(`lobehub.voice.credentials:${ticket}`).digest('hex');
afterEach(() => vi.useRealTimers());

describe('worker credential tickets', () => {
  it('keeps the user reference opaque and binds provider and model', () => {
    const ticket = issueCredentialTicket(
      { userId: 'private-user', provider: 'fishaudio', model: 's2-pro' },
      secret,
    );
    expect(ticket).not.toContain('private-user');
    expect(redeemCredentialTicket(ticket, sign(ticket), secret)).toMatchObject({
      userId: 'private-user',
      provider: 'fishaudio',
      model: 's2-pro',
    });
  });
  it('requires deployment authentication even when the participant can see the ticket', () => {
    const ticket = issueCredentialTicket(
      { userId: 'user', provider: 'fishaudio', model: 's2-pro' },
      secret,
    );
    expect(() => redeemCredentialTicket(ticket, '00'.repeat(32), secret)).toThrow('authentication');
    expect(() => redeemCredentialTicket(`${ticket}x`, sign(ticket), secret)).toThrow();
  });
  it('expires before a room can reuse old credentials', () => {
    vi.useFakeTimers();
    const ticket = issueCredentialTicket(
      { userId: 'user', provider: 'fishaudio', model: 's2-pro' },
      secret,
    );
    vi.advanceTimersByTime(120_001);
    expect(() => redeemCredentialTicket(ticket, sign(ticket), secret)).toThrow('Expired');
  });
});
