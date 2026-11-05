import { KvCacheManager, type KvMutation } from '../cache/kvCache.js';
import { resolveHostCacheBytes } from '../domain/config.js';
import { blockContentFingerprint, chainHash } from '../domain/hash.js';
import type {
  CalibrationCurve,
  CalibrationSummary,
  EnginePlan,
  Evidence,
  ExpertAssignment,
  ExpertLoad,
  FrameworkProfile,
  HardwareProfile,
  ID,
  Metric,
  MetricSeries,
  MetricSeriesPoint,
  Microseconds,
  ModelProfile,
  MoeRunSummary,
  PlanResult,
  PrefixBlockSpec,
  RequestSpec,
  RequestStatus,
  RequestTrace,
  RunOptions,
  Scenario,
  SimEvent,
  SimEventType,
  SimulationResult,
  StateSnapshot,
  ValidationIssue,
} from '../domain/types.js';
import { ENGINE_VERSION } from '../domain/types.js';
import { ceilDiv, mean, percentile } from '../domain/units.js';
import { planScenario, sequenceParallelCollectiveCostUs } from '../memory/planner.js';
import { SeededRandom } from '../events/prng.js';
import { StablePriorityQueue } from '../events/priorityQueue.js';
import { TransferScheduler, type ScheduledTransfer } from './linkScheduler.js';
import { applyEvent, createEmptyViewState, snapshotViewState } from './viewState.js';

export interface SimulationInputs {
  scenario: Scenario;
  hardware: HardwareProfile;
  model: ModelProfile;
  framework: FrameworkProfile;
}

export class SimulationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'SimulationError';
    this.issues = issues;
  }
}

interface SimRequest {
  id: ID;
  spec: RequestSpec;
  engineId: ID;
  dpReplicaId: ID;
  status: RequestStatus;
  promptTokens: number;
  outputTokens: number;
  numComputedTokens: number;
  numGeneratedTokens: number;
  cachedInputTokens: number;
  computedPrefillTokens: number;
  recomputeTokens: number;
  firstTokenUs: Microseconds | null;
  lastTokenUs: Microseconds | null;
  finishUs: Microseconds | null;
  arrivalUs: Microseconds;
  firstScheduledUs: Microseconds | null;
  blockHashes: string[];
  prefixBlocks?: PrefixBlockSpec[];
  preemptions: number;
  waitingReason: string | null;
  priority: number;
  kvBlockIds: ID[];
  kvBlocksPeak: number;
  scheduledPrefillThisStep: number;
  scheduledDecodeThisStep: number;
  /** Completed decode steps; drives the deterministic speculative carry. */
  decodeSteps: number;
  conversationId?: ID;
  turnIndex?: number;
  transferBytes: number;
  prefixLookedUp: boolean;
  prefillEngineId: ID | null;
  decodeEngineId: ID | null;
  /** Blocks allocated on the decode engine and waiting for the KV transfer. */
  remoteKvBlockIds: ID[];
  hostLoadPending: boolean;
  hostLoadHostBlockIds: ID[];
}

interface ScheduledWork {
  requestId: ID;
  prefillTokens: number;
  /** Number of decode sequences (0 or 1), not speculative token count. */
  decodeTokens: number;
  needsSampling: boolean;
  /** Token budget charged for this item (draft tokens included). */
  budgetTokens: number;
  /** Tokens committed by a decode step when speculative decoding is on. */
  acceptedDecodeTokens?: number;
}

interface EngineRuntime {
  plan: EnginePlan;
  kv: KvCacheManager;
  waiting: ID[];
  running: ID[];
  tickScheduled: boolean;
  stepInFlight: boolean;
  iteration: number;
  stepCount: number;
  totalPrefillTokens: number;
  totalDecodeTokens: number;
  kvPeakBlocks: number;
  kvPeakBytes: number;
  stalledTicks: number;
  lastStepUs: Microseconds;
}

type InternalEvent =
  | { kind: 'ARRIVAL'; requestId: ID }
  | { kind: 'TICK'; engineId: ID }
  | { kind: 'STEP_DONE'; engineId: ID; work: ScheduledWork[]; startUs: Microseconds; endUs: Microseconds }
  | { kind: 'AGENT_NEXT'; conversationId: ID; turnIndex: number; engineId: ID }
  | {
      kind: 'PD_TRANSFER_BEGIN';
      requestId: ID;
      prefillEngineId: ID;
      decodeEngineId: ID;
      scheduled: ScheduledTransfer;
      fromId: ID;
      toId: ID;
      blockIds: ID[];
      strategy: string;
    }
  | {
      kind: 'PD_TRANSFER_DONE';
      requestId: ID;
      prefillEngineId: ID;
      decodeEngineId: ID;
      startedEventId: ID;
      detail: Record<string, unknown>;
    }
  | {
      kind: 'OFFLOAD_BEGIN';
      engineId: ID;
      blockIds: ID[];
      scheduled: ScheduledTransfer;
      fromId: ID;
      toId: ID;
    }
  | {
      kind: 'OFFLOAD_DONE';
      engineId: ID;
      blockIds: ID[];
      startedEventId: ID;
      detail: Record<string, unknown>;
    }
  | {
      kind: 'HOST_LOAD_BEGIN';
      requestId: ID;
      engineId: ID;
      hostBlockIds: ID[];
      scheduled: ScheduledTransfer;
      fromId: ID;
      toId: ID;
    }
  | {
      kind: 'HOST_LOAD_DONE';
      requestId: ID;
      engineId: ID;
      hostBlockIds: ID[];
      startedEventId: ID;
      detail: Record<string, unknown>;
    };

interface AgentWorkload {
  kind: 'agent';
  conversations: number;
  turns: number;
  baseSystemTokens: number;
  turnIncrementTokens: number;
  outputTokens: number;
  toolWaitUs: Microseconds;
  routing?: 'sticky' | 'round-robin';
}

const MAX_SERIES_POINTS = 500;

export class Simulator {
  private readonly inputs: SimulationInputs;
  readonly plan: PlanResult;
  private readonly engines = new Map<ID, EngineRuntime>();
  private readonly requests = new Map<ID, SimRequest>();
  private readonly pendingSpecs = new Map<ID, RequestSpec>();
  private readonly eventQueue = new StablePriorityQueue<InternalEvent>();
  private readonly events: SimEvent[] = [];
  private readonly snapshots: StateSnapshot[] = [];
  private readonly replayCheckpoints: StateSnapshot[] = [];
  private readonly warnings: string[] = [];
  private readonly seriesPoints = new Map<string, MetricSeriesPoint[]>();
  private readonly viewState;
  private readonly transferScheduler: TransferScheduler;
  private readonly rng: SeededRandom;
  private nowUs: Microseconds = 0;
  private eventCounter = 0;
  private requestCounter = 0;
  private roundRobin = 0;
  private decodeRoundRobin = 0;
  private snapshotEvery = 500;
  private replayCheckpointEvery = 10_000;
  private maxEvents = 250_000;
  private maxVirtualTimeUs = 24 * 3600 * 1_000_000;
  private ended = false;
  private readonly agent: AgentWorkload | null;
  private readonly conversationEngine = new Map<ID, ID>();
  private timeModelFallbackUsed = false;
  private calibrationCurves: CalibrationCurve[] = [];
  private readonly appliedCurveIds = new Set<ID>();
  private readonly calibratedOps = new Set<'prefill' | 'decode' | 'kv-transfer'>();
  private calibrationOutOfScope = false;
  private calibrationUncertaintyPct: number | null = null;

  constructor(inputs: SimulationInputs) {
    this.inputs = inputs;
    this.plan = planScenario(inputs);
    if (this.plan.feasibility === 'infeasible') {
      throw new SimulationError('场景不可行，无法运行仿真。', this.plan.issues);
    }
    const allowSynthetic = inputs.scenario.assumptions.allowSyntheticTiming === true;
    if (this.plan.feasibility === 'unknown' && !allowSynthetic) {
      throw new SimulationError(
        '关键硬件/模型数据为 unknown；仅结构预览可用。若明确接受合成时间模型，请设置 assumptions.allowSyntheticTiming=true。',
        this.plan.issues,
      );
    }

    for (const enginePlan of this.plan.engines) {
      if (enginePlan.maxKvBlocksPerRank <= 0) {
        throw new SimulationError(`Engine ${enginePlan.id} 没有可用 KV Block，无法运行。`, this.plan.issues);
      }
      const kv = new KvCacheManager({
        engineId: enginePlan.id,
        poolId: `kvpool-${enginePlan.id}`,
        capacityBlocks: enginePlan.maxKvBlocksPerRank,
        blockSize: inputs.scenario.runtime.blockSize,
        bytesPerBlock: enginePlan.kvBytesPerBlock,
      });
      this.engines.set(enginePlan.id, {
        plan: enginePlan,
        kv,
        waiting: [],
        running: [],
        tickScheduled: false,
        stepInFlight: false,
        iteration: 0,
        stepCount: 0,
        totalPrefillTokens: 0,
        totalDecodeTokens: 0,
        kvPeakBlocks: 0,
        kvPeakBytes: 0,
        stalledTicks: 0,
        lastStepUs: 0,
      });
    }

    this.viewState = createEmptyViewState(this.plan);
    this.transferScheduler = new TransferScheduler(inputs.hardware);
    this.rng = new SeededRandom(inputs.scenario.seed);
    this.agent = inputs.scenario.workload.kind === 'agent' ? inputs.scenario.workload : null;

    this.seedInitialWorkload();
  }

  run(options: RunOptions = {}): SimulationResult {
    this.maxEvents = options.maxEvents ?? 250_000;
    this.maxVirtualTimeUs = options.maxVirtualTimeUs ?? 24 * 3600 * 1_000_000;
    this.snapshotEvery = options.snapshotEveryEvents ?? 500;
    this.replayCheckpointEvery = Math.max(500, options.replayCheckpointEveryEvents ?? 10_000);
    this.calibrationCurves = options.calibrationCurves ?? [];
    this.snapshots.push(snapshotViewState(this.viewState, 0));

    while (this.eventQueue.size > 0) {
      if (this.events.length >= this.maxEvents) {
        this.warnings.push(`事件数达到上限 ${this.maxEvents}，仿真提前终止；结果仅覆盖已处理部分。`);
        break;
      }
      const item = this.eventQueue.pop()!;
      if (item.timeUs > this.maxVirtualTimeUs) {
        this.warnings.push(`虚拟时间达到上限 ${this.maxVirtualTimeUs} µs，仿真提前终止。`);
        break;
      }
      this.nowUs = item.timeUs;
      switch (item.value.kind) {
        case 'ARRIVAL':
          this.handleArrival(item.value.requestId);
          break;
        case 'TICK':
          this.handleTick(item.value.engineId);
          break;
        case 'STEP_DONE':
          this.handleStepDone(item.value);
          break;
        case 'AGENT_NEXT':
          this.handleAgentNext(item.value);
          break;
        case 'PD_TRANSFER_BEGIN':
          this.handlePdTransferBegin(item.value);
          break;
        case 'PD_TRANSFER_DONE':
          this.handlePdTransferDone(item.value);
          break;
        case 'OFFLOAD_BEGIN':
          this.handleOffloadBegin(item.value);
          break;
        case 'OFFLOAD_DONE':
          this.handleOffloadDone(item.value);
          break;
        case 'HOST_LOAD_BEGIN':
          this.handleHostLoadBegin(item.value);
          break;
        case 'HOST_LOAD_DONE':
          this.handleHostLoadDone(item.value);
          break;
      }
    }

    if (!this.ended) {
      this.emit('SIMULATION_ENDED', {
        detail: {
          reason: this.eventQueue.size === 0 ? 'IDLE' : 'LIMIT',
          eventCount: this.events.length,
          unfinished: [...this.requests.values()].filter(
            (r) => r.status !== 'FINISHED' && r.status !== 'REJECTED',
          ).length,
        },
      });
    }
    this.finalizeUnfinished();
    this.assertCoreInvariants();
    return this.buildResult();
  }

