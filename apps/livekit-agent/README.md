# LobeHub Conversation worker

LiveKit is deployment infrastructure for the native conversation experience.
Configure the LobeHub server and worker with the same transport credentials:

```dotenv
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
# Worker-only: the trusted LobeHub backend reachable from the worker.
LOBEHUB_URL=http://localhost:3010
```

Use production credentials for public deployments. The server exposes only a
configured capability flag and room-scoped participant tokens to clients.
LobeHub's existing SSRF policy governs server administration requests, including
whether private network addresses are allowed.

Choose **Speech Recognition** and **Speech Synthesis** in **Settings → Service
Models**. Provider credentials and endpoints come from the existing **AI
Providers** configuration. A model's saved default voice is respected; an explicit
conversation voice preference for that same model takes precedence.

## Local development

From the repository root:

```sh
bun run dev:livekit
pnpm --filter @lobechat/livekit-agent download-files
bun run dev:voice
```

The worker must register with the configured LiveKit deployment before calling.
On Home, the composer Conversation action starts a conversation with the selected
agent. Inside a conversation, it reuses the current conversation.

## Runtime

LiveKit supplies microphone transport, Silero VAD, interruption, remote playback,
and media controls. When a LiveKit Inference model is selected, the worker uses LiveKit's native
inference SDK for recognition or synthesis. Other providers use the browser's
bounded speech bridge and LobeHub's existing authenticated ASR/TTS routes, except
for the direct Fish streaming path below. Native Service Model choices supply
both models; room transport credentials are separate from provider credentials.

Recognized text runs through the mounted conversation's normal `sendMessage`
path. Its selected model/harness, tools, approval UI, cancellation and history
remain owned by LobeHub. The LiveKit LLM adapter delegates reasoning to LobeHub.
It waits for the completed reply before synthesis. Closing or navigating away
disconnects media and cancels pending operations.

Video mode allows camera/screen sharing. A JPEG frame is attached to each spoken
turn when the selected agent accepts images and is saved through the normal
upload path. Microphone-only mode receives no camera/screen publication grant.

## Direct Fish Audio streaming

For a Fish Audio runtime (including a custom provider with Fish SDK type), the
worker uses LiveKit's official `@livekit/agents-plugin-fishaudio` plugin. It streams
PCM over WebSocket into LiveKit playback. It receives the selected model's saved
provider key and endpoint through an authenticated server-to-server exchange.
No separate `FISH_*` worker credentials are needed.

Dispatch metadata includes only an opaque, two-minute ticket bound to the user,
provider and model. Exchanging it requires an HMAC made with the deployment's
LiveKit secret. A room participant who sees the ticket cannot redeem it. Provider
credentials are never stored in room metadata or returned in the session response.
The worker uses only its trusted deployment `LOBEHUB_URL` for this exchange.
HTTPS is required, except for loopback local development (`localhost`,
`127.0.0.1`, or `::1`). Container deployments use an HTTPS backend or proxy.

PCM sample rate and speaking speed follow the selected model's parameter defaults,
then the native Fish model card (44100 Hz, speed 1). The selected voice is preserved.
A local Fish-compatible endpoint must implement `/v1/tts/live` with Fish's
MessagePack start/text/flush/stop and audio/finish protocol. An HTTP-only endpoint
cannot serve this streaming path. Its address must be reachable from the worker;
`127.0.0.1` refers to the worker's own machine.

Other OpenAI-compatible TTS providers, such as MLX Audio, use the native speech
bridge with their saved provider endpoint and model. Custom voice IDs refer to
profiles managed by that provider.
