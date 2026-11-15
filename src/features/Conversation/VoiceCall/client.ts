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
  type VoiceResult,
  voiceTurnSchema,
} from '@lobechat/livekit-bridge';
import { DisconnectReason, ParticipantKind, Room, RoomEvent, RpcError } from 'livekit-client';

import { waitForVoiceWorker } from './waitForWorker';

interface VoiceCallOptions {
  onDisconnected: (unexpected: boolean) => void;
  onError: (error: unknown) => void;
  onSpeech: (request: SpeechRequest, signal: AbortSignal) => Promise<SpeechResponse>;
  onTurn: (
    text: string,
    signal: AbortSignal,
    onText: (text: string) => Promise<void>,
  ) => Promise<void>;
  onWorking: (working: boolean) => void;
}

/** One room owns its microphone, remote audio, and cancellable agent turn. */
export class VoiceCallClient {
  readonly room = new Room({ adaptiveStream: true, dynacast: true });
  private active?: { controller: AbortController; requestId: string; done: Promise<void> };
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
      if (this.active?.controller.signal.aborted) await this.active.done;
      if (this.active) throw new RpcError(1501, 'An agent turn is already running');
      const controller = new AbortController();
      const active = { controller, requestId, done: Promise.resolve() };
      this.active = active;
      this.options.onWorking(true);
      // Acknowledge immediately: tools/approvals can take longer than an RPC timeout.
      active.done = this.runTurn(requestId, text, callerIdentity, controller);
      return 'accepted';
    });
    this.room.registerRpcMethod(VOICE_CANCEL_METHOD, async ({ callerIdentity, payload }) => {
      assertWorker(callerIdentity);
      const { requestId } = voiceCancelSchema.parse(JSON.parse(payload));
      if (this.active?.requestId === requestId) {
        this.active.controller.abort();
        await this.active.done;
      }
      return 'cancelled';
    });
  }

  private async runTurn(
    requestId: string,
    text: string,
    destination: string,
    controller: AbortController,
  ) {
    let writer: Awaited<ReturnType<Room['localParticipant']['streamText']>> | undefined;
    try {
      writer = await this.room.localParticipant.streamText({
        destinationIdentities: [destination],
        topic: VOICE_RESULT_TOPIC,
        attributes: { requestId },
      });
      const write = async (result: VoiceResult) => {
        controller.signal.throwIfAborted();
        await writer!.write(JSON.stringify(result) + '\n');
      };
      await this.options.onTurn(text, controller.signal, (chunk) =>
        write({ ok: true, requestId, text: chunk }),
      );
      await write({ ok: true, requestId, done: true });
    } catch (error) {
      if (!controller.signal.aborted && !this.closed) {
        this.options.onError(error);
        // Provider/application errors are shown locally, never spoken aloud.
        await writer?.write(JSON.stringify({ ok: false, requestId }) + '\n').catch(() => {});
      }
    } finally {
      await writer?.close().catch(() => {});
      if (this.active?.requestId === requestId) {
        this.active = undefined;
        if (!this.closed) this.options.onWorking(false);
      }
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
