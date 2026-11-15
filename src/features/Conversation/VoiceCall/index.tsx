'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router';

import type { VoiceComposerControl } from '@/features/ChatInput/SendArea/presentation';
import { useChatInputStore } from '@/features/ChatInput/store';
import { useVoiceOverlayTarget } from '@/features/ChatInput/voiceOverlayContext';
import { useMediaUploadAbility } from '@/hooks/useMediaUploadAbility';
import { handleConversationSpeech } from '@/services/conversation';
import { livekitService } from '@/services/livekit';
import { messageService } from '@/services/message';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import { useConversationStore, useConversationStoreApi } from '../store';
import { CallAudio, CallMicrophone, CallVisualizer } from './CallPanel';
import { VoiceCallClient } from './client';
import { notifyVoiceCallError } from './notifyError';
import { getVoiceReply } from './reply';
import { isVoiceCallSpeechConfigured } from './speechModels';
import { uploadTalkFrame } from './uploadFrame';
import { waitForVoiceReply } from './waitForReply';
import { VoiceWorkerUnavailableError } from './waitForWorker';

export const VoiceCall = ({
  children,
}: {
  children: (control: VoiceComposerControl) => ReactNode;
}) => {
  const overlayTarget = useVoiceOverlayTarget();
  const setConversationActive = useChatInputStore((s) => s.setConversationActive);
  const configured = useServerConfigStore((s) => s.serverConfig.livekitConfigured);
  const asr = useUserStore((s) => settingsSelectors.currentSystemAgent(s).asr);
  const tts = useUserStore((s) => settingsSelectors.currentSystemAgent(s).tts);
  const speechConfigured = isVoiceCallSpeechConfigured({ asr, tts });
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const context = useConversationStore((s) => s.context);
  const writable = useConversationStore((s) => s.composerTarget.writable);
  const store = useConversationStoreApi();
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'working'>('idle');
  const [video, setVideo] = useState(false);
  const [activeClient, setActiveClient] = useState<VoiceCallClient | undefined>(undefined);
  const model = useAgentStore(agentByIdSelectors.getAgentModelById(context.agentId));
  const provider = useAgentStore(agentByIdSelectors.getAgentModelProviderById(context.agentId));
  const { canUploadImage } = useMediaUploadAbility(model, provider, context.agentId);
  const call = useRef<{ client: VoiceCallClient; roomName?: string } | undefined>(undefined);

  const end = useCallback(async () => {
    const current = call.current;
    call.current = undefined;
    setActiveClient(undefined);
    setStatus('idle');
    setConversationActive(false);
    setVideo(false);
    if (!current) return;
    await current.client.close().catch(() => {});
    if (current.roomName) await livekitService.endSession(current.roomName).catch(() => {});
  }, [setConversationActive]);

  // A call belongs to one existing conversation. Navigation must release the mic.
  useEffect(
    () => () => {
      void end();
    },
    [context.agentId, context.topicId, end],
  );

  const start = useCallback(async () => {
    if (!configured) return;
    if (!speechConfigured) {
      navigate('/settings/service-model');
      return;
    }
    if (call.current || !context.topicId || !writable) return;
    setStatus('connecting');
    const client = new VoiceCallClient({
      onDisconnected: (unexpected) => {
        if (unexpected) notifyVoiceCallError();
        void end();
      },
      onError: notifyVoiceCallError,
      onSpeech: handleConversationSpeech,
      onWorking: (working) => setStatus(working ? 'working' : 'connected'),
      onTurn: async (text, signal) => {
        const state = store.getState();
        if (
          !state.composerTarget.writable ||
          messageMapKey(state.context) !== messageMapKey(context)
        ) {
          throw new Error('The conversation is no longer available');
        }
        if (operationSelectors.isInputVisiblyLoadingByContext(context)(useChatStore.getState())) {
          throw new Error('Wait for the current agent turn to finish');
        }
        const frame = canUploadImage ? await client.captureFrame() : undefined;
        const files = frame ? [await uploadTalkFrame(frame, context.agentId, signal)] : undefined;
        signal.throwIfAborted();
        const result = await useChatStore.getState().sendMessage({
          context,
          inputEditor: null,
          message: text,
          files,
          preserveComposer: true,
          signal,
        });
        signal.throwIfAborted();
        if (!result) throw new Error('The voice turn was not accepted');
        return waitForVoiceReply({
          signal,
          subscribe: (listener) => useChatStore.subscribe(listener),
          isRunning: () =>
            operationSelectors.isInputLoadingByContext(context)(useChatStore.getState()),
          readReply: async () =>
            getVoiceReply(await messageService.getMessages(context), result.userMessageId),
        });
      },
    });
    const current = { client, roomName: undefined as string | undefined };
    call.current = current;
    setConversationActive(true);
    setActiveClient(client);
    try {
      const session = await livekitService.createSession();
      current.roomName = session.roomName;
      if (call.current !== current) {
        await livekitService.endSession(session.roomName);
        return;
      }
      setVideo(session.config.mode === 'video' && canUploadImage);
      await client.connect(session.serverUrl, session.token);
      if (call.current === current) setStatus('connected');
    } catch (cause) {
      if (call.current === current) {
        notifyVoiceCallError(
          cause,
          cause instanceof VoiceWorkerUnavailableError ? 'workerUnavailable' : 'error',
        );
        await end();
      }
    }
  }, [
    configured,
    speechConfigured,
    navigate,
    context,
    writable,
    store,
    canUploadImage,
    end,
    setConversationActive,
  ]);

  useEffect(() => {
    if (search.get('conversation') !== 'start' || !context.topicId || !writable) return;
    const next = new URLSearchParams(search);
    next.delete('conversation');
    setSearch(next, { replace: true });
    void start();
  }, [search, context.topicId, writable, start, setSearch]);
  const active = status !== 'idle';

  const visualizer = activeClient ? (
    <CallVisualizer room={activeClient.room} video={video} />
  ) : null;
  if (!configured) return null;

  return (
    <>
      {children({
        active,
        disabled: !context.topicId || !writable,
        microphone:
          activeClient && active ? (
            <CallMicrophone room={activeClient.room} onError={notifyVoiceCallError} />
          ) : undefined,
        onClick: () => void (active ? end() : start()),
      })}
      {activeClient && <CallAudio room={activeClient.room} />}
      {overlayTarget ? createPortal(visualizer, overlayTarget) : visualizer}
    </>
  );
};
