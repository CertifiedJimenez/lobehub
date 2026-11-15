import type { EnabledAiModel, EnabledProvider } from 'model-bank';

/** Speech output shares the user's enabled provider/model catalog. */
export const speechModelProviders = (models: EnabledAiModel[], providers: EnabledProvider[]) =>
  providers
    .map((provider) => ({
      ...provider,
      name: provider.name || provider.id,
      children: models.filter(
        (model) =>
          model.providerId === provider.id &&
          model.type === 'tts' &&
          model.enabled !== false &&
          model.visible !== false,
      ),
    }))
    .filter((provider) => provider.children.length > 0);
