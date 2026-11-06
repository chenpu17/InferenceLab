import {
  applyEvent,
  cloneViewState,
  createEmptyViewState,
  type PlanResult,
  type SimEvent,
  type SimViewState,
  type StateSnapshot,
} from '@inferencelab/core';

const CHECKPOINT_EVERY = 200;

/**
 * Replays the event log into view states. The UI never invents visual state:
 * every transition comes from applyEvent(). Checkpoints keep seeking cheap
 * without keeping a snapshot per event.
 *
 * Sparse full-state checkpoints produced by the simulator (including KV
 * blocks) seed the index so that long runs can seek without replaying the
 * whole prefix on the main thread.
 */
export class ReplayIndex {
  private readonly events: SimEvent[];
  private readonly checkpoints = new Map<number, SimViewState>();
  private readonly checkpointIndices: number[] = [];
  private cursor: { index: number; state: SimViewState } | null = null;

  constructor(events: SimEvent[], plan: PlanResult, checkpoints?: StateSnapshot[]) {
    this.events = events;
    this.checkpoints.set(0, createEmptyViewState(plan));
    if (checkpoints) {
      for (const checkpoint of checkpoints) {
        if (checkpoint.eventIndex <= 0 || checkpoint.eventIndex > events.length) continue;
        if (this.checkpoints.has(checkpoint.eventIndex)) continue;
        this.checkpoints.set(checkpoint.eventIndex, checkpoint.state);
      }
    }
    this.checkpointIndices = [...this.checkpoints.keys()].sort((a, b) => a - b);
  }

  stateAt(index: number): SimViewState {
    const target = Math.max(0, Math.min(this.events.length, Math.floor(index)));
    let checkpointIndex = 0;
    let base: SimViewState | null = null;
    for (let i = this.checkpointIndices.length - 1; i >= 0; i -= 1) {
      const candidate = this.checkpointIndices[i]!;
      if (candidate > target) continue;
      const checkpoint = this.checkpoints.get(candidate);
      if (checkpoint) {
        checkpointIndex = candidate;
        base = checkpoint;
        break;
      }
    }
    if (!base) {
      base = createEmptyViewState();
      checkpointIndex = 0;
    }

    const cursor = this.cursor;
    if (cursor?.index === target) return cloneViewState(cursor.state, true);

    let state: SimViewState;
    let startIndex = checkpointIndex;
    if (cursor && cursor.index < target && cursor.index > checkpointIndex) {
      // The cached cursor is never exposed to React. Take ownership of it for
      // this forward pass, then cache a fresh clone before returning.
      state = cursor.state;
      startIndex = cursor.index;
      this.cursor = null;
    } else {
      state = cloneViewState(base, true);
    }
    for (let i = startIndex; i < target; i += 1) {
      applyEvent(state, this.events[i]!);
      const boundary = i + 1;
      if (boundary % CHECKPOINT_EVERY === 0 && !this.checkpoints.has(boundary)) {
        this.checkpoints.set(boundary, cloneViewState(state, true));
        this.checkpointIndices.push(boundary);
        this.checkpointIndices.sort((a, b) => a - b);
      }
    }
    this.cursor = { index: target, state: cloneViewState(state, true) };
    return state;
  }

  eventIndexAtOrBeforeTime(timeUs: number): number {
    if (this.events.length === 0) return 0;
    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.events[mid]!.timeUs <= timeUs) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  get totalEvents(): number {
    return this.events.length;
  }
}

let current: { runId: string; index: ReplayIndex } | null = null;

export function getReplayIndex(
  runId: string,
  events: SimEvent[],
  plan: PlanResult,
  checkpoints?: StateSnapshot[],
): ReplayIndex {
  if (current && current.runId === runId) return current.index;
  current = { runId, index: new ReplayIndex(events, plan, checkpoints) };
  return current.index;
}

export function clearReplayIndex(): void {
  current = null;
}
