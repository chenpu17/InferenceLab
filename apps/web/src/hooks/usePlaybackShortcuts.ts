import { useEffect } from 'react';
import { useLabStore, type Lens } from '../store/useLabStore';

export type PlaybackShortcut =
  | { action: 'toggle-play' }
  | { action: 'step'; delta: number }
  | { action: 'lens'; lens: Lens };

interface ShortcutKey {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  nativeActivationTarget?: boolean;
}

const LENS_KEYS: Record<string, Lens> = {
  '1': 'topology',
  '2': 'memory',
  '3': 'scheduler',
  '4': 'transport',
  '5': 'metrics',
};

export function resolvePlaybackShortcut(event: ShortcutKey): PlaybackShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (event.key === 'Space') return event.nativeActivationTarget ? null : { action: 'toggle-play' };
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    return { action: 'step', delta: direction * (event.shiftKey ? 10 : 1) };
  }
  const lens = LENS_KEYS[event.key];
  return lens ? { action: 'lens', lens } : null;
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(
    'input, select, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
  ) !== null;
}

function isNativeActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('button, a, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"]') !== null;
}

/** Global lab playback shortcuts; store state is read only when a key is pressed. */
export function usePlaybackShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const state = useLabStore.getState();
      if (state.route !== 'lab' || shouldIgnoreTarget(event.target)) return;
      if (
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') ||
        (event.target instanceof Element && event.target.closest('dialog[open], [role="dialog"][aria-modal="true"]'))
      ) {
        return;
      }

      const shortcut = resolvePlaybackShortcut({
        key: event.code === 'Space' ? 'Space' : event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: event.repeat,
        nativeActivationTarget: isNativeActivationTarget(event.target),
      });
      if (!shortcut) return;

      if (shortcut.action === 'lens') {
        event.preventDefault();
        state.setLens(shortcut.lens);
        return;
      }

      event.preventDefault();
      if (!state.activeRun) return;
      if (shortcut.action === 'toggle-play') {
        state.togglePlay();
        return;
      }

      const target = Math.max(0, Math.min(state.activeRun.events.length, state.eventIndex + shortcut.delta));
      state.setEventIndex(target);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
