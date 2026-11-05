import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  cloneViewState,
  createEmptyViewState,
  planScenario,
  runSimulation,
  SimulationError,
  type SimulationInputs,
} from '../src/index.js';
import { pdTestScenario, testFramework, testHardware, testModel, testScenario } from './fixtures.js';

function inputs(scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 })): SimulationInputs {
  return { scenario, hardware: testHardware(), model: testModel(), framework: testFramework() };
}

describe('deterministic simulator', () => {
  it('respects the token budget with chunked prefill', () => {
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 6, outputTokens: 2 },
          { id: 'B', atUs: 0, promptTokens: 6, outputTokens: 2 },
        ],
      },
      { blockSize: 4, maxNumBatchedTokens: 8, maxNumSeqs: 4, enablePrefixCaching: false },
    );
    const result = runSimulation(inputs(scenario));
    const firstTick = result.events.find((e) => e.type === 'SCHEDULE_TICK');
    expect(firstTick).toBeDefined();
    const firstScheduled = result.events.filter(
      (e) => e.type === 'REQUEST_SCHEDULED' && e.timeUs === firstTick!.timeUs,
    );
    expect(firstScheduled.map((e) => e.detail.prefillTokens)).toEqual([6, 2]);
    const a = result.requests.find((r) => r.id === 'A')!;
    const b = result.requests.find((r) => r.id === 'B')!;
    expect(a.status).toBe('FINISHED');
    expect(b.status).toBe('FINISHED');
    expect(a.computedPrefillTokens).toBe(6);
    expect(b.computedPrefillTokens).toBe(6);
  });

  it('rejects a request whose prompt plus output exceeds max_model_len', () => {
    const scenario = testScenario(
      { kind: 'trace', requests: [{ id: 'A', atUs: 0, promptTokens: 16, outputTokens: 8 }] },
      { blockSize: 4, maxNumBatchedTokens: 64, maxNumSeqs: 2, maxModelLen: 20 },
    );
    const result = runSimulation(inputs(scenario));
    const rejected = result.events.find((event) => event.type === 'REQUEST_REJECTED');
    expect(rejected).toBeDefined();
    expect(rejected!.detail.reason).toBe('MAX_MODEL_LEN_EXCEEDED');
    const trace = result.requests[0]!;
    expect(trace.status).toBe('REJECTED');
    expect(trace.generatedTokens).toBe(0);
    expect(result.metrics.find((metric) => metric.key === 'requests.rejected')!.value).toBe(1);
  });

  it('produces identical event logs for the same seed', () => {
    const scenario = testScenario({
      kind: 'poisson',
      count: 6,
      arrivalRatePerSecond: 20,
      promptTokens: 32,
      outputTokens: 4,
    });
    const first = runSimulation(inputs(scenario));
    const second = runSimulation(inputs(scenario));
    expect(first.eventCount).toBe(second.eventCount);
    expect(JSON.stringify(first.events)).toBe(JSON.stringify(second.events));
    expect(first.metrics.map((m) => [m.key, m.value])).toEqual(second.metrics.map((m) => [m.key, m.value]));
  });

  it('reuses a contiguous prefix from a finished request', () => {
    const blockSize = 16;
    const prefixBlocks = [
      { hash: 'p0', tokenCount: blockSize },
      { hash: 'p1', tokenCount: blockSize },
    ];
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 64, outputTokens: 0, prefixBlocks },
          { id: 'B', atUs: 20_000, promptTokens: 64, outputTokens: 1, prefixBlocks },
        ],
      },
      { blockSize, maxNumBatchedTokens: 256, maxNumSeqs: 4, enablePrefixCaching: true },
    );
    const result = runSimulation(inputs(scenario));
    const lookups = result.events.filter((e) => e.type === 'PREFIX_LOOKUP_DONE');
    expect(lookups.length).toBeGreaterThanOrEqual(2);
    const lookupB = lookups.find((e) => e.requestId === 'B')!;
    expect(lookupB.detail.hitTokens).toBe(32);
    const b = result.requests.find((r) => r.id === 'B')!;
    expect(b.cachedInputTokens).toBe(32);
    expect(b.computedPrefillTokens).toBe(32);
    expect(b.status).toBe('FINISHED');
  });

  it('preempts a running request when KV is exhausted, then recomputes', () => {
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 16, outputTokens: 8 },
          { id: 'B', atUs: 20_000, promptTokens: 16, outputTokens: 2 },
        ],
      },
      {
        blockSize: 4,
        maxNumBatchedTokens: 64,
        maxNumSeqs: 2,
        enablePrefixCaching: false,
        kvCacheMemoryBytes: 8 * 1024,
      },
    );
    const result = runSimulation(inputs(scenario));
    const preempted = result.events.filter((e) => e.type === 'REQUEST_PREEMPTED');
    expect(preempted.length).toBeGreaterThan(0);
    expect(result.requests.some((r) => r.preemptions > 0)).toBe(true);
    expect(result.requests.every((r) => r.status === 'FINISHED' || r.status === 'REJECTED')).toBe(true);
  });

  it('keeps replay prefill totals consistent with the final trace after preemption', () => {
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 16, outputTokens: 8 },
          { id: 'B', atUs: 20_000, promptTokens: 16, outputTokens: 2 },
        ],
      },
      {
        blockSize: 4,
        maxNumBatchedTokens: 64,
        maxNumSeqs: 2,
        enablePrefixCaching: false,
        kvCacheMemoryBytes: 8 * 1024,
      },
    );
    const result = runSimulation(inputs(scenario));
    expect(result.events.some((event) => event.type === 'REQUEST_PREEMPTED')).toBe(true);
    const replay = createEmptyViewState(result.plan);
    for (const event of result.events) applyEvent(replay, event);
    for (const trace of result.requests) {
      const view = replay.requests[trace.id]!;
      expect(view.computedPrefillTokens).toBe(trace.computedPrefillTokens);
      expect(view.numComputedTokens).toBe(
        trace.status === 'FINISHED' ? trace.promptTokens + trace.generatedTokens : view.numComputedTokens,
      );
    }
  });

  it('reports TPOT as unavailable when output length is one', () => {
    const scenario = testScenario({
      kind: 'fixed',
      count: 1,
      promptTokens: 16,
      outputTokens: 1,
      atUs: 0,
    });
    const result = runSimulation(inputs(scenario));
    const tpot = result.metrics.find((m) => m.key === 'tpot.p50')!;
    expect(tpot.value).toBeNull();
    expect(result.requests[0]!.tpotUs).toBeNull();
    expect(result.requests[0]!.ttftUs).not.toBeNull();
  });

  it('emits a bounded number of snapshots and ends explicitly', () => {
    const scenario = testScenario({
      kind: 'fixed',
      count: 8,
      promptTokens: 32,
      outputTokens: 4,
      atUs: 0,
    });
    const result = runSimulation(inputs(scenario), { snapshotEveryEvents: 20 });
    expect(result.snapshots.length).toBeGreaterThan(1);
    expect(result.snapshots.length).toBeLessThan(100);
    expect(result.events[result.events.length - 1]!.type).toBe('SIMULATION_ENDED');
    expect(result.metrics.find((m) => m.key === 'requests.finished')!.value).toBe(8);
  });

  it('rejects an unknown plan unless synthetic timing is explicitly allowed', () => {
    const model = testModel();
    model.tensorInventory = [{ id: 'opaque', logicalBytes: 0, rule: 'opaque' }];
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    scenario.assumptions.allowSyntheticTiming = false;
    expect(() =>
      runSimulation({ scenario, hardware: testHardware(), model, framework: testFramework() }),
    ).toThrow(/unknown/);
  });

  it('runs an unknown plan when synthetic timing is explicitly allowed', () => {
    const model = testModel();
    model.tensorInventory = [{ id: 'opaque', logicalBytes: 0, rule: 'opaque' }];
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const result = runSimulation({ scenario, hardware: testHardware(), model, framework: testFramework() });
    expect(result.plan.feasibility).toBe('unknown');
    expect(result.requests[0]!.status).toBe('FINISHED');
  });

  it('transfers PD KV before the decode engine can emit a token', () => {
    const scenario = pdTestScenario(
      { kind: 'trace', requests: [{ id: 'A', atUs: 0, promptTokens: 8, outputTokens: 2 }] },
      { blockSize: 4, maxNumBatchedTokens: 64, maxNumSeqs: 4 },
    );
    const result = runSimulation(inputs(scenario));
    const started = result.events.find((event) => event.type === 'TRANSFER_STARTED');
    const completed = result.events.find((event) => event.type === 'TRANSFER_COMPLETED');
    expect(started).toBeDefined();
    expect(completed).toBeDefined();
    expect(started!.detail.kind).toBe('PD_KV_TRANSFER');
    expect(started!.detail.fromId).toBe('gpu-0');
    expect(started!.detail.toId).toBe('gpu-2');
    expect(Number(started!.detail.bytes)).toBeGreaterThan(0);
    expect(completed!.timeUs).toBeGreaterThanOrEqual(
      started!.timeUs + Number(started!.detail.durationUs),
    );

    const firstToken = result.events.find((event) => event.type === 'TOKEN_EMITTED');
    expect(firstToken).toBeDefined();
    expect(firstToken!.order).toBeGreaterThan(completed!.order);
    const decodeCompute = result.events.find(
      (event) => event.type === 'COMPUTE_STARTED' && event.detail.engineId === 'd-engine-0',
    );
    expect(decodeCompute).toBeDefined();
    expect(decodeCompute!.timeUs).toBeGreaterThanOrEqual(completed!.timeUs);

    const trace = result.requests[0]!;
    expect(trace.status).toBe('FINISHED');
    expect(trace.generatedTokens).toBe(2);
    expect(trace.prefillEngineId).toBe('p-engine-0');
    expect(trace.decodeEngineId).toBe('d-engine-0');
    expect(trace.transferBytes).toBeGreaterThan(0);
    expect(trace.ttftUs).not.toBeNull();
    expect(trace.ttftUs!).toBeGreaterThanOrEqual(Number(started!.detail.durationUs));
    expect(result.metrics.find((metric) => metric.key === 'transfer.count')!.value).toBe(1);
  });

  it('does not expose decode KV blocks as cached before the transfer completes', () => {
    const scenario = pdTestScenario(
      { kind: 'trace', requests: [{ id: 'A', atUs: 0, promptTokens: 8, outputTokens: 2 }] },
      { blockSize: 4, maxNumBatchedTokens: 64, maxNumSeqs: 4, enablePrefixCaching: true },
    );
    const result = runSimulation(inputs(scenario));
    const completed = result.events.find((event) => event.type === 'TRANSFER_COMPLETED');
    expect(completed).toBeDefined();
    const decodeCached = result.events.filter(
      (event) => event.type === 'BLOCK_CACHED' && event.targetId === 'd-engine-0',
    );
    expect(decodeCached.length).toBeGreaterThan(0);
    for (const event of decodeCached) {
      expect(event.order).toBeGreaterThan(completed!.order);
      expect(event.timeUs).toBeGreaterThanOrEqual(completed!.timeUs);
    }
  });

  it('applies a matching kv-transfer calibration curve to PD transfer time', () => {
    const scenario = pdTestScenario(
      { kind: 'trace', requests: [{ id: 'A', atUs: 0, promptTokens: 8, outputTokens: 2 }] },
      { blockSize: 4, maxNumBatchedTokens: 64, maxNumSeqs: 4 },
    );
    const base = runSimulation(inputs(scenario));
    const baseTransfer = base.events.find((event) => event.type === 'TRANSFER_STARTED')!;
    const calibrated = runSimulation(inputs(scenario), {
      calibrationCurves: [
        {
          id: 'kv-cal',
          op: 'kv-transfer',
          hardwareProfileId: 'hw-test',
          modelProfileId: 'model-test',
          frameworkVersion: '1',
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 8,
          seqLenMin: 1,
          seqLenMax: 4096,
          timeUs: 1000,
          achievedBytesPerSecond: 1_000_000,
        },
      ],
    });
    const calibratedTransfer = calibrated.events.find((event) => event.type === 'TRANSFER_STARTED')!;
    expect(Number(calibratedTransfer.detail.durationUs)).toBeGreaterThan(
      Number(baseTransfer.detail.durationUs),
    );
    expect(calibratedTransfer.detail.quality).toBe('calibrated');
    expect(calibrated.calibration?.appliedCurveIds).toContain('kv-cal');
  });

  it('routes PD_HOST_STAGING through the local host in two sequential legs', () => {
    const workload = { kind: 'trace' as const, requests: [{ id: 'A', atUs: 0, promptTokens: 8, outputTokens: 2 }] };
    const direct = runSimulation(
      inputs(pdTestScenario(workload, { blockSize: 4, maxNumBatchedTokens: 64, maxNumSeqs: 4, strategy: 'PD_PULL' })),
    );
    const staged = runSimulation(
      inputs(
        pdTestScenario(workload, {
          blockSize: 4,
          maxNumBatchedTokens: 64,
          maxNumSeqs: 4,
          strategy: 'PD_HOST_STAGING',
        }),
      ),
    );
    const directTransfer = direct.events.find((event) => event.type === 'TRANSFER_STARTED')!;
    const stagedTransfer = staged.events.find((event) => event.type === 'TRANSFER_STARTED')!;
    expect((stagedTransfer.detail.linkIds as string[]).length).toBe(2);
    expect(stagedTransfer.detail.endpointIds as string[]).toContain('host-node-0');
    expect(Number(stagedTransfer.detail.durationUs)).toBeGreaterThan(Number(directTransfer.detail.durationUs));
    const completed = staged.events.find((event) => event.type === 'TRANSFER_COMPLETED')!;
    const firstToken = staged.events.find((event) => event.type === 'TOKEN_EMITTED')!;
    expect(firstToken.order).toBeGreaterThan(completed.order);
    expect(staged.requests[0]!.status).toBe('FINISHED');
    expect(staged.requests[0]!.generatedTokens).toBe(2);
  });

  it('offloads reusable prefix blocks and reloads them on a host hit', () => {
    const blockSize = 4;
    const prefixBlocks = Array.from({ length: 4 }, (_, index) => ({
      hash: `shared-${index}`,
      tokenCount: blockSize,
    }));
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 16, outputTokens: 1, prefixBlocks },
          { id: 'B', atUs: 100_000, promptTokens: 16, outputTokens: 1, prefixBlocks },
        ],
      },
      {
        blockSize,
        maxNumBatchedTokens: 64,
        maxNumSeqs: 4,
        enablePrefixCaching: true,
        enableCpuOffload: true,
        hostCacheBytes: 1_000_000,
      },
    );
    const result = runSimulation(inputs(scenario));
    const offloaded = result.events.filter((event) => event.type === 'BLOCK_OFFLOAD_COMPLETED');
    const loaded = result.events.filter((event) => event.type === 'BLOCK_LOAD_COMPLETED');
    const hostLoad = result.events.find(
      (event) => event.type === 'TRANSFER_STARTED' && event.detail.kind === 'HOST_LOAD',
    );
    expect(offloaded.length).toBeGreaterThan(0);
    expect(loaded.length).toBeGreaterThan(0);
    expect(hostLoad).toBeDefined();
    expect(hostLoad!.detail.fromId).toBe('host-node-0');
    expect(hostLoad!.detail.toId).toBe('gpu-0');
    expect(result.metrics.find((metric) => metric.key === 'transfer.hostLoads')!.value).toBeGreaterThan(0);

    const lookupB = result.events.find(
      (event) => event.type === 'PREFIX_LOOKUP_DONE' && event.requestId === 'B',
    );
    expect(lookupB).toBeDefined();
    expect(Number(lookupB!.detail.hitTokens)).toBe(16);
    const loadStarted = result.events.find((event) => event.type === 'BLOCK_LOAD_STARTED');
    expect(loadStarted).toBeDefined();
    expect(loadStarted!.timeUs).toBeLessThanOrEqual(lookupB!.timeUs);
    const b = result.requests.find((request) => request.id === 'B')!;
    expect(b.status).toBe('FINISHED');
    expect(b.cachedInputTokens).toBe(16);
    expect(b.transferBytes).toBeGreaterThan(0);
  });

  it('never charges more than the token budget or max sequences in one tick', () => {
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 12, outputTokens: 8 },
          { id: 'B', atUs: 0, promptTokens: 12, outputTokens: 8 },
          { id: 'C', atUs: 0, promptTokens: 12, outputTokens: 8 },
        ],
      },
      { blockSize: 4, maxNumBatchedTokens: 16, maxNumSeqs: 2, enablePrefixCaching: false },
    );
    const result = runSimulation(inputs(scenario));
    const ticks = result.events.filter((event) => event.type === 'SCHEDULE_TICK');
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      const scheduled = result.events.filter(
        (event) => event.type === 'REQUEST_SCHEDULED' && event.timeUs === tick.timeUs,
      );
      const charged = scheduled.reduce((sum, event) => sum + Number(event.detail.tokens), 0);
      expect(charged).toBeLessThanOrEqual(Number(tick.detail.budgetTotal));
      expect(scheduled.length).toBeLessThanOrEqual(Number(tick.detail.maxNumSeqs));
      expect(Number(tick.detail.budgetUsed)).toBeLessThanOrEqual(Number(tick.detail.budgetTotal));
    }
  });

  it('replay checkpoints equal a full replay from the empty state', () => {
    const scenario = testScenario({
      kind: 'poisson',
      count: 20,
      arrivalRatePerSecond: 30,
      promptTokens: 24,
      outputTokens: 16,
    });
    const result = runSimulation(inputs(scenario), { replayCheckpointEveryEvents: 500 });
    const checkpoints = result.replayCheckpoints ?? [];
    expect(checkpoints.length).toBeGreaterThan(1);
    const replay = createEmptyViewState(result.plan);
    let cursor = 0;
    for (const checkpoint of checkpoints) {
      while (cursor < checkpoint.eventIndex) {
        applyEvent(replay, result.events[cursor]!);
        cursor += 1;
      }
      expect(checkpoint.eventIndex).toBe(cursor);
      expect(checkpoint.state).toEqual(cloneViewState(replay, true));
    }
  });

  it('keeps draft-token budget visible but hides speculative metrics when support is unknown', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 6, atUs: 0 },
      { blockSize: 4, maxNumBatchedTokens: 256, maxNumSeqs: 2 },
    );
    scenario.runtime.speculative = { method: 'dspark', draftTokens: 3, acceptanceRate: 0.5 };
    const result = runSimulation(inputs(scenario));
    expect(result.plan.speculative?.frameworkSupport).toBe('unknown');
    expect(result.plan.speculative?.draftTokens).toBe(3);
    const accepted = result.metrics.find((metric) => metric.key === 'speculative.expectedAcceptedTokensPerStep')!;
    const speedup = result.metrics.find((metric) => metric.key === 'speculative.expectedDecodeSpeedup')!;
    expect(accepted.value).toBeNull();
    expect(accepted.quality).toBe('unavailable');
    expect(speedup.value).toBeNull();
    expect(speedup.quality).toBe('unavailable');

    const decodeStep = result.events.find(
      (event) => event.type === 'REQUEST_SCHEDULED' && event.detail.kind === 'decode',
    );
    expect(decodeStep).toBeDefined();
    expect(Number(decodeStep!.detail.decodeTokens)).toBe(1);
    expect(Number(decodeStep!.detail.tokens)).toBe(4);
    expect(Number(decodeStep!.detail.decodeAcceptedTokens)).toBe(2);
    const compute = result.events.find((event) => event.type === 'COMPUTE_STARTED');
    expect(compute!.detail.speculative).toBe('dspark');
  });

  it('rejects an explicitly unsupported speculative method before exposing metrics', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 6, atUs: 0 },
      { blockSize: 4, maxNumBatchedTokens: 256, maxNumSeqs: 2 },
    );
    scenario.runtime.speculative = { method: 'dspark', draftTokens: 3, acceptanceRate: 0.5 };
    const framework = testFramework();
    framework.supportedFeatures.dspark = 'unsupported';
    const input = { ...inputs(scenario), framework };
    const plan = planScenario(input);
    expect(plan.speculative?.frameworkSupport).toBe('unsupported');
    expect(plan.issues.some((issue) => issue.code === 'FEATURE_UNSUPPORTED')).toBe(true);
    expect(plan.speculative?.note).toContain('明确不支持');
    expect(() => runSimulation(input)).toThrow(SimulationError);
  });

  it('reports speculative metrics as assumptions when the adapter declares support', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 6, atUs: 0 },
      { blockSize: 4, maxNumBatchedTokens: 256, maxNumSeqs: 2 },
    );
    scenario.runtime.speculative = { method: 'mtp', draftTokens: 3, acceptanceRate: 0.5 };
    const framework = testFramework();
    framework.supportedFeatures.mtp = 'supported';
    const result = runSimulation({ ...inputs(scenario), framework });
    expect(result.plan.speculative?.frameworkSupport).toBe('supported');
    const accepted = result.metrics.find((metric) => metric.key === 'speculative.expectedAcceptedTokensPerStep')!;
    const speedup = result.metrics.find((metric) => metric.key === 'speculative.expectedDecodeSpeedup')!;
    expect(accepted.value).toBeCloseTo(2.5);
    expect(accepted.quality).toBe('assumption');
    expect(speedup.value).toBeGreaterThan(1);
    expect(speedup.quality).toBe('assumption');
  });

  it('carries the fractional speculative acceptance across decode steps', () => {
    // floor(3 × 0.5) = 1 every step would average 2 accepted tokens, below the
    // plan's 2.5 expectation. Alternating 2/3 keeps long-run throughput aligned.
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 41, atUs: 0 },
      { blockSize: 4, maxNumBatchedTokens: 256, maxNumSeqs: 2 },
    );
    scenario.runtime.speculative = { method: 'mtp', draftTokens: 3, acceptanceRate: 0.5 };
    const framework = testFramework();
    framework.supportedFeatures.mtp = 'supported';
    const result = runSimulation({ ...inputs(scenario), framework });
    const decodeTokens = result.events.filter(
      (event) => event.type === 'TOKEN_EMITTED' && event.detail.acceptedTokens !== undefined,
    );
    const totalAccepted = decodeTokens.reduce((sum, event) => sum + Number(event.detail.acceptedTokens), 0);
    expect(decodeTokens.length).toBe(16);
    expect(totalAccepted).toBe(40);
    expect(totalAccepted / decodeTokens.length).toBeCloseTo(2.5);
  });

  it('rejects queued and running requests after a scheduler stall', () => {
    // Both requests hold one of the two KV blocks; their next decode token needs
    // a second block. With preemption disabled, neither can progress and the
    // scheduler must reject both instead of leaving them RUNNING forever.
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 3, outputTokens: 4 },
          { id: 'B', atUs: 0, promptTokens: 3, outputTokens: 4 },
        ],
      },
      {
        blockSize: 4,
        maxNumBatchedTokens: 64,
        maxNumSeqs: 2,
        preemptionPolicy: 'none',
        kvCacheMemoryBytes: 2048,
      },
    );
    const result = runSimulation(inputs(scenario));
    const rejections = result.events.filter(
      (event) => event.type === 'REQUEST_REJECTED' && event.detail.reason === 'SCHEDULER_STALLED',
    );
    expect(rejections.map((event) => event.requestId)).toEqual(['A', 'B']);
    expect(result.requests.map((request) => request.status)).toEqual(['REJECTED', 'REJECTED']);
    expect(result.metrics.find((metric) => metric.key === 'requests.rejected')!.value).toBe(2);
  });

  it('counts draft tokens in the decode token metric', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 10, atUs: 0 },
      { blockSize: 4, maxNumBatchedTokens: 256, maxNumSeqs: 2 },
    );
    scenario.runtime.speculative = { method: 'dspark', draftTokens: 3, acceptanceRate: 1 };
    const result = runSimulation(inputs(scenario));
    const decodeMetric = result.metrics.find((metric) => metric.key === 'decode.tokens')!;
    const decodeBudget = result.events
      .filter((event) => event.type === 'REQUEST_SCHEDULED' && Number(event.detail.decodeTokens) > 0)
      .reduce((sum, event) => sum + Number(event.detail.tokens), 0);
    const generated = result.requests.reduce((sum, request) => sum + request.generatedTokens, 0);
    expect(decodeMetric.value).toBe(decodeBudget);
    expect(decodeMetric.value).toBeGreaterThan(generated);
  });

  it('does not apply a kv-transfer curve without achieved bandwidth', () => {
    const scenario = pdTestScenario(
      { kind: 'trace', requests: [{ id: 'A', atUs: 0, promptTokens: 8, outputTokens: 2 }] },
      { blockSize: 4, maxNumBatchedTokens: 64, maxNumSeqs: 4 },
    );
    const base = runSimulation(inputs(scenario));
    const withoutBps = runSimulation(inputs(scenario), {
      calibrationCurves: [
        {
          id: 'kv-no-bps',
          op: 'kv-transfer',
          hardwareProfileId: 'hw-test',
          modelProfileId: 'model-test',
          frameworkVersion: '1',
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 8,
          seqLenMin: 1,
          seqLenMax: 4096,
          timeUs: 1000,
        },
      ],
    });
    const baseTransfer = base.events.find((event) => event.type === 'TRANSFER_STARTED')!;
    const unappliedTransfer = withoutBps.events.find((event) => event.type === 'TRANSFER_STARTED')!;
    expect(unappliedTransfer.detail.durationUs).toBe(baseTransfer.detail.durationUs);
    expect(unappliedTransfer.detail.quality).toBe('assumption');
    expect(withoutBps.calibration?.appliedCurveIds).not.toContain('kv-no-bps');
  });

  it('does not apply a kv-transfer curve whose declared scope excludes the payload', () => {
    const scenario = pdTestScenario(
      { kind: 'trace', requests: [{ id: 'A', atUs: 0, promptTokens: 8, outputTokens: 2 }] },
      { blockSize: 4, maxNumBatchedTokens: 64, maxNumSeqs: 4 },
    );
    const base = runSimulation(inputs(scenario));
    const outOfScope = runSimulation(inputs(scenario), {
      calibrationCurves: [
        {
          id: 'kv-too-small',
          op: 'kv-transfer',
          hardwareProfileId: 'hw-test',
          modelProfileId: 'model-test',
          frameworkVersion: '1',
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 1,
          seqLenMin: 1,
          seqLenMax: 1,
          timeUs: 1000,
          achievedBytesPerSecond: 1_000_000,
        },
      ],
    });
    const baseTransfer = base.events.find((event) => event.type === 'TRANSFER_STARTED')!;
    const transfer = outOfScope.events.find((event) => event.type === 'TRANSFER_STARTED')!;
    expect(transfer.detail.durationUs).toBe(baseTransfer.detail.durationUs);
    expect(transfer.detail.quality).toBe('assumption');
    expect(outOfScope.calibration?.appliedCurveIds).not.toContain('kv-too-small');
    expect(outOfScope.calibration?.outOfScope).toBe(true);
  });

  it('scales decode calibration by per-sequence work, not aggregate batch tokens', () => {
    // 4 sequences × 1025 context at the first decode step (the first token is
    // sampled when prefill completes), curve timeUs=2048 at midpoint 2048. The
    // calibrated step is ~1025 µs (one sequence's work), not 4× that.
    const scenario = testScenario(
      { kind: 'fixed', count: 4, promptTokens: 1024, outputTokens: 2, atUs: 0 },
      {
        tp: 1,
        dp: 1,
        blockSize: 16,
        maxNumBatchedTokens: 4096,
        maxNumSeqs: 4,
        kvCacheMemoryBytes: 64 * 1024 * 1024,
      },
    );
    const result = runSimulation(inputs(scenario), {
      calibrationCurves: [
        {
          id: 'decode-cal',
          op: 'decode',
          hardwareProfileId: 'hw-test',
          modelProfileId: 'model-test',
          frameworkVersion: '1',
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 8,
          seqLenMin: 1,
          seqLenMax: 4095,
          timeUs: 2048,
        },
      ],
    });
    const decodeSteps = result.events.filter(
      (event) => event.type === 'COMPUTE_STARTED' && event.detail.kind === 'decode',
    );
    expect(decodeSteps.length).toBeGreaterThan(0);
    expect(Number(decodeSteps[0]!.detail.durationUs)).toBe(1025);
    expect(result.calibration?.appliedCurveIds).toContain('decode-cal');
  });

  it('scopes chunked prefill by the original prompt length and scales by chunk work', () => {
    // The curve is declared for 1024-token prompts. A 512-token chunk must
    // still match it and cost half the curve's whole-step time.
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 1024, outputTokens: 0, atUs: 0 },
      {
        tp: 1,
        dp: 1,
        blockSize: 16,
        maxNumBatchedTokens: 512,
        maxNumSeqs: 1,
        kvCacheMemoryBytes: 64 * 1024 * 1024,
      },
    );
    const result = runSimulation(inputs(scenario), {
      calibrationCurves: [
        {
          id: 'prefill-cal',
          op: 'prefill',
          hardwareProfileId: 'hw-test',
          modelProfileId: 'model-test',
          frameworkVersion: '1',
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 1,
          seqLenMin: 1024,
          seqLenMax: 1024,
          timeUs: 1024,
        },
      ],
    });
    const prefillSteps = result.events.filter(
      (event) => event.type === 'COMPUTE_STARTED' && event.detail.kind === 'prefill',
    );
    expect(prefillSteps.map((event) => Number(event.detail.durationUs))).toEqual([512, 512]);
    expect(result.calibration?.appliedCurveIds).toContain('prefill-cal');
  });

  it('reserves host capacity for blocks whose offload is still in flight', () => {
    const blockSize = 16;
    const prefixBlocks = Array.from({ length: 4 }, (_, index) => ({
      hash: `host-${index}`,
      tokenCount: blockSize,
    }));
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [{ id: 'A', atUs: 0, promptTokens: 64, outputTokens: 1, prefixBlocks }],
      },
      {
        blockSize,
        maxNumBatchedTokens: 256,
        maxNumSeqs: 4,
        enablePrefixCaching: true,
        enableCpuOffload: true,
        hostCacheBytes: 1_000_000,
      },
    );
    const plan = planScenario(inputs(scenario));
    const kvBytesPerBlock = plan.engines[0]!.kvBytesPerBlock;
    expect(kvBytesPerBlock).toBeGreaterThan(0);
    // Exactly two host blocks fit. All four reusable blocks are offered in one
    // batch; only two may start because the other two would overcommit host.
    scenario.runtime.hostCacheBytes = 2 * kvBytesPerBlock;
    const result = runSimulation(inputs(scenario));
    const offload = result.events.find(
      (event) => event.type === 'TRANSFER_STARTED' && event.detail.kind === 'OFFLOAD',
    );
    expect(offload).toBeDefined();
    expect((offload!.detail.blockIds as string[]).length).toBe(2);
    const started = result.events.filter((event) => event.type === 'BLOCK_OFFLOAD_STARTED');
    expect(started.length).toBe(2);
  });

  it('replays a prefix-hit allocation as a cached block owned by the new request', () => {
    const blockSize = 16;
    const prefixBlocks = [
      { hash: 'p0', tokenCount: blockSize },
      { hash: 'p1', tokenCount: blockSize },
    ];
    const scenario = testScenario(
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 64, outputTokens: 0, prefixBlocks },
          { id: 'B', atUs: 20_000, promptTokens: 64, outputTokens: 1, prefixBlocks },
        ],
      },
      { blockSize, maxNumBatchedTokens: 256, maxNumSeqs: 4, enablePrefixCaching: true },
    );
    const result = runSimulation(inputs(scenario));
    const replay = createEmptyViewState(result.plan);
    let hit: (typeof result.events)[number] | null = null;
    for (const event of result.events) {
      applyEvent(replay, event);
      if (event.type === 'KV_ALLOCATED' && event.detail.hit && event.requestId === 'B') {
        hit = event;
        break;
      }
    }
    expect(hit).not.toBeNull();
    const blockId = String(hit!.detail.blockId);
    const block = replay.blocks[blockId]!;
    expect(block.state).toBe('CACHED_ACTIVE');
    expect(block.requestId).toBe('B');
    expect(block.refCount).toBe(Number(hit!.detail.refCount));
  });

  it('resolves MoE expert ownership inside the request engine, not another replica', () => {
    const model = testModel();
    model.moe = { expertCount: 4, topK: 2, expertBytes: 4_000_000 };
    const scenario = testScenario(
      { kind: 'fixed', count: 2, promptTokens: 16, outputTokens: 1, atUs: 0 },
      { tp: 1, dp: 2, blockSize: 4, maxNumBatchedTokens: 256, maxNumSeqs: 2 },
    );
    const result = runSimulation({ ...inputs(scenario), model });
    expect(result.moe).toBeDefined();
    // Every rank owns all four experts (EP=1). A request must dispatch to its
    // own Engine's ranks even though the same expert IDs exist in the other
    // DP replica.
    expect(result.moe!.crossRankDispatches).toBe(0);
    expect(result.moe!.a2aBytes).toBe(0);
  });

  it('keeps agent conversations sticky only when routing asks for it', () => {
    const workload = (routing: 'sticky' | 'round-robin') => ({
      kind: 'agent' as const,
      conversations: 1,
      turns: 2,
      baseSystemTokens: 16,
      turnIncrementTokens: 8,
      outputTokens: 1,
      toolWaitUs: 1000,
      routing,
    });
    const options = {
      tp: 1,
      dp: 2,
      blockSize: 4,
      maxNumBatchedTokens: 256,
      maxNumSeqs: 4,
    };
    const sticky = runSimulation(inputs(testScenario(workload('sticky'), options)));
    const stickyTurn0 = sticky.requests.find((request) => request.id === 'conv-0-turn-0')!;
    const stickyTurn1 = sticky.requests.find((request) => request.id === 'conv-0-turn-1')!;
    expect(stickyTurn1.engineId).toBe(stickyTurn0.engineId);

    const roundRobin = runSimulation(inputs(testScenario(workload('round-robin'), options)));
    const rrTurn0 = roundRobin.requests.find((request) => request.id === 'conv-0-turn-0')!;
    const rrTurn1 = roundRobin.requests.find((request) => request.id === 'conv-0-turn-1')!;
    expect(rrTurn0.engineId).not.toBe(rrTurn1.engineId);
  });
});