  /**
   * Development-mode assertions for invariants that must hold regardless of
   * scenario. They run once per simulation (not per event), so the cost is
   * negligible compared with event generation, and a violation is surfaced as
   * a SimulationError instead of silently producing misleading metrics.
   */
  private assertCoreInvariants(): void {
    const problems: string[] = [];

    for (const engine of this.engines.values()) {
      for (const problem of engine.kv.assertInvariants()) {
        problems.push(`${engine.plan.id}: ${problem}`);
      }
      if (engine.kvPeakBlocks > engine.kv.capacityBlocks) {
        problems.push(
          `${engine.plan.id}: KV peak ${engine.kvPeakBlocks} exceeds pool capacity ${engine.kv.capacityBlocks}`,
        );
      }
    }

    let previousEventUs = -1;
    for (const event of this.events) {
      if (event.timeUs < previousEventUs) {
        problems.push(`event ${event.id} time ${event.timeUs} is earlier than previous ${previousEventUs}`);
        break;
      }
      previousEventUs = event.timeUs;
    }

    for (const request of this.requests.values()) {
      if (request.numGeneratedTokens < 0 || request.numGeneratedTokens > request.outputTokens) {
        problems.push(
          `request ${request.id} generated ${request.numGeneratedTokens} tokens outside [0, ${request.outputTokens}]`,
        );
      }
      const computedLimit = request.promptTokens + request.numGeneratedTokens;
      if (request.numComputedTokens < 0 || request.numComputedTokens > computedLimit) {
        problems.push(
          `request ${request.id} computed ${request.numComputedTokens} tokens outside [0, ${computedLimit}]`,
        );
      }
      if (request.firstScheduledUs !== null && request.firstScheduledUs < request.arrivalUs) {
        problems.push(`request ${request.id} was scheduled before it arrived`);
      }
      if (request.firstTokenUs !== null && request.firstTokenUs < request.arrivalUs) {
        problems.push(`request ${request.id} emitted its first token before arrival`);
      }
      if (
        request.firstTokenUs !== null &&
        request.lastTokenUs !== null &&
        request.lastTokenUs < request.firstTokenUs
      ) {
        problems.push(`request ${request.id} last token precedes first token`);
      }
      if (request.finishUs !== null && request.finishUs < request.arrivalUs) {
        problems.push(`request ${request.id} finished before arrival`);
      }
      if (request.status === 'FINISHED') {
        if (request.finishUs === null) {
          problems.push(`request ${request.id} is FINISHED without finishUs`);
        }
        if (request.numGeneratedTokens !== request.outputTokens) {
          problems.push(
            `request ${request.id} is FINISHED with ${request.numGeneratedTokens}/${request.outputTokens} output tokens`,
          );
        }
        if (request.numComputedTokens !== request.promptTokens + request.numGeneratedTokens) {
          problems.push(
            `request ${request.id} is FINISHED with ${request.numComputedTokens} computed tokens, expected ${request.promptTokens + request.numGeneratedTokens}`,
          );
        }
      }
    }

    if (problems.length > 0) {
      const issues: ValidationIssue[] = problems.slice(0, 20).map((message, index) => ({
        severity: 'error',
        code: 'CORE_INVARIANT_VIOLATION',
        path: `invariants[${index}]`,
        message,
      }));
      throw new SimulationError(`仿真内部不变量被破坏（${problems.length} 项）。`, issues);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Workload                                                            */
  /* ------------------------------------------------------------------ */

  private seedInitialWorkload(): void {
    const workload = this.inputs.scenario.workload;
    if (workload.kind === 'trace') {
      for (const spec of workload.requests) {
        if (this.pendingSpecs.has(spec.id)) {
          this.warnings.push(`重复的 Request ID ${spec.id}，仅保留第一个。`);
          continue;
        }
        this.pendingSpecs.set(spec.id, spec);
        this.eventQueue.push({ kind: 'ARRIVAL', requestId: spec.id }, spec.atUs, 0);
      }
      return;
    }
    if (workload.kind === 'fixed') {
      for (let i = 0; i < workload.count; i += 1) {
        const id = `req-${i}`;
        const spec: RequestSpec = {
          id,
          atUs: workload.atUs,
          promptTokens: workload.promptTokens,
          outputTokens: workload.outputTokens,
        };
        this.pendingSpecs.set(id, spec);
        this.eventQueue.push({ kind: 'ARRIVAL', requestId: id }, spec.atUs, 0);
      }
      return;
    }
    if (workload.kind === 'poisson') {
      const meanGapUs = 1_000_000 / workload.arrivalRatePerSecond;
      let atUs = 0;
      for (let i = 0; i < workload.count; i += 1) {
        const id = `req-${i}`;
        const spec: RequestSpec = {
          id,
          atUs: Math.round(atUs),
          promptTokens: workload.promptTokens,
          outputTokens: workload.outputTokens,
        };
        this.pendingSpecs.set(id, spec);
        this.eventQueue.push({ kind: 'ARRIVAL', requestId: id }, spec.atUs, 0);
        atUs += this.rng.exponential(meanGapUs);
      }
      return;
    }
    // Agent: first turn of every conversation arrives at t=0; later turns are
    // scheduled after the previous turn finishes + tool wait.
    for (let c = 0; c < workload.conversations; c += 1) {
      const conversationId = `conv-${c}`;
      const spec = this.agentTurnSpec(conversationId, 0);
      this.pendingSpecs.set(spec.id, spec);
      this.eventQueue.push({ kind: 'ARRIVAL', requestId: spec.id }, 0, 0);
    }
  }

  private agentTurnSpec(conversationId: ID, turnIndex: number): RequestSpec {
    const agent = this.agent!;
    const promptTokens = agent.baseSystemTokens + turnIndex * (agent.turnIncrementTokens + agent.outputTokens);
    const blockSize = this.inputs.scenario.runtime.blockSize;
    const fullBlocks = Math.floor(promptTokens / blockSize);
    const systemBlocks = Math.floor(agent.baseSystemTokens / blockSize);
    const prefixBlocks: PrefixBlockSpec[] = [];
    for (let i = 0; i < fullBlocks; i += 1) {
      prefixBlocks.push({
        hash: i < systemBlocks ? `agent-system-${i}` : `${conversationId}-history-${i}`,
        tokenCount: blockSize,
      });
    }
    return {
      id: `${conversationId}-turn-${turnIndex}`,
      atUs: 0,
      promptTokens,
      outputTokens: agent.outputTokens,
      conversationId,
      turnIndex,
      prefixBlocks,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Event handling                                                      */
  /* ------------------------------------------------------------------ */

  private handleArrival(requestId: ID): void {
    const spec = this.pendingSpecs.get(requestId);
    if (!spec) return;
    if (this.requests.has(requestId)) return;
    const engine = this.chooseEngine(spec);
    if (!engine) {
      this.warnings.push(`没有可用 Engine 接收请求 ${requestId}。`);
      return;
    }
    const request: SimRequest = {
      id: spec.id,
      spec,
      engineId: engine.plan.id,
      dpReplicaId: engine.plan.dpReplicaId,
      status: 'ARRIVED',
      promptTokens: spec.promptTokens,
      outputTokens: spec.outputTokens,
      numComputedTokens: 0,
      numGeneratedTokens: 0,
      cachedInputTokens: 0,
      computedPrefillTokens: 0,
      recomputeTokens: 0,
      firstTokenUs: null,
      lastTokenUs: null,
      finishUs: null,
      arrivalUs: spec.atUs,
      firstScheduledUs: null,
      blockHashes: this.buildBlockHashes(spec),
      prefixBlocks: spec.prefixBlocks,
      preemptions: 0,
      waitingReason: null,
      priority: spec.priority ?? 0,
      kvBlockIds: [],
      kvBlocksPeak: 0,
      scheduledPrefillThisStep: 0,
      scheduledDecodeThisStep: 0,
      decodeSteps: 0,
      conversationId: spec.conversationId,
      turnIndex: spec.turnIndex,
      transferBytes: 0,
      prefixLookedUp: false,
      prefillEngineId: engine.plan.role === 'prefill' ? engine.plan.id : null,
      decodeEngineId: null,
      remoteKvBlockIds: [],
      hostLoadPending: false,
      hostLoadHostBlockIds: [],
    };
    this.requests.set(request.id, request);
    this.emit('REQUEST_ARRIVED', {
      requestId: request.id,
      targetId: request.id,
      resourceIds: [engine.plan.id],
      detail: {
        engineId: engine.plan.id,
        dpReplicaId: engine.plan.dpReplicaId,
        promptTokens: request.promptTokens,
        outputTokens: request.outputTokens,
        atUs: request.arrivalUs,
        conversationId: request.conversationId,
        turnIndex: request.turnIndex,
      },
    });
    // vLLM rejects a request whose prompt plus requested output cannot fit in
    // max_model_len at admission time. Modelling this as a rejection (rather
    // than silently truncating) keeps the trace honest about what was served.
    if (request.promptTokens + request.outputTokens > this.inputs.scenario.runtime.maxModelLen) {
      this.rejectRequest(request, engine, 'MAX_MODEL_LEN_EXCEEDED');
      return;
    }
    request.status = 'WAITING';
    engine.waiting.push(request.id);
    this.emit('REQUEST_QUEUED', {
      requestId: request.id,
      targetId: engine.plan.id,
      resourceIds: [engine.plan.id],
      detail: { reason: 'QUEUE', queuePosition: engine.waiting.length - 1 },
    });
    this.ensureTick(engine);
  }

  private handleTick(engineId: ID): void {
    const engine = this.engines.get(engineId);
    if (!engine) return;
    engine.tickScheduled = false;
    if (engine.stepInFlight) return;

    const runtime = this.inputs.scenario.runtime;
    let budget = runtime.maxNumBatchedTokens;
    let seqCount = 0;
    const work: ScheduledWork[] = [];
    const scheduledThisTick = new Set<ID>();
    const budgetStart = budget;

    // 1. Existing RUNNING requests get priority; decode is naturally first
    // because those requests have no remaining prefill tokens.
    for (const requestId of [...engine.running]) {
      if (seqCount >= runtime.maxNumSeqs || budget <= 0) break;
      const request = this.requests.get(requestId);
      if (!request || request.status !== 'RUNNING') continue;
      const target = request.promptTokens + request.numGeneratedTokens;
      const remaining = target - request.numComputedTokens;
      let tokens = 0;
      let needsSampling = false;
      if (remaining > 0) {
        tokens = runtime.enableChunkedPrefill ? Math.min(remaining, budget) : remaining <= budget ? remaining : 0;
        if (tokens === 0) {
          request.waitingReason = 'BUDGET_TOO_SMALL_FOR_PREFILL';
          continue;
        }
        needsSampling =
          request.numComputedTokens + tokens >= target &&
          request.numGeneratedTokens === 0 &&
          request.outputTokens > 0 &&
          engine.plan.role !== 'prefill';
      } else if (request.numGeneratedTokens < request.outputTokens) {
        const cost = this.decodeStepCost();
        if (budget < cost) {
          request.waitingReason = 'BUDGET_TOO_SMALL_FOR_DECODE';
          continue;
        }
        tokens = this.acceptedDecodeTokens(request);
      } else {
        this.finishRequest(request, engine, this.nowUs);
        continue;
      }
      const neededTokens = request.numComputedTokens + tokens + (needsSampling ? 1 : 0);
      const allocation = this.ensureKv(request, engine, neededTokens, this.nowUs);
      if (!allocation.ok) {
        if (allocation.fatal) {
          this.rejectRequest(request, engine, allocation.reason ?? 'KV_REQUEST_TOO_LARGE');
          continue;
        }
        request.waitingReason = allocation.reason ?? 'KV_ALLOC_BLOCKED';
        const victim = this.preemptFor(engine, request, this.nowUs);
        if (!victim) continue;
        const removed = this.removeScheduledWork(victim.id, work, scheduledThisTick);
        if (removed > 0) {
          budget += removed;
          seqCount -= 1;
        }
        const retry = this.ensureKv(request, engine, neededTokens, this.nowUs);
        if (!retry.ok) {
          if (retry.fatal) {
            this.rejectRequest(request, engine, retry.reason ?? 'KV_REQUEST_TOO_LARGE');
          } else {
            request.waitingReason = retry.reason ?? 'KV_ALLOC_BLOCKED';
          }
          continue;
        }
      }
      budget -= remaining > 0 ? tokens : this.decodeStepCost();
      seqCount += 1;
      scheduledThisTick.add(request.id);
      request.scheduledPrefillThisStep = remaining > 0 ? tokens : 0;
      request.scheduledDecodeThisStep = remaining > 0 ? 0 : 1;
      work.push({
        requestId: request.id,
        prefillTokens: remaining > 0 ? tokens : 0,
        decodeTokens: remaining > 0 ? 0 : 1,
        needsSampling,
        budgetTokens: remaining > 0 ? tokens : this.decodeStepCost(),
        acceptedDecodeTokens: remaining > 0 ? undefined : tokens,
      });
    }

    // 2. Admit WAITING requests in FCFS order, subject to seq and token budget.
    while (engine.waiting.length > 0 && seqCount < runtime.maxNumSeqs && budget > 0) {
      const requestId = engine.waiting[0]!;
      const request = this.requests.get(requestId);
      if (!request) {
        engine.waiting.shift();
        continue;
      }
      if (request.status !== 'WAITING' && request.status !== 'PREEMPTED' && request.status !== 'ARRIVED') {
        engine.waiting.shift();
        continue;
      }
      if (request.hostLoadPending) break;
      if (!request.prefixLookedUp) {
        if (this.tryBeginHostLoad(request, engine, this.nowUs)) break;
        this.performPrefixLookup(request, engine, this.nowUs);
        request.prefixLookedUp = true;
      }
      const target = request.promptTokens + request.numGeneratedTokens;
      const remaining = target - request.numComputedTokens;
      let tokens = 0;
      let needsSampling = false;
      if (remaining > 0) {
        tokens = runtime.enableChunkedPrefill ? Math.min(remaining, budget) : remaining <= budget ? remaining : 0;
        if (tokens === 0) {
          request.waitingReason = 'BUDGET_TOO_SMALL_FOR_PREFILL';
          break;
        }
        needsSampling =
          request.numComputedTokens + tokens >= target &&
          request.numGeneratedTokens === 0 &&
          request.outputTokens > 0 &&
          engine.plan.role !== 'prefill';
      } else if (request.numGeneratedTokens < request.outputTokens) {
        const cost = this.decodeStepCost();
        if (budget < cost) {
          request.waitingReason = 'BUDGET_TOO_SMALL_FOR_DECODE';
          break;
        }
        tokens = this.acceptedDecodeTokens(request);
      } else {
        this.finishRequest(request, engine, this.nowUs);
        engine.waiting = engine.waiting.filter((id) => id !== request.id);
        continue;
      }
      const neededTokens = request.numComputedTokens + tokens + (needsSampling ? 1 : 0);
      const allocation = this.ensureKv(request, engine, neededTokens, this.nowUs);
      if (!allocation.ok) {
        if (allocation.fatal) {
          this.rejectRequest(request, engine, allocation.reason ?? 'KV_REQUEST_TOO_LARGE');
          engine.waiting = engine.waiting.filter((id) => id !== request.id);
          continue;
        }
        request.waitingReason = allocation.reason ?? 'KV_ALLOC_BLOCKED';
        // A request that was already preempted waits for the running set to
        // drain instead of preempting another request in a ping-pong loop.
        if (request.preemptions > 0) {
          request.waitingReason = 'WAITING_FOR_KV_AFTER_PREEMPTION';
          break;
        }
        const victim = this.preemptFor(engine, request, this.nowUs);
        if (!victim) break;
        const removed = this.removeScheduledWork(victim.id, work, scheduledThisTick);
        if (removed > 0) {
          budget += removed;
          seqCount -= 1;
        }
        const retry = this.ensureKv(request, engine, neededTokens, this.nowUs);
        if (!retry.ok) {
          if (retry.fatal) {
            this.rejectRequest(request, engine, retry.reason ?? 'KV_REQUEST_TOO_LARGE');
            engine.waiting = engine.waiting.filter((id) => id !== request.id);
            continue;
          }
          request.waitingReason = retry.reason ?? 'KV_ALLOC_BLOCKED';
          break;
        }
      }
      engine.waiting = engine.waiting.filter((id) => id !== request.id);
      engine.running.push(request.id);
      scheduledThisTick.add(request.id);
      request.status = 'RUNNING';
      request.waitingReason = null;
      if (request.firstScheduledUs === null) request.firstScheduledUs = this.nowUs;
      request.scheduledPrefillThisStep = remaining > 0 ? tokens : 0;
      request.scheduledDecodeThisStep = remaining > 0 ? 0 : 1;
      budget -= remaining > 0 ? tokens : this.decodeStepCost();
      seqCount += 1;
      work.push({
        requestId: request.id,
        prefillTokens: remaining > 0 ? tokens : 0,
        decodeTokens: remaining > 0 ? 0 : 1,
        needsSampling,
        budgetTokens: remaining > 0 ? tokens : this.decodeStepCost(),
        acceptedDecodeTokens: remaining > 0 ? undefined : tokens,
      });
    }

    engine.iteration += 1;
    this.emit('SCHEDULE_TICK', {
      targetId: engine.plan.id,
      resourceIds: [engine.plan.id],
      detail: {
        engineId: engine.plan.id,
        iteration: engine.iteration,
        budgetTotal: budgetStart,
        budgetUsed: budgetStart - budget,
        waiting: engine.waiting.length,
        running: engine.running.length,
        scheduled: work.length,
        maxNumSeqs: runtime.maxNumSeqs,
      },
    });

    if (work.length === 0) {
      const waitingForExternal = engine.waiting.some((requestId) => this.requests.get(requestId)?.hostLoadPending);
      if (waitingForExternal) {
        engine.stalledTicks = 0;
        return;
      }
      engine.stalledTicks += 1;
      if (engine.waiting.length > 0 || engine.running.length > 0) {
        if (engine.stalledTicks <= 3) {
          this.eventQueue.push({ kind: 'TICK', engineId: engine.plan.id }, this.nowUs + 1, 1);
          engine.tickScheduled = true;
        } else {
          this.warnings.push(
            `Engine ${engine.plan.id} 连续 ${engine.stalledTicks} 次调度无进展；可能存在预算过小或 KV 不足。`,
          );
          // Reject both queued and running requests: a running request whose
          // decode step no longer fits the budget would otherwise stay RUNNING
          // forever and never appear in the finished/rejected metrics.
          for (const requestId of [...engine.waiting, ...engine.running]) {
            const request = this.requests.get(requestId);
            if (request) this.rejectRequest(request, engine, 'SCHEDULER_STALLED');
          }
          engine.waiting = [];
          engine.running = [];
          // Start a fresh grace window for any later arrivals; otherwise a second
          // stall episode would be rejected after a single tick.
          engine.stalledTicks = 0;
        }
      } else {
        engine.stalledTicks = 0;
      }
      return;
    }

    engine.stalledTicks = 0;
    let budgetCursor = budgetStart;
    for (const item of work) {
      const request = this.requests.get(item.requestId);
      if (!request) continue;
      budgetCursor -= item.budgetTokens;
      this.emit('REQUEST_SCHEDULED', {
        requestId: request.id,
        targetId: engine.plan.id,
        resourceIds: [engine.plan.id],
        detail: {
          tokens: item.budgetTokens,
          prefillTokens: item.prefillTokens,
          decodeTokens: item.decodeTokens,
          decodeAcceptedTokens: item.acceptedDecodeTokens,
          budgetAfter: budgetCursor,
          kind: item.prefillTokens > 0 ? 'prefill' : 'decode',
        },
      });
    }

    const prefillTokens = work.reduce((sum, w) => sum + w.prefillTokens, 0);
    const prefillSeqs = work.reduce((sum, w) => sum + (w.prefillTokens > 0 ? 1 : 0), 0);
    // Calibration curves are scoped by the request's original prompt length,
    // not by the current chunk. A 512-token chunk of an 8K prompt must still
    // match an 8K curve, while its cost is scaled by the 512 tokens actually
    // processed in this step.
    const prefillPromptTokens = work.reduce((sum, w) => {
      const request = this.requests.get(w.requestId);
      return sum + (request && w.prefillTokens > 0 ? request.promptTokens : 0);
    }, 0);
    const decodeSeqs = work.reduce((sum, w) => sum + w.decodeTokens, 0);
    // A speculative decode step verifies 1 + draftTokens candidates, so the
    // computed-token metric must count the budget actually charged rather than
    // the number of sequences. Counting sequences under-reports target-model work.
    const decodeComputeTokens = work.reduce(
      (sum, w) => sum + (w.decodeTokens > 0 ? w.budgetTokens : 0),
      0,
    );
    const contextTokens = work.reduce((sum, w) => {
      const request = this.requests.get(w.requestId);
      return sum + (request && w.decodeTokens > 0 ? request.promptTokens + request.numGeneratedTokens : 0);
    }, 0);
    const maxDecodeContextTokens = work.reduce((max, w) => {
      const request = this.requests.get(w.requestId);
      if (!request || w.decodeTokens === 0) return max;
      return Math.max(max, request.promptTokens + request.numGeneratedTokens);
    }, 0);
    const durationUs = this.estimateStepDuration(
      engine,
      prefillTokens,
      decodeSeqs,
      contextTokens,
      prefillSeqs,
      prefillPromptTokens,
      maxDecodeContextTokens,
    );
    engine.stepInFlight = true;
    engine.stepCount += 1;
    engine.totalPrefillTokens += prefillTokens;
    engine.totalDecodeTokens += decodeComputeTokens;
    engine.lastStepUs = this.nowUs;
    this.emit('COMPUTE_STARTED', {
      targetId: engine.plan.id,
      resourceIds: engine.plan.rankIds,
      detail: {
        engineId: engine.plan.id,
        prefillTokens,
        decodeSeqs,
        durationUs,
        kind: prefillTokens > 0 && decodeSeqs > 0 ? 'mixed' : prefillTokens > 0 ? 'prefill' : 'decode',
        ppSize: engine.plan.ppSize ?? 1,
        spSize: engine.plan.spSize ?? 1,
        speculative: this.plan.speculative?.method,
        quality: 'assumption',
      },
    });
    this.eventQueue.push(
      {
        kind: 'STEP_DONE',
        engineId: engine.plan.id,
        work,
        startUs: this.nowUs,
        endUs: this.nowUs + durationUs,
      },
      this.nowUs + durationUs,
      0,
    );
    this.sampleSeries(engine, budgetStart - budget);
  }

  private handleStepDone(event: Extract<InternalEvent, { kind: 'STEP_DONE' }>): void {
    const engine = this.engines.get(event.engineId);
    if (!engine) return;
    engine.stepInFlight = false;
    this.nowUs = event.endUs;
    this.emit('COMPUTE_DONE', {
      targetId: engine.plan.id,
      resourceIds: engine.plan.rankIds,
      detail: {
        engineId: engine.plan.id,
        startUs: event.startUs,
        endUs: event.endUs,
        durationUs: event.endUs - event.startUs,
        requests: event.work.map((item) => ({
          requestId: item.requestId,
          prefillTokens: item.prefillTokens,
        })),
      },
    });

    for (const item of event.work) {
      const request = this.requests.get(item.requestId);
      if (!request) continue;
      // A request may have been preempted between scheduling and completion.
      if (request.status !== 'RUNNING') continue;
      if (item.prefillTokens > 0) {
        request.numComputedTokens += item.prefillTokens;
        request.computedPrefillTokens += item.prefillTokens;
        const mutations = engine.kv.completeFullBlocks(
          request.id,
          request.numComputedTokens,
          request.blockHashes,
          this.nowUs,
        );
        this.emitKvMutations(mutations, engine, request.id);
      }
      const target = request.promptTokens + request.numGeneratedTokens;
      const prefillComplete = request.numComputedTokens >= target;
      if (item.prefillTokens > 0 && prefillComplete) {
        if (engine.plan.role === 'prefill') {
          // PD: the prefill side never samples. Hand the completed prompt KV to
          // a decode engine; the first token can only be emitted after transfer.
          this.beginPdHandoff(request, engine, this.nowUs);
          continue;
        }
        if (request.numGeneratedTokens === 0 && request.outputTokens > 0) {
          request.numGeneratedTokens = 1;
          request.numComputedTokens += 1;
          request.firstTokenUs = this.nowUs;
          request.lastTokenUs = this.nowUs;
          this.emit('TOKEN_EMITTED', {
            requestId: request.id,
            targetId: engine.plan.id,
            resourceIds: engine.plan.rankIds,
            detail: {
              count: 1,
              tokenIndex: 0,
              firstToken: true,
              numGeneratedTokens: request.numGeneratedTokens,
            },
          });
        }
      } else if (item.decodeTokens > 0) {
        request.decodeSteps += 1;
        const remainingOutput = Math.max(0, request.outputTokens - request.numGeneratedTokens);
        const accepted = Math.min(item.acceptedDecodeTokens ?? 1, remainingOutput);
        if (accepted <= 0) continue;
        request.numComputedTokens += accepted;
        request.numGeneratedTokens += accepted;
        if (request.firstTokenUs === null) request.firstTokenUs = this.nowUs;
        request.lastTokenUs = this.nowUs;
        this.emit('TOKEN_EMITTED', {
          requestId: request.id,
          targetId: engine.plan.id,
          resourceIds: engine.plan.rankIds,
          detail: {
            count: accepted,
            tokenIndex: request.numGeneratedTokens - accepted,
            firstToken: request.numGeneratedTokens === accepted,
            numGeneratedTokens: request.numGeneratedTokens,
            acceptedTokens: accepted,
            speculative: this.plan.speculative?.method,
          },
        });
      }

      if (request.numGeneratedTokens >= request.outputTokens && prefillComplete) {
        this.finishRequest(request, engine, this.nowUs);
      }
    }

    this.ensureTick(engine);
  }

  private handleAgentNext(event: Extract<InternalEvent, { kind: 'AGENT_NEXT' }>): void {
    if (!this.agent) return;
    if (event.turnIndex >= this.agent.turns) return;
    const spec = this.agentTurnSpec(event.conversationId, event.turnIndex);
    if (this.pendingSpecs.has(spec.id)) return;
    this.pendingSpecs.set(spec.id, spec);
    this.eventQueue.push({ kind: 'ARRIVAL', requestId: spec.id }, this.nowUs, 0);
  }

  /* ------------------------------------------------------------------ */
  /* PD transfer / host tier                                             */
  /* ------------------------------------------------------------------ */

  private engineAcceleratorId(engine: EngineRuntime): ID | null {
    const rank = this.plan.ranks.find((item) => engine.plan.rankIds.includes(item.rankId));
    return rank?.acceleratorId ?? null;
  }

  private hostEndpointFor(engine: EngineRuntime): { hostId: ID; acceleratorId: ID } | null {
    const acceleratorId = this.engineAcceleratorId(engine);
    if (!acceleratorId) return null;
    const link = this.inputs.hardware.links.find(
      (item) => item.kind === 'PCIe' && (item.fromId === acceleratorId || item.toId === acceleratorId),
    );
    if (!link) return null;
    const hostId = link.fromId === acceleratorId ? link.toId : link.fromId;
    if (!this.transferScheduler.path(hostId, acceleratorId)) return null;
    return { hostId, acceleratorId };
  }

  private transferDetail(scheduled: ScheduledTransfer, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      fromId: scheduled.path.fromId,
      toId: scheduled.path.toId,
      bytes: scheduled.bytes,
      startUs: scheduled.startUs,
      endUs: scheduled.endUs,
      durationUs: scheduled.durationUs,
      linkIds: scheduled.path.linkIds,
      endpointIds: scheduled.path.endpointIds,
      contentionDomainIds: scheduled.path.contentionDomainIds,
      bottleneckBitsPerSecond: scheduled.path.bottleneckBitsPerSecond,
      blockedByDomainIds: scheduled.blockedByDomainIds,
      quality: scheduled.path.quality,
      ...extra,
    };
  }

  /**
   * PD_HOST_STAGING models two sequential legs: prefill GPU -> local host,
   * then local host -> decode GPU. The other strategies use the direct path.
   */
  private schedulePdTransfer(
    bytes: number,
    fromId: ID,
    toId: ID,
    strategy: string,
    nowUs: Microseconds,
    promptTokens: number,
  ): ScheduledTransfer | null {
    const measured = this.transferBandwidthBytesPerSecond(1, promptTokens);
    const direct = () => this.transferScheduler.schedule(bytes, fromId, toId, nowUs, measured);
    if (strategy !== 'PD_HOST_STAGING') return direct();
    const fromHost = this.hostEndpointForId(fromId);
    if (!fromHost) return direct();
    const leg1 = this.transferScheduler.schedule(bytes, fromId, fromHost, nowUs, measured);
    if (!leg1) return direct();
    const leg2 = this.transferScheduler.schedule(bytes, fromHost, toId, leg1.endUs, measured);
    if (!leg2) return direct();
    return {
      startUs: leg1.startUs,
      endUs: leg2.endUs,
      durationUs: Math.max(1, leg2.endUs - leg1.startUs),
      bytes,
      path: {
        fromId,
        toId,
        linkIds: [...leg1.path.linkIds, ...leg2.path.linkIds],
        endpointIds: [...leg1.path.endpointIds, ...leg2.path.endpointIds],
        bottleneckBitsPerSecond: Math.min(
          leg1.path.bottleneckBitsPerSecond,
          leg2.path.bottleneckBitsPerSecond,
        ),
        latencyUs: leg1.path.latencyUs + leg2.path.latencyUs,
        contentionDomainIds: [
          ...new Set([...leg1.path.contentionDomainIds, ...leg2.path.contentionDomainIds]),
        ],
        quality: measured !== undefined ? 'calibrated' : 'assumption',
      },
      blockedByDomainIds: [...new Set([...leg1.blockedByDomainIds, ...leg2.blockedByDomainIds])],
    };
  }

  private hostEndpointForId(acceleratorId: ID): ID | null {
    const link = this.inputs.hardware.links.find(
      (item) => item.kind === 'PCIe' && (item.fromId === acceleratorId || item.toId === acceleratorId),
    );
    if (!link) return null;
    return link.fromId === acceleratorId ? link.toId : link.fromId;
  }

  private beginPdHandoff(request: SimRequest, prefill: EngineRuntime, timeUs: Microseconds): void {
    if (request.status !== 'RUNNING') return;
    const decodeEngines = [...this.engines.values()].filter((engine) => engine.plan.role === 'decode');
    if (decodeEngines.length === 0) {
      this.rejectRequest(request, prefill, 'NO_DECODE_ENGINE');
      return;
    }
    const decode = decodeEngines[this.decodeRoundRobin % decodeEngines.length]!;
    this.decodeRoundRobin += 1;
    const neededBlocks = ceilDiv(request.promptTokens, decode.kv.blockSize);
    if (neededBlocks > decode.kv.capacityBlocks) {
      this.rejectRequest(request, prefill, 'DECODE_KV_CAPACITY_EXCEEDED');
      return;
    }
    const allocation = decode.kv.allocateFor(
      request.id,
      neededBlocks,
      timeUs,
      (blockIndex) => {
        const hash = request.blockHashes[blockIndex];
        const full = (blockIndex + 1) * decode.kv.blockSize <= request.promptTokens;
        return hash && full ? hash : null;
      },
      (blockIndex) => request.blockHashes[blockIndex - 1] ?? null,
    );
    if (!allocation.ok) {
      for (const blockId of allocation.evicted) {
        this.emit('BLOCK_EVICTED', {
          targetId: decode.plan.id,
          resourceIds: [blockId],
          detail: { blockId, engineId: decode.plan.id },
        });
      }
      const mutations = decode.kv.releaseRequest(request.id, timeUs, false);
      this.emitKvMutations(mutations, decode, request.id);
      this.rejectRequest(request, prefill, 'DECODE_KV_ALLOCATION_FAILED');
      return;
    }
    this.emitAllocationEvents(decode, request.id, allocation.allocated, allocation.evicted);
    request.remoteKvBlockIds = decode.kv.requestBlockIds(request.id);
    request.kvBlocksPeak = Math.max(
      request.kvBlocksPeak,
      request.kvBlockIds.length + request.remoteKvBlockIds.length,
    );
    decode.kvPeakBlocks = Math.max(decode.kvPeakBlocks, decode.kv.usedBlocks);
    decode.kvPeakBytes = Math.max(decode.kvPeakBytes, decode.kv.usedBytes);
    // The decode-side blocks stay RESERVED and are deliberately not marked
    // full/cached until the transfer completes. Marking them ready here would
    // let another request hit a prefix whose KV bytes have not arrived yet.

    const fromId = this.engineAcceleratorId(prefill);
    const toId = this.engineAcceleratorId(decode);
    if (!fromId || !toId) {
      this.releaseDecodeAllocation(request, decode, timeUs);
      this.rejectRequest(request, prefill, 'PD_ENGINE_HAS_NO_ACCELERATOR');
      return;
    }
    const bytes = decode.plan.kvBytesPerBlock * neededBlocks;
    const strategy = this.inputs.scenario.deployment.kvTransfer?.strategy ?? 'PD_PULL';
    const scheduled = this.schedulePdTransfer(bytes, fromId, toId, strategy, timeUs, request.promptTokens);
    if (!scheduled) {
      this.releaseDecodeAllocation(request, decode, timeUs);
      this.rejectRequest(request, prefill, 'NO_TRANSFER_PATH');
      return;
    }

    request.transferBytes += bytes;
    request.prefillEngineId = prefill.plan.id;
    request.decodeEngineId = decode.plan.id;
    request.status = 'WAITING_FOR_REMOTE_KV';
    request.waitingReason = 'WAITING_FOR_REMOTE_KV';
    prefill.running = prefill.running.filter((id) => id !== request.id);
    this.emit('REQUEST_QUEUED', {
      requestId: request.id,
      targetId: prefill.plan.id,
      resourceIds: [prefill.plan.id],
      detail: {
        reason: 'WAITING_FOR_REMOTE_KV',
        engineId: prefill.plan.id,
        decodeEngineId: decode.plan.id,
      },
    });
    this.eventQueue.push(
      {
        kind: 'PD_TRANSFER_BEGIN',
        requestId: request.id,
        prefillEngineId: prefill.plan.id,
        decodeEngineId: decode.plan.id,
        scheduled,
        fromId,
        toId,
        blockIds: [...request.remoteKvBlockIds],
        strategy,
      },
      scheduled.startUs,
      0,
    );
    this.ensureTick(prefill);
  }

  private releaseDecodeAllocation(request: SimRequest, decode: EngineRuntime, timeUs: Microseconds): void {
    const mutations = decode.kv.releaseRequest(request.id, timeUs, false);
    this.emitKvMutations(mutations, decode, request.id);
    request.remoteKvBlockIds = [];
  }

  private emitAllocationEvents(engine: EngineRuntime, requestId: ID, allocated: ID[], evicted: ID[]): void {
    for (const blockId of allocated) {
      const block = engine.kv.getBlock(blockId);
      if (!block) continue;
      this.emit('KV_ALLOCATED', {
        requestId,
        targetId: engine.plan.id,
        resourceIds: [block.id],
        detail: {
          blockId: block.id,
          blockIndex: block.index,
          bytes: block.bytes,
          hash: block.hash,
          parentHash: block.parentHash,
          hit: false,
          state: block.state,
          refCount: block.refCount,
          requestId: block.requestId,
          engineId: engine.plan.id,
          poolId: engine.kv.config.poolId,
        },
      });
    }
    for (const blockId of evicted) {
      this.emit('BLOCK_EVICTED', {
        targetId: engine.plan.id,
        resourceIds: [blockId],
        detail: { blockId, engineId: engine.plan.id },
      });
    }
  }

  private handlePdTransferBegin(event: Extract<InternalEvent, { kind: 'PD_TRANSFER_BEGIN' }>): void {
    const request = this.requests.get(event.requestId);
    if (!request) return;
    const detail = this.transferDetail(event.scheduled, {
      kind: 'PD_KV_TRANSFER',
      strategy: event.strategy,
      prefillEngineId: event.prefillEngineId,
      decodeEngineId: event.decodeEngineId,
      blockIds: event.blockIds,
      requestId: event.requestId,
    });
    const started = this.emit('TRANSFER_STARTED', {
      requestId: request.id,
      targetId: event.decodeEngineId,
      resourceIds: event.scheduled.path.linkIds,
      detail,
    });
    this.eventQueue.push(
      {
        kind: 'PD_TRANSFER_DONE',
        requestId: request.id,
        prefillEngineId: event.prefillEngineId,
        decodeEngineId: event.decodeEngineId,
        startedEventId: started.id,
        detail,
      },
      event.scheduled.endUs,
      0,
    );
  }

  private handlePdTransferDone(event: Extract<InternalEvent, { kind: 'PD_TRANSFER_DONE' }>): void {
    const request = this.requests.get(event.requestId);
    const prefill = this.engines.get(event.prefillEngineId);
    const decode = this.engines.get(event.decodeEngineId);
    if (!request) return;
    this.emit('TRANSFER_COMPLETED', {
      requestId: request.id,
      targetId: event.decodeEngineId,
      resourceIds: (event.detail.linkIds as ID[] | undefined) ?? [],
      detail: { ...event.detail, status: 'completed' },
      dependsOn: [event.startedEventId],
    });
    if (request.status === 'REJECTED' || request.status === 'FINISHED') {
      if (decode) this.releaseDecodeAllocation(request, decode, this.nowUs);
      return;
    }
    if (!prefill || !decode) {
      request.status = 'REJECTED';
      request.finishUs = this.nowUs;
      request.waitingReason = 'PD_ENGINE_MISSING';
      return;
    }
    // KV bytes have arrived: only now may the decode-side blocks become full,
    // cached and visible to prefix lookup. Until this point they are RESERVED.
    const cached = decode.kv.completeFullBlocks(
      request.id,
      request.promptTokens,
      request.blockHashes,
      this.nowUs,
    );
    this.emitKvMutations(cached, decode, request.id);
    // The source blocks live until the transfer completes; only then may the
    // prefill engine reuse or retain them for prefix caching.
    const mutations = prefill.kv.releaseRequest(
      request.id,
      this.nowUs,
      this.inputs.scenario.runtime.enablePrefixCaching,
    );
    this.emitKvMutations(mutations, prefill, request.id);
    request.kvBlockIds = [...request.remoteKvBlockIds];
    request.remoteKvBlockIds = [];
    request.engineId = decode.plan.id;
    request.dpReplicaId = decode.plan.dpReplicaId;
    request.prefixLookedUp = true;
    request.status = 'WAITING';
    request.waitingReason = 'REMOTE_KV_READY';
    if (!decode.waiting.includes(request.id)) decode.waiting.push(request.id);
    this.emit('REQUEST_QUEUED', {
      requestId: request.id,
      targetId: decode.plan.id,
      resourceIds: [decode.plan.id],
      detail: {
        reason: 'REMOTE_KV_READY',
        engineId: decode.plan.id,
        dpReplicaId: decode.plan.dpReplicaId,
      },
    });
    this.ensureTick(decode);
    this.ensureTick(prefill);
  }

  private tryBeginHostLoad(request: SimRequest, engine: EngineRuntime, timeUs: Microseconds): boolean {
    const runtime = this.inputs.scenario.runtime;
    if (!runtime.enableCpuOffload || request.blockHashes.length === 0) return false;
    const peek = engine.kv.peekPrefix(request.blockHashes);
    if (peek.missBlockIndex >= request.blockHashes.length) return false;
    const host = engine.kv.lookupHostBlocksFrom(request.blockHashes, peek.missBlockIndex);
    if (host.hitBlockIds.length === 0) return false;
    if (engine.kv.freeBlocks < host.hitBlockIds.length) return false;
    const endpoint = this.hostEndpointFor(engine);
    if (!endpoint) return false;
    const begun: ID[] = [];
    for (const hostBlockId of host.hitBlockIds) {
      if (!engine.kv.beginLoad(hostBlockId)) {
        for (const id of begun) engine.kv.cancelLoad(id);
        return false;
      }
      begun.push(hostBlockId);
    }
    const bytes = begun.length * engine.plan.kvBytesPerBlock;
    const scheduled = this.transferScheduler.schedule(
      bytes,
      endpoint.hostId,
      endpoint.acceleratorId,
      timeUs,
      this.transferBandwidthBytesPerSecond(begun.length, engine.kv.blockSize),
    );
    if (!scheduled) {
      for (const id of begun) engine.kv.cancelLoad(id);
      return false;
    }
    request.hostLoadPending = true;
    request.hostLoadHostBlockIds = [...begun];
    request.waitingReason = 'HOST_KV_LOADING';
    request.transferBytes += bytes;
    this.eventQueue.push(
      {
        kind: 'HOST_LOAD_BEGIN',
        requestId: request.id,
        engineId: engine.plan.id,
        hostBlockIds: begun,
        scheduled,
        fromId: endpoint.hostId,
        toId: endpoint.acceleratorId,
      },
      scheduled.startUs,
      0,
    );
    return true;
  }

  private handleHostLoadBegin(event: Extract<InternalEvent, { kind: 'HOST_LOAD_BEGIN' }>): void {
    const engine = this.engines.get(event.engineId);
    const request = this.requests.get(event.requestId);
    if (!engine || !request) return;
    const detail = this.transferDetail(event.scheduled, {
      kind: 'HOST_LOAD',
      engineId: event.engineId,
      requestId: event.requestId,
      blockIds: event.hostBlockIds,
    });
    const started = this.emit('TRANSFER_STARTED', {
      requestId: request.id,
      targetId: event.engineId,
      resourceIds: event.scheduled.path.linkIds,
      detail,
    });
    for (const hostBlockId of event.hostBlockIds) {
      const block = engine.kv.getHostBlock(hostBlockId);
      if (!block) continue;
      this.emit('BLOCK_LOAD_STARTED', {
        requestId: request.id,
        targetId: event.engineId,
        resourceIds: [hostBlockId],
        detail: {
          blockId: hostBlockId,
          blockIndex: block.index,
          bytes: block.bytes,
          hash: block.hash,
          engineId: event.engineId,
          poolId: engine.kv.config.poolId,
        },
      });
    }
    this.eventQueue.push(
      {
        kind: 'HOST_LOAD_DONE',
        requestId: request.id,
        engineId: event.engineId,
        hostBlockIds: event.hostBlockIds,
        startedEventId: started.id,
        detail,
      },
      event.scheduled.endUs,
      0,
    );
  }

  private handleHostLoadDone(event: Extract<InternalEvent, { kind: 'HOST_LOAD_DONE' }>): void {
    const engine = this.engines.get(event.engineId);
    const request = this.requests.get(event.requestId);
    if (!engine) return;
    this.emit('TRANSFER_COMPLETED', {
      requestId: event.requestId,
      targetId: event.engineId,
      resourceIds: (event.detail.linkIds as ID[] | undefined) ?? [],
      detail: { ...event.detail, status: 'completed' },
      dependsOn: [event.startedEventId],
    });
    for (const hostBlockId of event.hostBlockIds) {
      const result = engine.kv.completeLoad(hostBlockId, this.nowUs);
      if (!result) {
        this.warnings.push(`Host Block ${hostBlockId} 加载完成时目标 HBM Slot 丢失。`);
        continue;
      }
      this.emitKvMutations([result.mutation], engine, event.requestId);
    }
    if (!request) return;
    request.hostLoadPending = false;
    request.hostLoadHostBlockIds = [];
    request.waitingReason = null;
    if (request.status !== 'WAITING') return;
    this.performPrefixLookup(request, engine, this.nowUs);
    request.prefixLookedUp = true;
    this.ensureTick(engine);
  }

  private scheduleOffload(engine: EngineRuntime, blockIds: ID[], timeUs: Microseconds): void {
    const runtime = this.inputs.scenario.runtime;
    if (!runtime.enableCpuOffload) return;
    const hostCacheBytes = resolveHostCacheBytes(this.inputs.scenario);
    if (hostCacheBytes <= 0 || engine.plan.kvBytesPerBlock <= 0) return;
    const endpoint = this.hostEndpointFor(engine);
    if (!endpoint) return;
    const capacityBlocks = Math.floor(hostCacheBytes / engine.plan.kvBytesPerBlock);
    // OFFLOADING blocks already own host capacity even though their transfer
    // has not completed. Counting only HOST_RESIDENT blocks would let two
    // concurrent batches reserve the same slots and exceed host capacity.
    const available = Math.max(0, capacityBlocks - engine.kv.hostCommittedBlocks);
    const candidates = blockIds.slice(0, available);
    const begun: ID[] = [];
    for (const blockId of candidates) {
      if (engine.kv.beginOffload(blockId)) begun.push(blockId);
    }
    if (begun.length === 0) return;
    const bytes = begun.length * engine.plan.kvBytesPerBlock;
    const scheduled = this.transferScheduler.schedule(
      bytes,
      endpoint.acceleratorId,
      endpoint.hostId,
      timeUs,
      this.transferBandwidthBytesPerSecond(begun.length, engine.kv.blockSize),
    );
    if (!scheduled) {
      for (const blockId of begun) engine.kv.cancelOffload(blockId);
      return;
    }
    this.eventQueue.push(
      {
        kind: 'OFFLOAD_BEGIN',
        engineId: engine.plan.id,
        blockIds: begun,
        scheduled,
        fromId: endpoint.acceleratorId,
        toId: endpoint.hostId,
      },
      scheduled.startUs,
      0,
    );
  }

  private handleOffloadBegin(event: Extract<InternalEvent, { kind: 'OFFLOAD_BEGIN' }>): void {
    const engine = this.engines.get(event.engineId);
    if (!engine) return;
    const detail = this.transferDetail(event.scheduled, {
      kind: 'OFFLOAD',
      engineId: event.engineId,
      blockIds: event.blockIds,
    });
    const started = this.emit('TRANSFER_STARTED', {
      targetId: event.engineId,
      resourceIds: event.scheduled.path.linkIds,
      detail,
    });
    for (const blockId of event.blockIds) {
      const block = engine.kv.getBlock(blockId);
      if (!block) continue;
      this.emit('BLOCK_OFFLOAD_STARTED', {
        targetId: event.engineId,
        resourceIds: [blockId],
        detail: {
          blockId,
          blockIndex: block.index,
          bytes: block.bytes,
          hash: block.hash,
          engineId: event.engineId,
          poolId: engine.kv.config.poolId,
        },
      });
    }
    this.eventQueue.push(
      {
        kind: 'OFFLOAD_DONE',
        engineId: event.engineId,
        blockIds: event.blockIds,
        startedEventId: started.id,
        detail,
      },
      event.scheduled.endUs,
      0,
    );
  }

  private handleOffloadDone(event: Extract<InternalEvent, { kind: 'OFFLOAD_DONE' }>): void {
    const engine = this.engines.get(event.engineId);
    if (!engine) return;
    this.emit('TRANSFER_COMPLETED', {
      targetId: event.engineId,
      resourceIds: (event.detail.linkIds as ID[] | undefined) ?? [],
      detail: { ...event.detail, status: 'completed' },
      dependsOn: [event.startedEventId],
    });
    for (const blockId of event.blockIds) {
      const mutation = engine.kv.completeOffload(blockId, this.nowUs);
      if (!mutation) {
        this.warnings.push(`KV Block ${blockId} Offload 完成时状态已变化。`);
        continue;
      }
      this.emitKvMutations([mutation], engine, undefined);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Scheduling helpers                                                  */
  /* ------------------------------------------------------------------ */

  private chooseEngine(spec: RequestSpec): EngineRuntime | undefined {
    const mixed = [...this.engines.values()].filter((e) => e.plan.role === 'mixed');
    if (mixed.length > 0) {
      const routing = this.inputs.scenario.deployment.routing;
      if (routing?.kind === 'fixed' && routing.assignments?.[spec.id]) {
        const targetReplica = routing.assignments[spec.id];
        const found = mixed.find((e) => e.plan.dpReplicaId === targetReplica);
        if (found) return found;
      }
      if (spec.conversationId && (this.agent?.routing ?? 'sticky') === 'sticky') {
        const existing = this.conversationEngine.get(spec.conversationId);
        if (existing) return this.engines.get(existing);
        const chosen = mixed[this.roundRobin % mixed.length]!;
        this.roundRobin += 1;
        this.conversationEngine.set(spec.conversationId, chosen.plan.id);
        return chosen;
      }
      const chosen = mixed[this.roundRobin % mixed.length]!;
      this.roundRobin += 1;
      return chosen;
    }
    const prefill = [...this.engines.values()].filter((e) => e.plan.role === 'prefill');
    if (prefill.length > 0) {
      const chosen = prefill[this.roundRobin % prefill.length]!;
      this.roundRobin += 1;
      return chosen;
    }
    return undefined;
  }

  private ensureTick(engine: EngineRuntime): void {
    if (engine.tickScheduled || engine.stepInFlight) return;
    if (engine.waiting.length === 0 && engine.running.length === 0) return;
    engine.tickScheduled = true;
    this.eventQueue.push({ kind: 'TICK', engineId: engine.plan.id }, this.nowUs, 0);
  }

  private buildBlockHashes(spec: RequestSpec): string[] {
    const blockSize = this.inputs.scenario.runtime.blockSize;
    const fullBlocks = Math.floor(spec.promptTokens / blockSize);
    const hashes: string[] = [];
    let parent: string | null = null;
    for (let i = 0; i < fullBlocks; i += 1) {
      const provided = spec.prefixBlocks?.[i];
      let hash: string;
      if (provided && provided.tokenCount === blockSize) {
        hash = provided.hash;
      } else {
        const fingerprint = blockContentFingerprint(spec.id, i, i * blockSize, blockSize);
        hash = chainHash(parent, fingerprint);
      }
      hashes.push(hash);
      parent = hash;
    }
    return hashes;
  }

  private performPrefixLookup(request: SimRequest, engine: EngineRuntime, timeUs: Microseconds): void {
    if (!this.inputs.scenario.runtime.enablePrefixCaching) {
      this.emit('PREFIX_LOOKUP_DONE', {
        requestId: request.id,
        targetId: engine.plan.id,
        resourceIds: [engine.plan.id],
        detail: { enabled: false, hitTokens: 0, hitBlocks: 0, missBlockIndex: 0 },
      });
      return;
    }
    const result = engine.kv.lookupPrefix(request.blockHashes, timeUs);
    if (result.hitBlockIds.length > 0) {
      const mutations = engine.kv.attachHitBlocks(request.id, result.hitBlockIds, timeUs);
      this.emitKvMutations(mutations, engine, request.id);
      request.cachedInputTokens = result.hitTokens;
      request.numComputedTokens = Math.max(request.numComputedTokens, result.hitTokens);
      request.kvBlockIds = engine.kv.requestBlockIds(request.id);
    }
    this.emit('PREFIX_LOOKUP_DONE', {
      requestId: request.id,
      targetId: engine.plan.id,
      resourceIds: [engine.plan.id],
      detail: {
        enabled: true,
        hitTokens: result.hitTokens,
        hitBlocks: result.hitBlockIds.length,
        missBlockIndex: result.missBlockIndex,
        totalPromptBlocks: request.blockHashes.length,
        blockSize: this.inputs.scenario.runtime.blockSize,
      },
    });
  }

  private ensureKv(
    request: SimRequest,
    engine: EngineRuntime,
    neededTokens: number,
    timeUs: Microseconds,
  ): { ok: boolean; reason?: string; fatal?: boolean } {
    const neededBlocks = ceilDiv(neededTokens, engine.kv.blockSize);
    if (neededBlocks <= request.kvBlockIds.length) return { ok: true };
    if (neededBlocks > engine.kv.capacityBlocks) {
      return {
        ok: false,
        fatal: true,
        reason: `请求需要 ${neededBlocks} 个 KV Block，超过池容量 ${engine.kv.capacityBlocks}。`,
      };
    }
    const blockSize = engine.kv.blockSize;
    const result = engine.kv.allocateFor(
      request.id,
      neededBlocks,
      timeUs,
      (blockIndex) => {
        const hash = request.blockHashes[blockIndex];
        const full = (blockIndex + 1) * blockSize <= request.promptTokens;
        return hash && full ? hash : null;
      },
      (blockIndex) => request.blockHashes[blockIndex - 1] ?? null,
    );
    for (const blockId of result.allocated) {
      const block = engine.kv.getBlock(blockId);
      if (!block) continue;
      this.emit('KV_ALLOCATED', {
        requestId: request.id,
        targetId: engine.plan.id,
        resourceIds: [block.id],
        detail: {
          blockId: block.id,
          blockIndex: block.index,
          bytes: block.bytes,
          hash: block.hash,
          parentHash: block.parentHash,
          hit: false,
          state: block.state,
          refCount: block.refCount,
          requestId: block.requestId,
          engineId: engine.plan.id,
          poolId: engine.kv.config.poolId,
        },
      });
    }
    for (const blockId of result.evicted) {
      this.emit('BLOCK_EVICTED', {
        targetId: engine.plan.id,
        resourceIds: [blockId],
        detail: { blockId, engineId: engine.plan.id },
      });
    }
    if (!result.ok) {
      request.kvBlockIds = engine.kv.requestBlockIds(request.id);
      return { ok: false, reason: result.reason };
    }
    request.kvBlockIds = engine.kv.requestBlockIds(request.id);
    request.kvBlocksPeak = Math.max(request.kvBlocksPeak, request.kvBlockIds.length);
    engine.kvPeakBlocks = Math.max(engine.kvPeakBlocks, engine.kv.usedBlocks);
    engine.kvPeakBytes = Math.max(engine.kvPeakBytes, engine.kv.usedBytes);
    return { ok: true };
  }

  private preemptFor(
    engine: EngineRuntime,
    requester: SimRequest,
    timeUs: Microseconds,
  ): SimRequest | null {
    if (this.inputs.scenario.runtime.preemptionPolicy === 'none') return null;
    let victim: SimRequest | null = null;
    for (const requestId of engine.running) {
      if (requestId === requester.id) continue;
      const request = this.requests.get(requestId);
      if (!request || request.status !== 'RUNNING') continue;
      if (!victim || request.priority > victim.priority) victim = request;
    }
    if (!victim) return null;
    const mutations = engine.kv.releaseRequest(victim.id, timeUs, this.inputs.scenario.runtime.enablePrefixCaching);
    this.emitKvMutations(mutations, engine, victim.id);
    victim.status = 'WAITING';
    victim.waitingReason = 'PREEMPTED_RECOMPUTE';
    victim.preemptions += 1;
    const recomputeTokens = victim.numComputedTokens;
    victim.recomputeTokens += recomputeTokens;
    victim.numComputedTokens = 0;
    victim.prefixLookedUp = false;
    victim.kvBlockIds = [];
    engine.running = engine.running.filter((id) => id !== victim!.id);
    engine.waiting.unshift(victim.id);
    this.emit('REQUEST_PREEMPTED', {
      requestId: victim.id,
      targetId: engine.plan.id,
      resourceIds: [engine.plan.id],
      detail: {
        reason: 'PREEMPTED_RECOMPUTE',
        preemptedBy: requester.id,
        generatedTokens: victim.numGeneratedTokens,
        recomputeTokens,
      },
    });
    return victim;
  }

  private removeScheduledWork(requestId: ID, work: ScheduledWork[], scheduledThisTick: Set<ID>): number {
    const index = work.findIndex((item) => item.requestId === requestId);
    if (index < 0) return 0;
    const [removed] = work.splice(index, 1);
    scheduledThisTick.delete(requestId);
    return removed ? removed.budgetTokens : 0;
  }

  private rejectRequest(request: SimRequest, engine: EngineRuntime, reason: string): void {
    if (request.status === 'REJECTED' || request.status === 'FINISHED') return;
    request.status = 'REJECTED';
    request.finishUs = this.nowUs;
    request.waitingReason = reason;
    this.emit('REQUEST_REJECTED', {
      requestId: request.id,
      targetId: engine.plan.id,
      resourceIds: [engine.plan.id],
      detail: { reason, promptTokens: request.promptTokens, outputTokens: request.outputTokens },
    });
    const mutations = engine.kv.releaseRequest(request.id, this.nowUs, false);
    this.emitKvMutations(mutations, engine, request.id);
    engine.running = engine.running.filter((id) => id !== request.id);
    engine.waiting = engine.waiting.filter((id) => id !== request.id);
  }

  private finishRequest(request: SimRequest, engine: EngineRuntime, timeUs: Microseconds): void {
    if (request.status === 'FINISHED') return;
    request.status = 'FINISHED';
    request.finishUs = timeUs;
    const ttft = request.firstTokenUs !== null ? request.firstTokenUs - request.arrivalUs : null;
    const tpot =
      request.firstTokenUs !== null && request.lastTokenUs !== null && request.numGeneratedTokens > 1
        ? (request.lastTokenUs - request.firstTokenUs) / (request.numGeneratedTokens - 1)
        : null;
    this.emit('REQUEST_FINISHED', {
      requestId: request.id,
      targetId: engine.plan.id,
      resourceIds: [engine.plan.id],
      detail: {
        engineId: engine.plan.id,
        generatedTokens: request.numGeneratedTokens,
        promptTokens: request.promptTokens,
        arrivalUs: request.arrivalUs,
        firstTokenUs: request.firstTokenUs,
        finishUs: timeUs,
        ttftUs: ttft,
        tpotUs: tpot,
      },
    });
    const mutations = engine.kv.releaseRequest(
      request.id,
      timeUs,
      this.inputs.scenario.runtime.enablePrefixCaching,
    );
    this.emitKvMutations(mutations, engine, request.id);
    const retained = mutations
      .filter((mutation) => mutation.type === 'KV_FREED' && mutation.detail.retained === true)
      .map((mutation) => mutation.blockId);
    if (retained.length > 0) this.scheduleOffload(engine, retained, timeUs);
    engine.running = engine.running.filter((id) => id !== request.id);
    engine.waiting = engine.waiting.filter((id) => id !== request.id);

    if (this.agent && request.conversationId && request.turnIndex !== undefined) {
      const nextTurn = request.turnIndex + 1;
      if (nextTurn < this.agent.turns) {
        const engineId = this.conversationEngine.get(request.conversationId) ?? engine.plan.id;
        this.eventQueue.push(
          { kind: 'AGENT_NEXT', conversationId: request.conversationId, turnIndex: nextTurn, engineId },
          timeUs + this.agent.toolWaitUs,
          0,
        );
      }
    }
  }

  private emitKvMutations(mutations: KvMutation[], engine: EngineRuntime, requestId: ID | undefined): void {
    for (const mutation of mutations) {
      const block = engine.kv.getBlock(mutation.blockId);
      this.emit(mutation.type, {
        requestId,
        targetId: engine.plan.id,
        resourceIds: [mutation.blockId],
        detail: {
          ...mutation.detail,
          blockId: mutation.blockId,
          engineId: engine.plan.id,
          poolId: engine.kv.config.poolId,
          blockIndex: block?.index ?? mutation.detail.blockIndex,
        },
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Cost model                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Measured end-to-end KV transfer bandwidth, when a kv-transfer curve matches
   * this hardware/model/framework/dtype/scope. `batch` is the number of blocks
   * in an offload/load batch (or 1 for a PD request); `seqLen` is the block
   * size for tiering transfers or the prompt length for PD. A curve whose
   * declared scope does not cover the payload is not applied.
   */
  private transferBandwidthBytesPerSecond(
    batch: number,
    seqLen: number,
  ): number | undefined {
    if (this.calibrationCurves.length === 0) return undefined;
    const dtype = String(this.inputs.scenario.assumptions.dtype ?? 'bf16');
    const candidates = this.calibrationCurves.filter(
      (curve) =>
        curve.op === 'kv-transfer' &&
        curve.hardwareProfileId === this.inputs.hardware.id &&
        curve.modelProfileId === this.inputs.model.id &&
        curve.frameworkVersion === this.inputs.framework.versionTagOrCommit &&
        curve.dtype === dtype &&
        curve.achievedBytesPerSecond !== undefined,
    );
    if (candidates.length === 0) return undefined;
    const inScope = candidates.filter(
      (curve) =>
        batch >= curve.batchMin &&
        batch <= curve.batchMax &&
        seqLen >= curve.seqLenMin &&
        seqLen <= curve.seqLenMax,
    );
    if (inScope.length === 0) {
      this.calibrationOutOfScope = true;
      return undefined;
    }
    // Multiple matches: use the slowest declared rate rather than overstating.
    const chosen = inScope.reduce((slowest, curve) =>
      curve.achievedBytesPerSecond! < slowest.achievedBytesPerSecond! ? curve : slowest,
    );
    this.appliedCurveIds.add(chosen.id);
    this.calibratedOps.add('kv-transfer');
    if (chosen.uncertaintyPct !== undefined) {
      this.calibrationUncertaintyPct = Math.max(this.calibrationUncertaintyPct ?? 0, chosen.uncertaintyPct);
    }
    return chosen.achievedBytesPerSecond;
  }

  /**
   * Use only curves whose hardware/model/framework/dtype/scope match this
   * scenario. `timeUs` is the measured whole-step duration at the curve's
   * scope midpoint, so the cost is scaled by the average work per sequence
   * (chunk tokens for Prefill, context tokens for Decode), not by the
   * aggregate step tokens. Scaling by aggregate tokens would multiply the
   * batch dimension a second time.
   */
  private calibrationFor(
    op: 'prefill' | 'decode',
    workTokens: number,
    batch: number,
    scopeSeqLen: number,
  ): Microseconds | null {
    if (this.calibrationCurves.length === 0 || workTokens <= 0 || batch <= 0) return null;
    const dtype = String(this.inputs.scenario.assumptions.dtype ?? 'bf16');
    const candidates = this.calibrationCurves.filter(
      (curve) =>
        curve.op === op &&
        curve.hardwareProfileId === this.inputs.hardware.id &&
        curve.modelProfileId === this.inputs.model.id &&
        curve.frameworkVersion === this.inputs.framework.versionTagOrCommit &&
        curve.dtype === dtype,
    );
    if (candidates.length === 0) return null;
    const inScope = candidates.filter(
      (curve) =>
        scopeSeqLen >= curve.seqLenMin &&
        scopeSeqLen <= curve.seqLenMax &&
        batch >= curve.batchMin &&
        batch <= curve.batchMax,
    );
    if (inScope.length === 0) {
      this.calibrationOutOfScope = true;
      return null;
    }
    const averageWorkPerSequence = workTokens / batch;
    inScope.sort((a, b) => a.seqLenMin + a.seqLenMax - (b.seqLenMin + b.seqLenMax));
    const midpoint = (curve: CalibrationCurve) => Math.max(1, (curve.seqLenMin + curve.seqLenMax) / 2);
    let lower = inScope[0]!;
    let upper = inScope[inScope.length - 1]!;
    for (let i = 0; i < inScope.length; i += 1) {
      if (midpoint(inScope[i]!) <= scopeSeqLen) lower = inScope[i]!;
      if (midpoint(inScope[i]!) >= scopeSeqLen) {
        upper = inScope[i]!;
        break;
      }
    }
    this.appliedCurveIds.add(lower.id);
    this.appliedCurveIds.add(upper.id);
    for (const curve of [lower, upper]) {
      if (curve.uncertaintyPct !== undefined) {
        this.calibrationUncertaintyPct = Math.max(this.calibrationUncertaintyPct ?? 0, curve.uncertaintyPct);
      }
    }
    this.calibratedOps.add(op);
    if (lower.id === upper.id || midpoint(lower) === midpoint(upper)) {
      return Math.max(1, lower.timeUs * (averageWorkPerSequence / midpoint(lower)));
    }
    const t = (scopeSeqLen - midpoint(lower)) / (midpoint(upper) - midpoint(lower));
    const perToken =
      lower.timeUs / midpoint(lower) + t * (upper.timeUs / midpoint(upper) - lower.timeUs / midpoint(lower));
    return Math.max(1, perToken * averageWorkPerSequence);
  }

  /** Budget charged for one decode step; draft tokens are proposed and verified. */
  private decodeStepCost(): number {
    return 1 + (this.inputs.scenario.runtime.speculative?.draftTokens ?? 0);
  }

  /**
   * Deterministic approximation of accepted tokens per decode step. The plan
   * exposes the fractional expectation 1 + draft × acceptance; the timeline
   * commits whole tokens, so carry the fractional part across completed steps
   * instead of flooring every step (which would bias long runs downward).
   */
  private acceptedDecodeTokens(request: SimRequest): number {
    const spec = this.inputs.scenario.runtime.speculative;
    if (!spec) return 1;
    const remaining = Math.max(1, request.outputTokens - request.numGeneratedTokens);
    const expectedPerStep = spec.draftTokens * spec.acceptanceRate;
    const step = request.decodeSteps;
    const whole = Math.floor((step + 1) * expectedPerStep) - Math.floor(step * expectedPerStep);
    const accepted = 1 + whole;
    return Math.min(accepted, remaining, spec.draftTokens + 1);
  }

  private estimateStepDuration(
    engine: EngineRuntime,
    prefillTokens: number,
    decodeSeqs: number,
    contextTokens: number,
    prefillSeqs: number,
    prefillPromptTokens: number,
    maxDecodeContextTokens: number,
  ): Microseconds {
    const rankPlans = this.plan.ranks.filter((r) => engine.plan.rankIds.includes(r.rankId));
    const computeTflops = rankPlans.reduce((sum, r) => sum + (r.computeTflops ?? 0), 0);
    const hbmBps = rankPlans.reduce((sum, r) => sum + (r.hbmReadBytesPerSecond ?? 0), 0);
    const fallbackCompute = computeTflops > 0 ? computeTflops : 30 * Math.max(1, rankPlans.length);
    const fallbackHbm = hbmBps > 0 ? hbmBps : 100_000_000_000 * Math.max(1, rankPlans.length);
    if (computeTflops <= 0 || hbmBps <= 0) {
      if (!this.timeModelFallbackUsed) {
        this.warnings.push('部分算力/HBM 带宽缺失，使用显式合成时间参数；时间指标仅为教学假设。');
        this.timeModelFallbackUsed = true;
      }
    }
    const weightBytesTotal = engine.plan.decodeWeightBytesPerRank * Math.max(1, rankPlans.length);
    const assumedBytesPerParameter = 2;
    const params = weightBytesTotal / assumedBytesPerParameter;
    const mfu = 0.35;
    const effectiveCompute = fallbackCompute * 1e12 * mfu;
    const effectiveHbm = fallbackHbm * 0.7;
    const launchOverheadUs = this.inputs.model.latencyAssumptions.decodeLaunchOverheadUs ?? 50;
    const prefillFlops = 2 * params * prefillTokens;
    const weightReadUs = weightBytesTotal > 0 ? (weightBytesTotal / effectiveHbm) * 1_000_000 : 0;
    const prefillComputeUs = effectiveCompute > 0 ? (prefillFlops / effectiveCompute) * 1_000_000 : 0;
    // Calibration scope is per sequence: an aggregate step length can be far
    // outside a curve's seqLen range even when every sequence is inside it.
    // The original prompt length selects the curve; the chunk length only
    // scales its cost inside calibrationFor().
    const prefillScopeSeqLen =
      prefillSeqs > 0 ? Math.max(1, Math.round(prefillPromptTokens / prefillSeqs)) : 0;
    const calibratedPrefillUs = this.calibrationFor('prefill', prefillTokens, prefillSeqs, prefillScopeSeqLen);
    const prefillUs =
      prefillTokens > 0
        ? calibratedPrefillUs ?? Math.max(prefillComputeUs, weightReadUs) + launchOverheadUs
        : 0;
    const decodeFlops = 2 * params * decodeSeqs;
    const kvReadBytes = contextTokens * (engine.plan.kvBytesPerBlock / Math.max(1, engine.kv.blockSize));
    const decodeHbmUs = ((weightBytesTotal + kvReadBytes) / effectiveHbm) * 1_000_000;
    const decodeComputeUs = effectiveCompute > 0 ? (decodeFlops / effectiveCompute) * 1_000_000 : 0;
    const calibratedDecodeUs = this.calibrationFor(
      'decode',
      contextTokens,
      decodeSeqs,
      Math.max(1, maxDecodeContextTokens),
    );
    const decodeUs =
      decodeSeqs > 0
        ? calibratedDecodeUs ?? Math.max(decodeComputeUs, decodeHbmUs) + launchOverheadUs
        : 0;
    const tpSize = Math.max(1, ...rankPlans.map((r) => r.tpGroupSize));
    const collectiveUs = tpSize > 1 ? 20 * Math.log2(tpSize) : 0;

    // PP adds pipeline bubbles and activation hand-off between stages. Both
    // are structural assumptions: layers split evenly and the hand-off uses a
    // synthetic 100 GB/s inter-stage path (see pipeline plan limitations).
    const ppSize = engine.plan.ppSize ?? this.plan.pipeline?.ppSize ?? 1;
    const baseUs = prefillUs + decodeUs;
    const bubbleUs = ppSize > 1 ? baseUs * (this.plan.pipeline?.bubbleFraction ?? 0) : 0;
    const activationBytesPerToken = this.plan.pipeline?.activationBytesPerToken ?? 0;
    const activationTokens = prefillTokens + decodeSeqs;
    const activationUs =
      ppSize > 1 && activationBytesPerToken > 0
        ? ((activationBytesPerToken * activationTokens * (ppSize - 1)) / 100_000_000_000) * 1_000_000
        : 0;

    const spSize = engine.plan.spSize ?? this.plan.sequenceParallel?.spSize ?? 1;
    const spUs = sequenceParallelCollectiveCostUs(spSize);
    const spec = this.plan.speculative;
    const draftUs = spec && decodeSeqs > 0 ? decodeUs * spec.draftCostRatio * spec.draftTokens : 0;

    return Math.max(1, Math.round(prefillUs + decodeUs + collectiveUs + bubbleUs + activationUs + spUs + draftUs));
  }

  /* ------------------------------------------------------------------ */
  /* Events / snapshots / metrics                                        */
  /* ------------------------------------------------------------------ */

  private emit(
    type: SimEventType,
    options: {
      requestId?: ID;
      targetId?: ID;
      resourceIds?: ID[];
      detail?: Record<string, unknown>;
      dependsOn?: ID[];
    } = {},
  ): SimEvent {
    const event: SimEvent = {
      id: `ev-${this.eventCounter.toString(36)}`,
      timeUs: this.nowUs,
      order: this.eventCounter,
      type,
      requestId: options.requestId,
      targetId: options.targetId,
      resourceIds: options.resourceIds ?? [],
      dependsOn: options.dependsOn ?? [],
      detail: options.detail ?? {},
    };
    this.eventCounter += 1;
    this.events.push(event);
    applyEvent(this.viewState, event);
    if (this.eventCounter % this.snapshotEvery === 0) {
      this.snapshots.push(snapshotViewState(this.viewState, this.eventCounter));
    }
    if (this.eventCounter % this.replayCheckpointEvery === 0) {
      this.replayCheckpoints.push(snapshotViewState(this.viewState, this.eventCounter, true));
    }
    if (type === 'SIMULATION_ENDED') this.ended = true;
    return event;
  }

  private sampleSeries(engine: EngineRuntime, budgetUsed: number): void {
    const globalWaiting = [...this.engines.values()].reduce((sum, e) => sum + e.waiting.length, 0);
    const globalRunning = [...this.engines.values()].reduce((sum, e) => sum + e.running.length, 0);
    const globalKv = [...this.engines.values()].reduce((sum, e) => sum + e.kv.usedBytes, 0);
    this.pushSeries('queue.waiting', 'Waiting requests', 'requests', 'exact', globalWaiting);
    this.pushSeries('queue.running', 'Running requests', 'requests', 'exact', globalRunning);
    this.pushSeries('kv.usedBytes', 'KV used', 'bytes', 'exact', globalKv);
    this.pushSeries('scheduler.budgetUsed', 'Token budget used', 'tokens', 'exact', budgetUsed);
    void engine;
  }

  private pushSeries(key: string, label: string, unit: string, quality: Metric['quality'], value: number): void {
    const points = this.seriesPoints.get(key) ?? [];
    const last = points[points.length - 1];
    if (last && last.timeUs === this.nowUs) {
      last.value = value;
    } else {
      points.push({ timeUs: this.nowUs, value });
    }
    this.seriesPoints.set(key, points);
  }

  private finalizeUnfinished(): void {
    for (const request of this.requests.values()) {
      if (request.status === 'FINISHED' || request.status === 'REJECTED') continue;
      request.waitingReason = request.waitingReason ?? 'SIMULATION_ENDED_BEFORE_COMPLETION';
      this.warnings.push(`请求 ${request.id} 未在仿真预算内完成（状态 ${request.status}）。`);
    }
  }

  private buildCalibrationSummary(): CalibrationSummary | undefined {
    if (this.calibrationCurves.length === 0) return undefined;
    const bothOps = this.calibratedOps.has('prefill') && this.calibratedOps.has('decode');
    const timingQuality: Metric['quality'] = bothOps && !this.calibrationOutOfScope ? 'calibrated' : 'assumption';
    return {
      importedCurves: this.calibrationCurves.length,
      appliedCurveIds: [...this.appliedCurveIds],
      timingQuality,
      outOfScope: this.calibrationOutOfScope,
      uncertaintyPct: this.calibrationUncertaintyPct,
      note:
        timingQuality === 'calibrated'
          ? `Prefill 与 Decode 均在匹配的校准范围内${this.calibrationUncertaintyPct !== null ? `；声明误差 ±${this.calibrationUncertaintyPct}%` : ''}；其余指标仍按各自来源标注。`
          : this.calibrationOutOfScope
            ? '存在超出校准范围的请求；该 Run 的时间指标降级为 assumption。'
            : this.appliedCurveIds.size === 0
              ? '没有曲线匹配当前硬件/模型/框架/dtype/范围；该 Run 的时间指标保持 assumption。'
              : '只匹配到部分阶段的校准曲线；时间指标未整体升级为 calibrated。',
    };
  }

  private buildMoeSummary(requests: RequestTrace[]): MoeRunSummary | undefined {
    const placement = this.plan.expertPlacement;
    const moe = this.inputs.model.moe;
    if (!placement || !moe || placement.assignments.length === 0) return undefined;
    const logical = placement.assignments.filter((assignment) => !assignment.replica);
    if (logical.length === 0) return undefined;
    const rankEngine = new Map(this.plan.ranks.map((rank) => [rank.rankId, rank.engineId]));
    const byEngineExpert = new Map<ID, Map<ID, ExpertAssignment>>();
    const byExpert = new Map<ID, ExpertAssignment>();
    for (const assignment of logical) {
      if (!byExpert.has(assignment.expertId)) byExpert.set(assignment.expertId, assignment);
      const engineId = rankEngine.get(assignment.rankId);
      if (!engineId) continue;
      const owners = byEngineExpert.get(engineId) ?? new Map<ID, ExpertAssignment>();
      owners.set(assignment.expertId, assignment);
      byEngineExpert.set(engineId, owners);
    }
    const loads = new Map<string, number>();
    const rng = new SeededRandom((this.inputs.scenario.seed ^ 0x51ee7) >>> 0);
    const skew = Math.max(0, Math.min(0.95, moe.hotspotSkew ?? 0.35));
    const gamma = 1 + skew * 4;
    const stride = Math.max(1, Math.floor(moe.expertCount / Math.max(1, moe.topK)));
    const sourceRankByEngine = new Map<ID, ID>();
    for (const engine of this.plan.engines) {
      sourceRankByEngine.set(engine.id, engine.rankIds[0] ?? '');
    }
    let dispatched = 0;
    let crossRank = 0;
    for (const request of requests) {
      const tokens = Math.max(0, request.promptTokens - request.cachedInputTokens) + request.generatedTokens;
      const sourceRank = sourceRankByEngine.get(request.engineId) ?? '';
      for (let token = 0; token < tokens; token += 1) {
        const base = Math.min(moe.expertCount - 1, Math.floor(Math.pow(rng.next(), gamma) * moe.expertCount));
        for (let k = 0; k < moe.topK; k += 1) {
          const expertId = `expert-${(base + k * stride) % moe.expertCount}`;
          loads.set(expertId, (loads.get(expertId) ?? 0) + 1);
          dispatched += 1;
          const owner =
            byEngineExpert.get(request.engineId)?.get(expertId) ?? byExpert.get(expertId);
          if (owner && owner.rankId !== sourceRank) crossRank += 1;
        }
      }
    }
    const meanLoad = moe.expertCount > 0 ? dispatched / moe.expertCount : 0;
    let hotspotExpertId: ID | null = null;
    let maxLoad = 0;
    const expertLoads: ExpertLoad[] = [];
    for (const [expertId, tokens] of loads) {
      const assignment = byExpert.get(expertId);
      if (!assignment) continue;
      if (tokens > maxLoad) {
        maxLoad = tokens;
        hotspotExpertId = expertId;
      }
      expertLoads.push({
        expertId,
        rankId: assignment.rankId,
        acceleratorId: assignment.acceleratorId,
        replica: false,
        tokens,
        share: dispatched > 0 ? tokens / dispatched : 0,
      });
    }
    expertLoads.sort((a, b) => b.tokens - a.tokens);
    const hiddenSize = Math.max(1, this.inputs.model.hiddenSize);
    const a2aBytes = crossRank * hiddenSize * 2;
    const fabricBps = Math.max(
      0,
      ...this.inputs.hardware.links.map((link) => link.nominalBitsPerSecond * link.effectiveRatio),
    );
    const effectiveBps = fabricBps > 0 ? fabricBps : 25 * 1e9;
    return {
      epSize: placement.epSize,
      topK: moe.topK,
      dispatchedTokens: dispatched,
      crossRankDispatches: crossRank,
      a2aBytes,
      a2aUs: (a2aBytes * 8) / effectiveBps * 1_000_000,
      hotspotRatio: meanLoad > 0 ? maxLoad / meanLoad : 1,
      hotspotExpertId,
      loads: expertLoads,
      quality: 'assumption',
    };
  }

  private buildResult(): SimulationResult {
    const requests: RequestTrace[] = [...this.requests.values()].map((request) => ({
      id: request.id,
      engineId: request.engineId,
      dpReplicaId: request.dpReplicaId,
      arrivalUs: request.arrivalUs,
      promptTokens: request.promptTokens,
      outputTokens: request.outputTokens,
      logicalInputTokens: request.promptTokens,
      cachedInputTokens: request.cachedInputTokens,
      computedPrefillTokens: request.computedPrefillTokens,
      generatedTokens: request.numGeneratedTokens,
      status: request.status,
      firstTokenUs: request.firstTokenUs,
      lastTokenUs: request.lastTokenUs,
      finishUs: request.finishUs,
      ttftUs: request.firstTokenUs !== null ? request.firstTokenUs - request.arrivalUs : null,
      tpotUs:
        request.firstTokenUs !== null && request.lastTokenUs !== null && request.numGeneratedTokens > 1
          ? (request.lastTokenUs - request.firstTokenUs) / (request.numGeneratedTokens - 1)
          : null,
      queueWaitUs: request.firstScheduledUs !== null ? request.firstScheduledUs - request.arrivalUs : 0,
      preemptions: request.preemptions,
      kvBlocksPeak: request.kvBlocksPeak,
      waitingReason: request.waitingReason,
      transferBytes: request.transferBytes,
      prefillEngineId: request.prefillEngineId ?? undefined,
      decodeEngineId: request.decodeEngineId ?? undefined,
      conversationId: request.conversationId,
      turnIndex: request.turnIndex,
      observed: request.spec.observed,
    }));

    const finished = requests.filter((r) => r.status === 'FINISHED');
    const ttfts = finished.map((r) => r.ttftUs).filter((v): v is number => v !== null);
    const tpots = finished.map((r) => r.tpotUs).filter((v): v is number => v !== null);
    const queueWaits = finished.map((r) => r.queueWaitUs);
    const e2es = finished
      .map((r) => (r.finishUs !== null ? r.finishUs - r.arrivalUs : null))
      .filter((v): v is number => v !== null);
    const totalOutputTokens = finished.reduce((sum, r) => sum + r.generatedTokens, 0);
    const firstArrival = requests.length > 0 ? Math.min(...requests.map((r) => r.arrivalUs)) : 0;
    const endedAtUs = this.events.length > 0 ? this.events[this.events.length - 1]!.timeUs : 0;
    const durationSeconds = Math.max(1e-6, (endedAtUs - firstArrival) / 1_000_000);
    const engineStats = [...this.engines.values()];
    const kvHits = engineStats.reduce((sum, e) => sum + e.kv.stats.hits, 0);
    const kvEvictions = engineStats.reduce((sum, e) => sum + e.kv.stats.evictions, 0);
    const kvPeakBytes = engineStats.reduce((sum, e) => sum + e.kvPeakBytes, 0);
    const kvPeakBlocks = engineStats.reduce((sum, e) => sum + e.kvPeakBlocks, 0);
    const prefillTokens = engineStats.reduce((sum, e) => sum + e.totalPrefillTokens, 0);
    const decodeTokens = engineStats.reduce((sum, e) => sum + e.totalDecodeTokens, 0);
    const steps = engineStats.reduce((sum, e) => sum + e.stepCount, 0);
    const preemptions = requests.reduce((sum, r) => sum + r.preemptions, 0);
    const transferEvents = this.events.filter((event) => event.type === 'TRANSFER_STARTED');
    const hostLoads = transferEvents.filter((event) => event.detail.kind === 'HOST_LOAD').length;
    const offloads = transferEvents.filter((event) => event.detail.kind === 'OFFLOAD').length;
    const hostBlocks = engineStats.reduce((sum, e) => sum + e.kv.hostUsedBlocks, 0);

    const metric = (
      key: string,
      label: string,
      value: number | null,
      unit: string,
      quality: Metric['quality'],
      group?: string,
      reason?: string,
    ): Metric => ({
      key,
      label,
      value,
      unit,
      quality,
      evidenceIds: quality === 'assumption' ? ['evidence:cost-model'] : [],
      group,
      reason,
    });

    const moe = this.buildMoeSummary(requests);
    const calibration = this.buildCalibrationSummary();
    const timingQuality: Metric['quality'] = calibration?.timingQuality ?? 'assumption';
    const timingReason =
      timingQuality === 'calibrated'
        ? `已应用匹配的实测校准曲线；仅覆盖校准范围${calibration?.uncertaintyPct !== null && calibration?.uncertaintyPct !== undefined ? `；声明误差 ±${calibration.uncertaintyPct}%` : ''}。`
        : '基于合成成本模型，非实测。';

    const metrics: Metric[] = [
      metric('requests.total', '总请求数', requests.length, 'requests', 'exact', 'requests'),
      metric('requests.finished', '完成请求数', finished.length, 'requests', 'exact', 'requests'),
      metric('requests.rejected', '拒绝请求数', requests.filter((r) => r.status === 'REJECTED').length, 'requests', 'exact', 'requests'),
      metric('requests.unfinished', '未完成请求数', requests.length - finished.length - requests.filter((r) => r.status === 'REJECTED').length, 'requests', 'exact', 'requests'),
      metric('ttft.p50', 'TTFT P50', percentile(ttfts, 50), 'µs', timingQuality, 'latency', timingReason),
      metric('ttft.p95', 'TTFT P95', percentile(ttfts, 95), 'µs', timingQuality, 'latency', timingReason),
      metric('ttft.p99', 'TTFT P99', percentile(ttfts, 99), 'µs', timingQuality, 'latency', timingReason),
      metric('tpot.p50', 'TPOT P50', percentile(tpots, 50), 'µs', timingQuality, 'latency', '输出 Token <= 1 时为 N/A。'),
      metric('tpot.p95', 'TPOT P95', percentile(tpots, 95), 'µs', timingQuality, 'latency', '输出 Token <= 1 时为 N/A。'),
      metric('queue.wait.p50', '排队等待 P50', percentile(queueWaits, 50), 'µs', timingQuality, 'latency'),
      metric('e2e.p95', '端到端 P95', percentile(e2es, 95), 'µs', timingQuality, 'latency'),
      metric('throughput.outputTokensPerSec', '输出吞吐', totalOutputTokens / durationSeconds, 'tokens/s', timingQuality, 'throughput', timingReason),
      metric('throughput.requestsPerSec', '请求吞吐', finished.length / durationSeconds, 'req/s', timingQuality, 'throughput'),
      metric('kv.hits', 'Prefix Cache 命中 Block 数', kvHits, 'blocks', 'exact', 'cache'),
      metric('kv.evictions', 'KV 淘汰 Block 数', kvEvictions, 'blocks', 'exact', 'cache'),
      metric('kv.peakBytes', 'KV 峰值占用', kvPeakBytes, 'bytes', 'exact', 'cache'),
      metric('kv.peakBlocks', 'KV 峰值 Block 数', kvPeakBlocks, 'blocks', 'exact', 'cache'),
      metric('prefill.tokens', 'Prefill 计算 Token 数', prefillTokens, 'tokens', 'exact', 'scheduler'),
      metric('decode.tokens', 'Decode 计算 Token 数', decodeTokens, 'tokens', 'exact', 'scheduler'),
      metric('scheduler.steps', '调度步数', steps, 'steps', 'exact', 'scheduler'),
      metric('scheduler.preemptions', '抢占次数', preemptions, 'events', 'exact', 'scheduler'),
      metric(
        'transfer.bytes',
        'KV 传输字节',
        transferEvents.reduce((sum, event) => sum + Number(event.detail.bytes ?? 0), 0),
        'bytes',
        'exact',
        'transport',
      ),
      metric('transfer.count', 'KV 传输次数', transferEvents.length, 'events', 'exact', 'transport'),
      metric('transfer.hostLoads', 'Host → HBM 加载次数', hostLoads, 'events', 'exact', 'transport'),
      metric('transfer.offloads', 'HBM → Host 写回次数', offloads, 'events', 'exact', 'transport'),
      metric('kv.hostBlocks', 'Host 驻留 KV Block 数', hostBlocks, 'blocks', 'exact', 'cache'),
    ];

    if (this.plan.pipeline) {
      metrics.push(
        metric(
          'pipeline.bubbleFraction',
          'Pipeline Bubble 比例',
          this.plan.pipeline.bubbleFraction,
          'fraction',
          'assumption',
          'pipeline',
          '按 max_num_seqs 个理想微批估算；未模拟 Stage 负载不均。',
        ),
        metric(
          'pipeline.activationBytesPerToken',
          '跨 Stage Activation 字节/Token',
          this.plan.pipeline.activationBytesPerToken,
          'bytes/token',
          'assumption',
          'pipeline',
        ),
      );
    }
    if (this.plan.sequenceParallel) {
      metrics.push(
        metric(
          'sp.collectiveUs',
          'SP 单步 Collective 成本',
          this.plan.sequenceParallel.collectiveCostUs,
          'µs',
          'assumption',
          'pipeline',
          '按 log2(spSize) 估算，未按具体 All-Gather/Reduce-Scatter 实现标定。',
        ),
      );
    }
    if (this.plan.speculative) {
      const speculative = this.plan.speculative;
      const speculativeKnown =
        speculative.frameworkSupport === 'supported' || speculative.frameworkSupport === 'partial';
      metrics.push(
        metric(
          'speculative.expectedAcceptedTokensPerStep',
          '投机解码期望接受 Token/步',
          speculativeKnown ? speculative.expectedAcceptedTokensPerStep : null,
          'tokens/step',
          speculativeKnown ? 'assumption' : 'unavailable',
          'scheduler',
          speculativeKnown ? speculative.note : '适配器未声明支持该方法；不提供接受数结论。',
        ),
        metric(
          'speculative.expectedDecodeSpeedup',
          '投机解码期望加速比',
          speculativeKnown ? speculative.expectedDecodeSpeedup : null,
          'x',
          speculativeKnown ? 'assumption' : 'unavailable',
          'scheduler',
          speculativeKnown
            ? '收益取决于接受率与 Draft 成本，不是固定加速比。'
            : '适配器未声明支持该方法；不提供加速结论。',
        ),
      );
    }

    const observedTtfts = requests
      .map((request) => request.observed?.ttftUs)
      .filter((value): value is number => value !== undefined);
    const observedTpots = requests
      .map((request) => request.observed?.tpotUs)
      .filter((value): value is number => value !== undefined);
    if (observedTtfts.length > 0) {
      metrics.push(
        metric(
          'observed.ttft.p50',
          'Observed TTFT P50',
          percentile(observedTtfts, 50),
          'µs',
          'calibrated',
          'observed',
          '来自导入 Trace 的实测 TTFT；未被仿真器改写。',
        ),
      );
    }
    if (observedTpots.length > 0) {
      metrics.push(
        metric(
          'observed.tpot.p50',
          'Observed TPOT P50',
          percentile(observedTpots, 50),
          'µs',
          'calibrated',
          'observed',
          '来自导入 Trace 的实测 TPOT；未被仿真器改写。',
        ),
      );
    }
    if (moe) {
      metrics.push(
        metric('moe.dispatchTokens', '专家路由 Token 次数', moe.dispatchedTokens, 'routings', moe.quality, 'moe', '按 topK 展开的合成路由计数。'),
        metric('moe.a2aBytes', 'All-to-All 字节', moe.a2aBytes, 'bytes', moe.quality, 'moe', '跨 Rank 专家分发的合成字节数。'),
        metric('moe.a2aUs', 'All-to-All 估算耗时', moe.a2aUs, 'µs', moe.quality, 'moe', '按共享互联容量估算，非实测。'),
        metric('moe.hotspotRatio', '专家热点比', moe.hotspotRatio, 'x', moe.quality, 'moe', '最热专家负载 / 均衡负载。'),
      );
    }

    const series: MetricSeries[] = [...this.seriesPoints.entries()].map(([key, points]) => ({
      key,
      label:
        key === 'queue.waiting'
          ? 'Waiting requests'
          : key === 'queue.running'
            ? 'Running requests'
            : key === 'kv.usedBytes'
              ? 'KV used'
              : 'Token budget used',
      unit: key === 'kv.usedBytes' ? 'bytes' : key === 'scheduler.budgetUsed' ? 'tokens' : 'requests',
      quality: 'exact',
      points: downsample(points, MAX_SERIES_POINTS),
    }));

    const assumptionsUsed: Evidence[] = [
      {
        kind: 'assumed',
        note: '计算/传输时间使用教学成本模型：max(FLOPs/有效算力, 权重与 KV 读取/有效 HBM 带宽) + 固定开销。',
      },
      {
        kind: 'assumed',
        note: 'vLLM V1 调度为可解释子集，不是逐行复刻官方源码。',
      },
      {
        kind: 'assumed',
        note: 'Token 内容仅使用确定性指纹，不执行真实 Transformer。',
      },
    ];

    const limitations = [
      ...this.plan.limitations,
      '时间指标为仿真估计，未经真实硬件校准。',
      'KV Block 逻辑池按每个 Rank 最小容量建模；未对每 Rank 单独分配。',
      'M2 子集调度未覆盖全部 vLLM 版本特性。',
      'PD 传输按逻辑 Block 聚合；PD_LAYERWISE_PUSH 未建模逐层重叠，仅按同一链路路径计时。',
      'CPU Offload 以完整 Block 为单位，不建模逐层流水；Host Hit 加载期间请求暂停调度。',
    ];

    return {
      schemaVersion: '1.0',
      engineVersion: ENGINE_VERSION,
      scenario: this.inputs.scenario,
      plan: this.plan,
      events: this.events,
      metrics,
      series,
      requests,
      snapshots: this.snapshots,
      replayCheckpoints: this.replayCheckpoints,
      moe,
      calibration,
      assumptionsUsed,
      limitations,
      seed: this.inputs.scenario.seed,
      endedAtUs,
      eventCount: this.events.length,
      warnings: this.warnings,
    };
  }
}

function downsample(points: MetricSeriesPoint[], maxPoints: number): MetricSeriesPoint[] {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const result: MetricSeriesPoint[] = [];
  for (let i = 0; i < points.length; i += stride) {
    result.push(points[i]!);
  }
  const last = points[points.length - 1]!;
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

export function runSimulation(inputs: SimulationInputs, options?: RunOptions): SimulationResult {
  const simulator = new Simulator(inputs);
  return simulator.run(options);
}

export function summarizeRequests(requests: RequestTrace[]): {
  ttftP50: number | null;
  tpotP50: number | null;
  queueP50: number | null;
} {
  const finished = requests.filter((r) => r.status === 'FINISHED');
  return {
    ttftP50: percentile(finished.map((r) => r.ttftUs).filter((v): v is number => v !== null), 50),
    tpotP50: percentile(finished.map((r) => r.tpotUs).filter((v): v is number => v !== null), 50),
    queueP50: percentile(finished.map((r) => r.queueWaitUs), 50),
  };
}

export { mean };
