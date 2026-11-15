import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('chunk load recovery', () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    reload.mockReset();
    sessionStorage.clear();
    vi.spyOn(window.location, 'reload').mockImplementation(reload);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('reuses one toast for different chunks that fail after the recovery reload', async () => {
    const { toast } = await import('@lobehub/ui');
    const errorToast = vi.spyOn(toast, 'error');
    const { notifyChunkError } = await import('./chunkError');
    sessionStorage.setItem('lobe-chunk-reload', '1');

    notifyChunkError(new Error('Importing a module script failed.'));
    notifyChunkError(new Error('Failed to fetch dynamically imported module: /settings.js'));
    notifyChunkError(new Error('Failed to fetch dynamically imported module: /models.js'));

    // The real toast API assigns a new ID unless the caller supplies a stable one.
    const notifications = errorToast.mock.results.map((result) => result.value.id);
    expect(errorToast).toHaveBeenCalledTimes(3);
    expect(new Set(notifications).size).toBe(1);
    expect(reload).not.toHaveBeenCalled();
    toast.dismiss();
  });

  it('reloads only once and ignores repeat reports of the same failed import', async () => {
    const { toast } = await import('@lobehub/ui');
    const errorToast = vi.spyOn(toast, 'error');
    const { notifyChunkError } = await import('./chunkError');
    const firstError = new Error('Importing a module script failed.');

    notifyChunkError(firstError);
    notifyChunkError(firstError);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(errorToast).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('lobe-chunk-reload')).toBe('1');

    const nextError = new Error('Importing a module script failed.');
    notifyChunkError(nextError);
    notifyChunkError(nextError);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(errorToast).toHaveBeenCalledTimes(1);
    toast.dismiss();
  });
});
