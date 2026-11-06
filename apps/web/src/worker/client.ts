import type { RunOptions, Scenario, SimEvent, SimulationResult, StateSnapshot } from '@inferencelab/core';
import type {
  PlanResponse,
  RunHeader,
  WorkerRequest,
  WorkerResponse,
} from './simulation.worker';

type Pending = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
};

export type RunPhase = 'idle' | 'simulating' | 'receiving' | 'assembling';

export interface RunProgress {
  phase: RunPhase;
  receivedChunks: number;
  totalChunks: number;
  receivedCheckpoints: number;
  totalCheckpoints: number;
}

type RunAssembly = {
  header: RunHeader | null;
  totalChunks: number;
  chunks: SimEvent[][];
  checkpoints: StateSnapshot[];
  onProgress?: (progress: RunProgress) => void;
  resolve: (value: SimulationResult) => void;
  reject: (reason: Error) => void;
};

class SimulationClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private runs = new Map<number, RunAssembly>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.kind === 'run-header') {
        const run = this.runs.get(data.id);
        if (!run) return;
        run.header = data.header;
        run.totalChunks = data.totalChunks;
        this.reportRunProgress(run);
        this.tryResolveRun(data.id, run);
        return;
      }
      if (data.kind === 'run-chunk') {
        const run = this.runs.get(data.id);
        if (!run) return;
        run.chunks[data.index] = data.events;
        this.reportRunProgress(run);
        this.tryResolveRun(data.id, run);
        return;
      }
      if (data.kind === 'run-checkpoint') {
        const run = this.runs.get(data.id);
        if (!run) return;
        run.checkpoints[data.index] = data.checkpoint;
        this.reportRunProgress(run);
        this.tryResolveRun(data.id, run);
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      pending.resolve(data);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || '仿真 Worker 异常退出。');
      for (const pending of this.pending.values()) pending.reject(error);
      for (const run of this.runs.values()) run.reject(error);
      this.pending.clear();
      this.runs.clear();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private reportRunProgress(run: RunAssembly): void {
    if (!run.header) return;
    const receivedChunks = run.chunks.filter(Boolean).length;
    const receivedCheckpoints = run.checkpoints.filter(Boolean).length;
    run.onProgress?.({
      phase: receivedChunks >= run.totalChunks && run.totalChunks > 0 ? 'assembling' : 'receiving',
      receivedChunks,
      totalChunks: run.totalChunks,
      receivedCheckpoints,
      totalCheckpoints: run.header.checkpointCount,
    });
  }

  private tryResolveRun(id: number, run: RunAssembly): void {
    if (!run.header) return;
    if (run.chunks.filter(Boolean).length < run.totalChunks) return;
    if (run.checkpoints.filter(Boolean).length < run.header.checkpointCount) return;
    this.runs.delete(id);
    this.pending.delete(id);
    const { checkpointCount: _checkpointCount, ...header } = run.header;
    run.resolve({
      ...header,
      events: run.chunks.flat(),
      snapshots: [],
      replayCheckpoints: run.checkpoints,
    });
  }

  private send(
    request:
      | { kind: 'plan'; scenario: Scenario }
      | { kind: 'run'; scenario: Scenario; options?: RunOptions },
  ): Promise<WorkerResponse> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...request, id } as WorkerRequest);
    });
  }

  async plan(scenario: Scenario): Promise<PlanResponse> {
    const response = await this.send({ kind: 'plan', scenario });
    if (response.kind !== 'plan') throw new Error('Worker 返回了非预期响应。');
    return response;
  }

  async run(
    scenario: Scenario,
    options?: RunOptions,
    onProgress?: (progress: RunProgress) => void,
  ): Promise<SimulationResult> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<SimulationResult>((resolve, reject) => {
      this.runs.set(id, {
        header: null,
        totalChunks: 0,
        chunks: [],
        checkpoints: [],
        onProgress,
        resolve,
        reject,
      });
      worker.postMessage({ id, kind: 'run', scenario, options } satisfies WorkerRequest);
      // Error responses arrive as a single `run` message; route it to the
      // assembly entry rather than the generic pending map.
      this.pending.set(id, {
        resolve: (response) => {
          this.runs.delete(id);
          if (response.kind !== 'run') {
            reject(new Error('Worker 返回了非预期响应。'));
            return;
          }
          if (!response.ok) {
            const error = new Error(response.message) as Error & { code?: string; issues?: unknown };
            error.code = response.code;
            error.issues = response.issues;
            reject(error);
          }
        },
        reject,
      });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
    this.runs.clear();
  }
}

export const simulationClient = new SimulationClient();
