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
import { Mic, MicOff, Settings2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AgentAudioVisualizerBar } from './AgentsUI/AgentAudioVisualizerBar';
import { ConversationButton } from './ConversationButton';
import { selectVisualizerAudioTrack } from './visualizerAudio';

const styles = stylex.create({
  floating: {
    position: 'absolute',
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    maxWidth: 'min(520px, 85vw)',
    alignItems: 'center',
    pointerEvents: 'auto',
  },
  visualization: { position: 'relative', paddingInline: 32 },
  settings: { position: 'absolute', top: 0, right: -8 },
  status: { color: cssVar.colorTextSecondary, fontSize: 12, lineHeight: '20px' },
  muted: { color: cssVar.colorError },
});

const Visualizer = ({ onSettings, video }: { onSettings: () => void; video: boolean }) => {
  const { t } = useTranslation('chat');
  const { state, audioTrack } = useVoiceAssistant();
  const { microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
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
    <Flexbox className={stylex.props(styles.floating).className} gap={8}>
      <div className={stylex.props(styles.visualization).className}>
        <AgentAudioVisualizerBar
          audioTrack={visualizedTrack}
          barCount={5}
          size="sm"
          state={state}
          style={{ color: cssVar.colorPrimary }}
        />
        <ActionIcon
          aria-label={t('voiceCall.settings')}
          className={stylex.props(styles.settings).className}
          icon={Settings2}
          size="small"
          title={t('voiceCall.settings')}
          onClick={onSettings}
        />
      </div>
      <span aria-live="polite" className={stylex.props(styles.status).className} role="status">
        {t(
          state === 'listening' && !isMicrophoneEnabled
            ? 'voiceCall.muted'
            : `voiceCall.agentState.${state}`,
        )}
      </span>
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

const Footer = ({ onEnd, onError }: { onEnd: () => void; onError: (error: unknown) => void }) => {
  const { t } = useTranslation('chat');
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const title = t(isMicrophoneEnabled ? 'voiceCall.mute' : 'voiceCall.unmute');
  return (
    <Flexbox horizontal align="center" gap={8}>
      <ActionIcon
        aria-label={title}
        aria-pressed={!isMicrophoneEnabled}
        className={stylex.props(!isMicrophoneEnabled && styles.muted).className}
        icon={isMicrophoneEnabled ? Mic : MicOff}
        size={{ blockSize: 36, size: 18 }}
        title={title}
        variant="filled"
        onClick={() => {
          void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(onError);
        }}
      />
      <ConversationButton icon={X} title={t('voiceCall.end')} onClick={onEnd} />
    </Flexbox>
  );
};

export const CallVisualizer = ({
  room,
  ...props
}: {
  room: Room;
  onSettings: () => void;
  video: boolean;
}) => (
  <RoomContext value={room}>
    <Visualizer {...props} />
  </RoomContext>
);
export const CallControls = ({
  room,
  ...props
}: {
  room: Room;
  onEnd: () => void;
  onError: (error: unknown) => void;
}) => (
  <RoomContext value={room}>
    <Footer {...props} />
  </RoomContext>
);

/** Playback stays mounted independently of the floating visualizer or settings dialog. */
export const CallAudio = ({ room }: { room: Room }) => {
  const { t } = useTranslation('chat');
  return (
    <RoomContext value={room}>
      <RoomAudioRenderer />
      <StartAudio label={t('voiceCall.enableAudio')} />
    </RoomContext>
  );
};
