'use client';

import { type ConversationConfig, conversationConfigSchema } from '@lobechat/livekit-bridge';
import { Alert, Button, createModal, Flexbox, Select, Text, useModalContext } from '@lobehub/ui';
import { Form, useForm } from '@lobehub/ui/form';
import { t } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAiInfraStore } from '@/store/aiInfra';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import { ConversationVoiceSelect } from '../ConversationVoiceSelect';
import { resolveVoiceSettings } from '../speechModels';

interface VoiceSettingsOptions {
  model: string;
  onApply: (config: ConversationConfig) => Promise<void>;
}

const VoiceSettingsContent = ({ model, onApply }: VoiceSettingsOptions) => {
  const { t } = useTranslation('chat');
  const { close } = useModalContext();
  const form = useForm();
  const [config, setConfig] = useState(() => {
    const state = useUserStore.getState();
    return resolveVoiceSettings(
      settingsSelectors.currentSettings(state).general?.conversation,
      settingsSelectors.currentSystemAgent(state).tts,
    );
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const tts = useUserStore((s) => settingsSelectors.currentSystemAgent(s).tts);
  const voiceCard = useAiInfraStore((s) =>
    s.builtinAiModelList.find((m) => m.id === tts.model && m.providerId === tts.provider),
  );
  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      const next = conversationConfigSchema.parse({ ...config, tts });
      await useUserStore.getState().setSettings({ general: { conversation: next } });
      await onApply(next);
      close();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Flexbox gap={16}>
      <Form
        form={form}
        variant="borderless"
        items={[
          {
            label: t('voiceCall.voice'),
            children: (
              <ConversationVoiceSelect
                disabled={saving}
                key={`${tts.provider}/${tts.model}`}
                model={tts.model}
                value={config.voice || undefined}
                voices={voiceCard?.voices}
                onChange={(voice) => setConfig({ ...config, voice: voice ?? '' })}
              />
            ),
          },
          {
            label: t('voiceCall.speechModel'),
            children: <Text ellipsis>{tts.model}</Text>,
            desc: t('voiceCall.speechModelDescription'),
          },
          {
            label: t('voiceCall.intelligence'),
            children: <Text ellipsis>{model}</Text>,
            desc: t('voiceCall.intelligenceDescription'),
          },
          {
            label: t('voiceCall.language'),
            children: (
              <Select
                showSearch
                value={config.language}
                options={[
                  { label: 'English', value: 'en' },
                  { label: 'Español', value: 'es' },
                  { label: '中文', value: 'zh' },
                  { label: 'Français', value: 'fr' },
                  { label: 'Deutsch', value: 'de' },
                  { label: 'Português', value: 'pt' },
                  { label: '日本語', value: 'ja' },
                  { label: '한국어', value: 'ko' },
                  { label: 'العربية', value: 'ar' },
                ]}
                onChange={(language: string) => setConfig({ ...config, language })}
              />
            ),
          },
        ]}
      />
      {error && <Alert title={t('voiceCall.settingsError')} type="error" />}
      <Flexbox horizontal justify="flex-end">
        <Button loading={saving} type="primary" onClick={() => void save()}>
          {t('save', { ns: 'common' })}
        </Button>
      </Flexbox>
    </Flexbox>
  );
};

export const createVoiceSettingsModal = (options: VoiceSettingsOptions) =>
  createModal({
    title: t('voiceCall.settings', { ns: 'chat' }),
    content: <VoiceSettingsContent {...options} />,
    footer: null,
    maskClosable: true,
    width: 'min(92vw, 520px)',
  });
