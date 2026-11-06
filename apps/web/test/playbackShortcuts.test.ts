import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/useLabStore', () => ({ useLabStore: { getState: vi.fn() } }));

import { resolvePlaybackShortcut } from '../src/hooks/usePlaybackShortcuts';

describe('resolvePlaybackShortcut', () => {
  it('maps playback and single-event navigation', () => {
    expect(resolvePlaybackShortcut({ key: 'Space' })).toEqual({ action: 'toggle-play' });
    expect(resolvePlaybackShortcut({ key: 'ArrowLeft' })).toEqual({ action: 'step', delta: -1 });
    expect(resolvePlaybackShortcut({ key: 'ArrowRight' })).toEqual({ action: 'step', delta: 1 });
  });

  it('maps Shift+Arrow to ten-event navigation', () => {
    expect(resolvePlaybackShortcut({ key: 'ArrowLeft', shiftKey: true })).toEqual({
      action: 'step',
      delta: -10,
    });
    expect(resolvePlaybackShortcut({ key: 'ArrowRight', shiftKey: true })).toEqual({
      action: 'step',
      delta: 10,
    });
  });

  it('maps number keys to lenses', () => {
    expect(['1', '2', '3', '4', '5'].map((key) => resolvePlaybackShortcut({ key }))).toEqual([
      { action: 'lens', lens: 'topology' },
      { action: 'lens', lens: 'memory' },
      { action: 'lens', lens: 'scheduler' },
      { action: 'lens', lens: 'transport' },
      { action: 'lens', lens: 'metrics' },
    ]);
  });

  it('preserves native Space activation without disabling other shortcuts', () => {
    expect(resolvePlaybackShortcut({ key: 'Space', nativeActivationTarget: true })).toBeNull();
    expect(resolvePlaybackShortcut({ key: 'ArrowRight', nativeActivationTarget: true })).toEqual({
      action: 'step',
      delta: 1,
    });
    expect(resolvePlaybackShortcut({ key: '1', nativeActivationTarget: true })).toEqual({
      action: 'lens',
      lens: 'topology',
    });
  });

  it('ignores modified, repeated and unrelated keys', () => {
    expect(resolvePlaybackShortcut({ key: 'Space', ctrlKey: true })).toBeNull();
    expect(resolvePlaybackShortcut({ key: '1', metaKey: true })).toBeNull();
    expect(resolvePlaybackShortcut({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(resolvePlaybackShortcut({ key: 'ArrowRight', repeat: true })).toBeNull();
    expect(resolvePlaybackShortcut({ key: 'Enter' })).toBeNull();
    expect(resolvePlaybackShortcut({ key: '6' })).toBeNull();
  });
});
