import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  createEmptyViewState,
  runSimulation,
  type SimulationResult,
  type SimViewState,
} from '@inferencelab/core';
import { frameworkProfiles, hardwareProfiles, modelProfiles, scenarioPresets } from '@inferencelab/profiles';
import { ReplayIndex } from '../src/lib/replay';

function makeResult(): SimulationResult {
  const scenario = structuredClone(
    scenarioPresets.find((preset) => preset.id === 'toy-4gpu-tp4-basic')!.scenario,
  );
  return runSimulation({
    scenario,
    hardware: hardwareProfiles.find((profile) => profile.id === scenario.hardwareProfileId)!,
    model: modelProfiles.find((profile) => profile.id === scenario.modelProfileId)!,
    framework: frameworkProfiles[0]!,
  });
}

function fullReplay(result: SimulationResult, target: number): SimViewState {
  const state = createEmptyViewState(result.plan);
  for (let index = 0; index < target; index += 1) applyEvent(state, result.events[index]!);
  return state;
}

describe('ReplayIndex', () => {
  it('matches a full replay for forward, repeated and backward seeks', () => {
    const result = makeResult();
    const replay = new ReplayIndex(result.events, result.plan, result.replayCheckpoints);
    const last = result.events.length;
    const targets = [
      ...Array.from({ length: last + 1 }, (_, index) => index),
      last,
      last - 1,
      2,
      0,
      last,
    ];

    for (const target of targets) {
      expect(replay.stateAt(target)).toEqual(fullReplay(result, target));
    }
  });

  it('does not mutate a previously returned state when playback advances', () => {
    const result = makeResult();
    const replay = new ReplayIndex(result.events, result.plan, result.replayCheckpoints);
    const previous = replay.stateAt(2);
    const snapshot = structuredClone(previous);
    const repeated = replay.stateAt(2);

    replay.stateAt(Math.min(result.events.length, 8));

    expect(repeated).toEqual(previous);
    expect(repeated).not.toBe(previous);
    expect(previous).toEqual(snapshot);
  });
});
