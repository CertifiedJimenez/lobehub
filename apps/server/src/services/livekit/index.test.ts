// @vitest-environment node
import { createHmac } from 'node:crypto';

import {
  conversationConfigSchema,
  getConversationTTSBackend,
  voiceJobSchema,
} from '@lobechat/livekit-bridge';
import { ssrfSafeFetch } from '@lobechat/ssrf-safe-fetch';
import { TokenVerifier } from 'livekit-server-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { redeemCredentialTicket } from './credentialTicket';
import { LivekitService, voiceRoomPrefix } from './index';

const connection = {
  url: 'ws://localhost:7880',
  apiKey: 'devkey',
  apiSecret: 'development-secret-for-tests-only',
};

vi.mock('@lobechat/ssrf-safe-fetch', () => ({ ssrfSafeFetch: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('LivekitService', () => {
  it('dispatches independent opaque credential references for selected LiveKit speech models', async () => {
    const asr = { provider: 'livekit', model: 'deepgram/flux-general-en' };
    const tts = { provider: 'livekit', model: 'cartesia/sonic-3.6' };
    const session = await new LivekitService('alice', connection, 'workspace-a').createSession(
      conversationConfigSchema.parse({ speechBackend: 'livekit', ttsBackend: 'livekit', tts }),
      true,
      asr,
    );
    const claims = await new TokenVerifier('devkey', connection.apiSecret).verify(session.token);
    const metadata = JSON.parse(claims.roomConfig!.agents![0].metadata!);
    const redeem = (ticket: string) =>
      redeemCredentialTicket(
        ticket,
        createHmac('sha256', connection.apiSecret)
          .update(`lobehub.voice.credentials:${ticket}`)
          .digest('hex'),
        connection.apiSecret,
      );
    expect(redeem(metadata.asrCredentialTicket)).toMatchObject({
      ...asr,
      workspaceId: 'workspace-a',
    });
    expect(redeem(metadata.credentialTicket)).toMatchObject({ ...tts, workspaceId: 'workspace-a' });
    expect(JSON.stringify(metadata)).not.toContain(connection.apiSecret);
  });
  const verifier = new TokenVerifier('devkey', 'development-secret-for-tests-only');
  it('mints short-lived, room-scoped microphone-only grants for voice mode', async () => {
    const session = await new LivekitService('alice', connection).createSession(
      conversationConfigSchema.parse({}),
    );
    const claims = await verifier.verify(session.token);
    expect(claims.video).toMatchObject({
      room: session.roomName,
      roomJoin: true,
      canPublishSources: ['microphone'],
    });
    expect(Number(claims.exp) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(300);
    expect(Number(claims.exp)).toBeGreaterThan(Date.now() / 1000);
    expect(claims.video?.roomAdmin).not.toBe(true);
    expect(session.roomName).toMatch(new RegExp('^' + voiceRoomPrefix('alice')));
    expect(session).not.toHaveProperty('apiSecret');
  });
  it('keeps grants microphone-only even with legacy video preferences', async () => {
    const session = await new LivekitService('alice', connection).createSession(
      conversationConfigSchema.parse({ mode: 'video', voice: 'nova' }),
    );
    const claims = await verifier.verify(session.token);
    expect(claims.video?.canPublishSources).toEqual(['microphone']);
    const dispatch = claims.roomConfig?.agents?.[0];
    expect(dispatch?.agentName).toBe('lobehub-voice');
    expect(JSON.parse(dispatch!.metadata!).config).toMatchObject({
      language: 'en',
      silenceMs: 700,
      speechBackend: 'lobehub',
    });
    expect(dispatch!.metadata!).not.toContain(connection.apiSecret);
    expect(JSON.parse(dispatch!.metadata!).config).not.toHaveProperty('model');
  });
  it('uses LiveKit roomCreate permission to delete an owned room', async () => {
    vi.mocked(ssrfSafeFetch).mockResolvedValue(new Response('{}'));
    const service = new LivekitService('alice', connection);
    const session = await service.createSession(conversationConfigSchema.parse({}));
    await service.endSession(session.roomName);
    const options = vi.mocked(ssrfSafeFetch).mock.calls[0][1]!;
    const headers = options.headers as Record<string, string>;
    const claims = await verifier.verify(headers.Authorization.replace('Bearer ', ''));
    expect(claims.video?.roomCreate).toBe(true);
    expect(JSON.parse(options.body as string)).toEqual({ room: session.roomName });
  });
  it('preserves a LiveKit project voice ID in the worker session', async () => {
    const session = await new LivekitService('alice', connection).createSession(
      conversationConfigSchema.parse({
        speechBackend: 'livekit',
        inference: { voice: 'v_testProjectVoice' },
      }),
    );
    const claims = await verifier.verify(session.token);
    const config = JSON.parse(claims.roomConfig!.agents![0].metadata!).config;
    expect(config.speechBackend).toBe('livekit');
    expect(config.inference).toMatchObject({
      ttsModel: 'cartesia/sonic-3',
      voice: 'v_testProjectVoice',
    });
    expect(session.config.inference.voice).toBe('v_testProjectVoice');
  });
  it('dispatches LiveKit recognition with speech from a LobeHub provider independently', async () => {
    const session = await new LivekitService('alice', connection).createSession(
      conversationConfigSchema.parse({
        speechBackend: 'livekit',
        ttsBackend: 'lobehub',
        tts: { provider: 'local-speech', model: 'local-tts' },
      }),
    );
    const claims = await verifier.verify(session.token);
    const job = voiceJobSchema.parse(JSON.parse(claims.roomConfig!.agents![0].metadata!));
    expect(job.config.speechBackend).toBe('livekit');
    expect(getConversationTTSBackend(job.config)).toBe('lobehub');
    expect(
      getConversationTTSBackend(conversationConfigSchema.parse({ speechBackend: 'livekit' })),
    ).toBe('livekit');
  });
  it('passes the selected Fish model and voice to the worker without provider credentials', async () => {
    const session = await new LivekitService('alice', connection).createSession(
      conversationConfigSchema.parse({
        ttsBackend: 'lobehub',
        tts: { provider: 'fishaudio', model: 's2-pro' },
        voice: '0123456789abcdef0123456789abcdef',
      }),
    );
    const claims = await verifier.verify(session.token);
    const metadata = claims.roomConfig!.agents![0].metadata!;
    const job = voiceJobSchema.parse(JSON.parse(metadata));
    expect(job.config.tts).toEqual({ provider: 'fishaudio', model: 's2-pro' });
    expect(job.config.voice).toBe('0123456789abcdef0123456789abcdef');
    expect(JSON.parse(metadata).config).not.toHaveProperty('inference');
    expect(metadata).not.toContain('apiKey');
    expect(metadata).not.toContain('apiSecret');
  });
  it('refuses to delete another user’s room before any network call', async () => {
    const alice = await new LivekitService('alice', connection).createSession(
      conversationConfigSchema.parse({}),
    );
    await expect(new LivekitService('bob', connection).endSession(alice.roomName)).rejects.toThrow(
      'Invalid voice room',
    );
  });
});
