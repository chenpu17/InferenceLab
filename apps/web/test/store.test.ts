import { describe, expect, it, vi } from 'vitest';
import type { SimulationResult } from '@inferencelab/core';

const mocks = vi.hoisted(() => ({ run: vi.fn(), plan: vi.fn() }));

vi.mock('../src/worker/client', () => ({ simulationClient: mocks }));

vi.stubGlobal('window', {
  location: { hash: '' },
  localStorage: { getItem: () => null, setItem: () => undefined },
  matchMedia: () => ({ matches: false }),
});

describe('run/draft revision contract', () => {
  it('does not overwrite a newer draft with a frozen run plan', async () => {
    const { runSimulation } = await import('@inferencelab/core');
    const { frameworkProfiles, hardwareProfiles, modelProfiles, scenarioPresets } = await import(
      '@inferencelab/profiles'
    );
    const small = structuredClone(scenarioPresets.find((preset) => preset.id === 'toy-4gpu-tp4-basic')!.scenario);
    const result: SimulationResult = runSimulation({
      scenario: small,
      hardware: hardwareProfiles.find((profile) => profile.id === small.hardwareProfileId)!,
      model: modelProfiles.find((profile) => profile.id === small.modelProfileId)!,
      framework: frameworkProfiles[0]!,
    });

    let resolveRun!: (value: SimulationResult) => void;
    mocks.run.mockImplementation(
      () =>
        new Promise<SimulationResult>((resolve) => {
          resolveRun = resolve;
        }),
    );
    // Keep the post-edit plan request pending so only the run completion can
    // change the preview.
    mocks.plan.mockImplementation(() => new Promise(() => undefined));

    const { useLabStore } = await import('../src/store/useLabStore');
    const before = useLabStore.getState();
    const running = before.runNow();
    useLabStore.getState().setTp(2);
    const edited = useLabStore.getState();
    expect(edited.draftRevision).toBe(before.draftRevision + 1);
    expect(edited.planStatus).toBe('planning');

    resolveRun(result);
    await running;

    const after = useLabStore.getState();
    expect(after.scenario.deployment.logicalParallelism.tp).toBe(2);
    expect(after.draftDirty).toBe(true);
    expect(after.planPreview).toBeNull();
    expect(after.planStatus).toBe('planning');
    expect(after.activeRun).toBe(result);
  });
});
