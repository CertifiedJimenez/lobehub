import { describe, expect, it } from 'vitest';

import { LEGACY_SETTINGS_TAB_REDIRECTS } from './legacyTabRedirects';

describe('legacy settings links', () => {
  it('sends old conversation settings links to native speech model selections', () => {
    expect(LEGACY_SETTINGS_TAB_REDIRECTS.conversation).toBe('service-model');
  });
});
