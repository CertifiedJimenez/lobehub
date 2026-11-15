'use client';

import { Flexbox, Input, Select } from '@lobehub/ui';
import type { TTSVoice } from 'model-bank';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getLocalSpeechVoices } from './localSpeechVoices';

export const ConversationVoiceSelect = ({
  model,
  value,
  defaultVoice,
  voices,
  disabled,
  onChange,
}: {
  model: string;
  value?: string;
  defaultVoice?: string;
  voices?: TTSVoice[];
  disabled?: boolean;
  onChange: (voice: string | undefined) => void;
}) => {
  const { t } = useTranslation('chat');
  const catalog = voices?.length ? voices : getLocalSpeechVoices(model);
  const [custom, setCustom] = useState(
    Boolean(value && !catalog?.some((voice) => voice.id === value)),
  );
  return (
    <Flexbox gap={8}>
      {Boolean(catalog?.length) && (
        <Select
          aria-label={t('voiceCall.voice')}
          disabled={disabled}
          value={custom ? '__custom__' : value || defaultVoice}
          options={[
            ...catalog!.map((voice) => ({ label: voice.displayName, value: voice.id })),
            { label: t('voiceCall.customVoice'), value: '__custom__' },
          ]}
          onChange={(voice: string) => {
            setCustom(voice === '__custom__');
            if (voice !== '__custom__') onChange(voice);
          }}
        />
      )}
      {(custom || !catalog?.length) && (
        <Input
          aria-label={t('voiceCall.voiceId')}
          disabled={disabled}
          placeholder={defaultVoice || t('voiceCall.voiceIdPlaceholder')}
          value={catalog?.some((voice) => voice.id === value) ? '' : value}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      )}
    </Flexbox>
  );
};
