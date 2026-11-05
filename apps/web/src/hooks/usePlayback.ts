import { useEffect, useRef } from 'react';
import { getReplayIndex } from '../lib/replay';
import { useLabStore } from '../store/useLabStore';

/**
 * Drives playback from the frozen event log. The playhead advances in virtual
 * time; the view state only changes when an event boundary is crossed.
 */
export function usePlayback(): void {
  const playing = useLabStore((state) => state.playing);
  const speed = useLabStore((state) => state.playbackSpeed);
  const runId = useLabStore((state) => state.activeRunId);
  const playheadRef = useRef(0);

  useEffect(() => {
    if (!playing || !runId) return;
    const state = useLabStore.getState();
    if (!state.activeRun) return;
    playheadRef.current = state.virtualTimeUs;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const current = useLabStore.getState();
      if (!current.playing || !current.activeRun || current.activeRunId !== runId) return;
      const delta = Math.min(250, Math.max(0, now - last));
      last = now;
      if (current.virtualTimeUs > playheadRef.current) playheadRef.current = current.virtualTimeUs;
      playheadRef.current += delta * 1000 * current.playbackSpeed;
      const endUs = current.activeRun.endedAtUs;
      if (playheadRef.current >= endUs) {
        current.advanceTo(current.activeRun.events.length, false);
        useLabStore.setState({ playing: false });
        return;
      }
      const replay = getReplayIndex(
        runId,
        current.activeRun.events,
        current.activeRun.plan,
        current.activeRun.replayCheckpoints,
      );
      const index = replay.eventIndexAtOrBeforeTime(playheadRef.current);
      if (index !== current.eventIndex) current.advanceTo(index, false);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, runId]);
}
