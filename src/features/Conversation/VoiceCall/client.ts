import {
  MAX_SPEECH_PAYLOAD,
  SPEECH_REQUEST_TOPIC,
  SPEECH_RESPONSE_TOPIC,
  type SpeechRequest,
  speechRequestSchema,
  type SpeechResponse,
  speechResponseSchema,
  VOICE_CANCEL_METHOD,
  VOICE_RESULT_TOPIC,
  VOICE_TURN_METHOD,
  voiceCancelSchema,
  voiceTurnSchema,
} from '@lobechat/livekit-bridge';
import { DisconnectReason, ParticipantKind, Room, RoomEvent, RpcError } from 'livekit-client';

import { waitForVoiceWorker } from './waitForWorker';

interface VoiceCallOptions {
  onDisconnected: (unexpected: boolean) => void;
  onError: (error: unknown) => void;
  onSpeech: (request: SpeechRequest, signal: AbortSignal) => Promise<SpeechResponse>;
  onTurn: (text: string, signal: AbortSignal) => Promise<string>;
  onWorking: (working: boolean) => void;
}

/** One room owns its microphone, remote audio, and cancellable agent turn. */
export class VoiceCallClient {
  readonly room = new Room({ adaptiveStream: true, dynacast: true });
  private active?: { controller: AbortController; requestId: string };
  private closed = false;
  private readonly speech = new Set<AbortController>();
  private readonly connectionController = new AbortController();

  constructor(private readonly options: VoiceCallOptions) {
    this.room.on(RoomEvent.Disconnected, (reason) => {
      if (this.closed) return;
      void this.close();
      this.options.onDisconnected(reason !== DisconnectReason.CLIENT_INITIATED);
    });
    const assertWorker = (identity: string) => {
      if (
        this.closed ||
        this.room.remoteParticipants.get(identity)?.kind !== ParticipantKind.AGENT
      ) {
        throw new RpcError(1500, 'Only the voice worker may request agent turns');
      }
    };
    this.room.registerTextStreamHandler(SPEECH_REQUEST_TOPIC, (reader, participant) => {
      const controller = new AbortController();
      this.speech.add(controller);
      void (async () => {
        assertWorker(participant.identity);
        let payload = '';
        for await (const chunk of reader) {
          payload += chunk;
          if (payload.length > MAX_SPEECH_PAYLOAD) throw new Error('Speech request is too large');
        }
        const request = speechRequestSchema.parse(JSON.parse(payload));
        let result: SpeechResponse;
        try {
          result = speechResponseSchema.parse(
            await this.options.onSpeech(request, controller.signal),
          );
        } catch (error) {
          if (!controller.signal.aborted) this.options.onError(error);
          result = { requestId: request.requestId, ok: false };
        }
        if (this.closed) return;
        await this.room.localParticipant.sendText(JSON.stringify(result), {
          destinationIdentities: [participant.identity],
          topic: SPEECH_RESPONSE_TOPIC,
        });
      })()
        .catch((error) => {
          if (!this.closed) this.options.onError(error);
        })
        .finally(() => this.speech.delete(controller));
    });
    this.room.registerRpcMethod(VOICE_TURN_METHOD, async ({ callerIdentity, payload }) => {
      assertWorker(callerIdentity);
      const { requestId, text } = voiceTurnSchema.parse(JSON.parse(payload));
      if (this.active) throw new RpcError(1501, 'An agent turn is already running');
      const controller = new AbortController();
      this.active = { controller, requestId };
      this.options.onWorking(true);
      // Acknowledge immediately: tools/approvals can take longer than an RPC timeout.
      void this.runTurn(requestId, text, callerIdentity, controller);
      return 'accepted';
    });
    this.room.registerRpcMethod(VOICE_CANCEL_METHOD, async ({ callerIdentity, payload }) => {
      assertWorker(callerIdentity);
      const { requestId } = voiceCancelSchema.parse(JSON.parse(payload));
      if (this.active?.requestId === requestId) this.active.controller.abort();
      return 'cancelled';
    });
  }

  private async runTurn(
    requestId: string,
    text: string,
    destination: string,
    controller: AbortController,
  ) {
    let result;
    try {
      const reply = await this.options.onTurn(text, controller.signal);
      controller.signal.throwIfAborted();
      result = { ok: true, requestId, text: reply };
    } catch (error) {
      if (controller.signal.aborted || this.closed) return;
      this.options.onError(error);
      // Never send raw application/provider errors to the speech worker.
      result = { ok: false, requestId };
    } finally {
      if (this.active?.requestId === requestId) {
        this.active = undefined;
        if (!this.closed) this.options.onWorking(false);
      }
    }
    if (this.closed) return;
    try {
      await this.room.localParticipant.sendText(JSON.stringify(result), {
        destinationIdentities: [destination],
        topic: VOICE_RESULT_TOPIC,
      });
    } catch (error) {
      if (!this.closed) this.options.onError(error);
    }
  }

  async connect(serverUrl: string, token: string) {
    await this.room.startAudio();
    await this.room.connect(serverUrl, token, {
      websocketTimeout: 10_000,
      peerConnectionTimeout: 15_000,
      maxRetries: 1,
    });
    if (this.closed) {
      await this.room.disconnect();
      return;
    }
    await this.room.localParticipant.setMicrophoneEnabled(true);
    if (this.closed) await this.room.disconnect();
    if (!this.closed) await waitForVoiceWorker(this.room, this.connectionController.signal);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.connectionController.abort();
    for (const controller of this.speech) controller.abort();
    this.speech.clear();
    this.active?.controller.abort();
    this.active = undefined;
    await this.room.disconnect(true);
    this.room.removeAllListeners();
  }
}
