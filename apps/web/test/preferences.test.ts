import { beforeEach, describe, expect, it, vi } from 'vitest';

const PREF_KEY = 'inferencelab.prefs.v1';
const storage = new Map<string, string>();
let search = '';

vi.stubGlobal('window', {
  location: { hash: '', get search() { return search; } },
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
  matchMedia: () => ({ matches: false }),
});
vi.stubGlobal('document', {
  documentElement: { lang: '' },
  title: '',
});

function savedPreferences(): Record<string, unknown> {
  return JSON.parse(storage.get(PREF_KEY)!);
}

describe('persisted preferences', () => {
  beforeEach(() => {
    storage.clear();
    search = '';
    vi.resetModules();
  });

  it('restores onboardingSeen, keeps ?lang priority, and does not re-arm onboarding on reload', async () => {
    search = '?lang=en';
    storage.set(PREF_KEY, JSON.stringify({
      theme: 'light',
      reducedMotion: true,
      locale: 'zh',
      onboardingSeen: true,
    }));
    const { useLabStore } = await import('../src/store/useLabStore');

    expect(useLabStore.getState().locale).toBe('en');
    expect(useLabStore.getState().onboarding).toEqual({ open: false, step: 0, completed: false });

    useLabStore.getState().resetOnboarding();
    expect(useLabStore.getState().onboarding.open).toBe(true);
    useLabStore.getState().setLocale('zh');

    expect(savedPreferences()).toEqual({
      theme: 'light',
      reducedMotion: true,
      locale: 'zh',
      onboardingSeen: true,
    });
    expect(document.title).toBe('InferenceLab · 推理机制实验室');
    useLabStore.getState().setLocale('en');
    expect(document.title).toBe('InferenceLab · LLM Inference Mechanisms');
  });

  it('persists dismissing onboarding and preserves the flag in every preference setter', async () => {
    storage.set(PREF_KEY, JSON.stringify({
      theme: 'dark',
      reducedMotion: false,
      locale: 'zh',
      onboardingSeen: false,
    }));
    const { useLabStore } = await import('../src/store/useLabStore');

    expect(useLabStore.getState().onboarding.open).toBe(true);
    useLabStore.getState().setOnboarding({ step: 1 });
    expect(savedPreferences().onboardingSeen).toBe(false);
    useLabStore.getState().setOnboarding({ open: false });
    expect(savedPreferences().onboardingSeen).toBe(true);

    useLabStore.getState().resetOnboarding();
    useLabStore.getState().setTheme('light');
    useLabStore.getState().setReducedMotion(true);
    expect(savedPreferences()).toEqual({
      theme: 'light',
      reducedMotion: true,
      locale: 'zh',
      onboardingSeen: true,
    });
  });
});
