'use client';

import '@livekit/components-styles';

import {
  RoomAudioRenderer,
  RoomContext,
  StartAudio,
  TrackLoop,
  useLocalParticipant,
  useTracks,
  useVoiceAssistant,
  VideoTrack,
} from '@livekit/components-react';
import { ActionIcon, Flexbox } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { type Room, Track } from 'livekit-client';
import { Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useChatInputStore } from '@/features/ChatInput/store';

import { AgentAudioVisualizerBar } from './AgentsUI/AgentAudioVisualizerBar';
import { getVoiceStatusKey } from './status';
import { selectVisualizerAudioTrack } from './visualizerAudio';

const styles = stylex.create({
  visualizer: {
    alignItems: 'center',
    paddingBlock: 4,
    width: '100%',
  },
  statusRow: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    justifyContent: 'center',
  },
  status: {
    color: cssVar.colorTextSecondary,
    fontSize: 12,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
  },
  muted: { color: cssVar.colorError },
});

const Visualizer = ({ video }: { video: boolean }) => {
  const { t } = useTranslation('chat');
  const { state, audioTrack } = useVoiceAssistant();
  const { microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const generating = useChatInputStore((s) => s.sendButtonProps?.generating);
  const activityState = generating ? 'thinking' : state;
  const visualizedTrack = selectVisualizerAudioTrack({
    state,
    microphoneEnabled: isMicrophoneEnabled,
    microphoneTrack: microphoneTrack?.audioTrack,
    agentTrack: audioTrack,
  });
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  });
  return (
    <Flexbox className={stylex.props(styles.visualizer).className} gap={8}>
      <Flexbox horizontal className={stylex.props(styles.statusRow).className}>
        <AgentAudioVisualizerBar
          audioTrack={visualizedTrack}
          barCount={5}
          size="icon"
          state={state}
          style={{ color: cssVar.colorPrimary }}
        />
        <span aria-live="polite" className={stylex.props(styles.status).className} role="status">
          {t(getVoiceStatusKey(activityState, isMicrophoneEnabled))}
        </span>
      </Flexbox>
      {video && (
        <TrackLoop tracks={tracks}>
          <VideoTrack
            style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 12 }}
          />
        </TrackLoop>
      )}
    </Flexbox>
  );
};

const Microphone = ({ onError }: { onError: (error: unknown) => void }) => {
  const { t } = useTranslation('chat');
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const size = useChatInputStore((s) => s.sendButtonProps?.size ?? 36);
  const title = t(isMicrophoneEnabled ? 'voiceCall.mute' : 'voiceCall.unmute');
  return (
    <ActionIcon
      aria-label={title}
      aria-pressed={!isMicrophoneEnabled}
      className={stylex.props(!isMicrophoneEnabled && styles.muted).className}
      icon={isMicrophoneEnabled ? Mic : MicOff}
      size={{ blockSize: size, borderRadius: '50%', size: size < 36 ? 16 : 18 }}
      title={title}
      variant="filled"
      onClick={() => {
        void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(onError);
      }}
    />
  );
};

export const CallVisualizer = ({ room, ...props }: { room: Room; video: boolean }) => (
  <RoomContext value={room}>
    <Visualizer {...props} />
  </RoomContext>
);
export const CallMicrophone = ({
  room,
  ...props
}: {
  room: Room;
  onError: (error: unknown) => void;
}) => (
  <RoomContext value={room}>
    <Microphone {...props} />
  </RoomContext>
);

/** Playback stays mounted independently of the visualizer and composer action. */
export const CallAudio = ({ room }: { room: Room }) => {
  const { t } = useTranslation('chat');
  return (
    <RoomContext value={room}>
      <RoomAudioRenderer />
      <StartAudio label={t('voiceCall.enableAudio')} />
    </RoomContext>
  );
};
