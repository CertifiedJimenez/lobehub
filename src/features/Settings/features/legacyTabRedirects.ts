import { SettingsTabs } from '@/store/global/initialState';

export const LEGACY_SETTINGS_TAB_REDIRECTS: Record<string, string> = {
  conversation: SettingsTabs.ServiceModel,
  [SettingsTabs.Common]: SettingsTabs.Appearance,
  [SettingsTabs.ChatAppearance]: SettingsTabs.Appearance,
  [SettingsTabs.Agent]: SettingsTabs.ServiceModel,
  [SettingsTabs.TTS]: SettingsTabs.ServiceModel,
  [SettingsTabs.Image]: SettingsTabs.ServiceModel,
};
