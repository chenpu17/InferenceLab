import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSimulation, type StateSnapshot } from '@inferencelab/core';
import { frameworkProfiles, hardwareProfiles, modelProfiles, scenarioPresets } from '@inferencelab/profiles';
import { simulationClient, type RunProgress } from '../src/worker/client';
import type { WorkerRequest, WorkerResponse } from '../src/worker/simulation.worker';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request: WorkerRequest | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: WorkerRequest): void {
    this.request = request;
  }

  emit(response: WorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
  }

  terminate(): void {}
}

describe('run transfer progress', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    simulationClient.terminate();
    vi.unstubAllGlobals();
  });

  it('counts unique chunks and checkpoints, and resolves only after all arrive', async () => {
    const scenario = structuredClone(scenarioPresets.find((preset) => preset.id === 'toy-4gpu-tp4-basic')!.scenario);
    const result = runSimulation({
      scenario,
      hardware: hardwareProfiles.find((profile) => profile.id === scenario.hardwareProfileId)!,
      model: modelProfiles.find((profile) => profile.id === scenario.modelProfileId)!,
      framework: frameworkProfiles[0]!,
    });
    const checkpoints = result.replayCheckpoints!;
    const checkpointFixture = (checkpoints[0] ?? {}) as StateSnapshot;
    const emittedCheckpoints = [checkpointFixture, checkpointFixture];
    const { events, replayCheckpoints: _replayCheckpoints, ...headerResult } = result;
    const progress: RunProgress[] = [];
    let resolved = false;

    const running = simulationClient.run(scenario, undefined, (update) => progress.push(update));
    void running.then(() => {
      resolved = true;
    });
    const worker = FakeWorker.instances[0]!;
    const id = worker.request!.id;
    type ResponseWithoutId = WorkerResponse extends infer Response
      ? Response extends WorkerResponse ? Omit<Response, 'id'> : never
      : never;
    const emit = (response: ResponseWithoutId) => worker.emit({ ...response, id } as WorkerResponse);
    const chunk = (index: number) => ({ kind: 'run-chunk' as const, ok: true as const, index, events: [events[index]!] });
    const checkpoint = (index: number) => ({
      kind: 'run-checkpoint' as const,
      ok: true as const,
      index,
      checkpoint: emittedCheckpoints[index]!,
    });

    emit({
      kind: 'run-header',
      ok: true,
      header: { ...headerResult, eventCount: 2, checkpointCount: 2 },
      totalChunks: 2,
    });
    expect(progress.at(-1)).toEqual({
      phase: 'receiving',
      receivedChunks: 0,
      totalChunks: 2,
      receivedCheckpoints: 0,
      totalCheckpoints: 2,
    });

    emit(chunk(1));
    emit(chunk(1));
    expect(progress.at(-1)?.receivedChunks).toBe(1);
    expect(resolved).toBe(false);

    emit(chunk(0));
    await Promise.resolve();
    expect(progress.at(-1)?.phase).toBe('assembling');
    expect(resolved).toBe(false);

    emit(checkpoint(1));
    emit(checkpoint(1));
    expect(progress.at(-1)?.receivedCheckpoints).toBe(1);
    expect(resolved).toBe(false);

    emit(checkpoint(0));
    const assembled = await running;
    expect(assembled.events).toEqual(events.slice(0, 2));
    expect(assembled.replayCheckpoints).toEqual(emittedCheckpoints);
    expect(progress.at(-1)).toEqual({
      phase: 'assembling',
      receivedChunks: 2,
      totalChunks: 2,
      receivedCheckpoints: 2,
      totalCheckpoints: 2,
    });
    expect(progress.every((update, index) => index === 0 || (
      update.receivedChunks >= progress[index - 1]!.receivedChunks
      && update.receivedCheckpoints >= progress[index - 1]!.receivedCheckpoints
    ))).toBe(true);
  });
});
