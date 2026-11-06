import { describe, expect, it, vi } from 'vitest';
import { runSimulation, type RunOptions, type Scenario, type SimulationResult } from '@inferencelab/core';
import { frameworkProfiles, hardwareProfiles, modelProfiles, scenarioPresets } from '@inferencelab/profiles';
import type { RunProgress } from '../src/worker/client';

const mocks = vi.hoisted(() => ({ run: vi.fn(), plan: vi.fn() }));
vi.mock('../src/worker/client', () => ({ simulationClient: mocks }));
vi.stubGlobal('window', {
  location: { hash: '', search: '' },
  localStorage: { getItem: () => null, setItem: () => undefined },
  matchMedia: () => ({ matches: false }),
});

describe('store run progress', () => {
  it('moves from simulating through transfer phases to idle and stores a locale-neutral label', async () => {
    const scenario = structuredClone(scenarioPresets.find((preset) => preset.id === 'toy-4gpu-tp4-basic')!.scenario);
    const result = runSimulation({
      scenario,
      hardware: hardwareProfiles.find((profile) => profile.id === scenario.hardwareProfileId)!,
      model: modelProfiles.find((profile) => profile.id === scenario.modelProfileId)!,
      framework: frameworkProfiles[0]!,
    });
    const { useLabStore } = await import('../src/store/useLabStore');
    let resolveRun!: (value: SimulationResult) => void;
    mocks.run.mockImplementation((
      _scenario: Scenario,
      _options: RunOptions | undefined,
      onProgress: (progress: RunProgress) => void,
    ) => {
      expect(useLabStore.getState().runProgress.phase).toBe('simulating');
      onProgress({ phase: 'receiving', receivedChunks: 0, totalChunks: 2, receivedCheckpoints: 0, totalCheckpoints: 1 });
      onProgress({ phase: 'assembling', receivedChunks: 2, totalChunks: 2, receivedCheckpoints: 0, totalCheckpoints: 1 });
      return new Promise<SimulationResult>((resolve) => {
        resolveRun = resolve;
      });
    });

    const running = useLabStore.getState().runNow();
    expect(useLabStore.getState().running).toBe(true);
    expect(useLabStore.getState().runProgress.phase).toBe('assembling');
    resolveRun(result);
    await running;

    const state = useLabStore.getState();
    expect(state.running).toBe(false);
    expect(state.runProgress).toEqual({
      phase: 'idle',
      receivedChunks: 0,
      totalChunks: 0,
      receivedCheckpoints: 0,
      totalCheckpoints: 0,
    });
    expect(state.runHistory[0]?.label).toBe(result.scenario.title);
    expect(state.runHistory[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
