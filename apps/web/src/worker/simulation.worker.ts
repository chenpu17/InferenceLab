import {
  planScenario,
  runSimulation,
  validateScenarioStructure,
  type PlanResult,
  type RunOptions,
  type Scenario,
  type SimEvent,
  type SimulationResult,
  type StateSnapshot,
  type ValidationIssue,
} from '@inferencelab/core';
import { getProfileBundle } from '@inferencelab/profiles';

export type WorkerRequest =
  | { id: number; kind: 'plan'; scenario: Scenario }
  | { id: number; kind: 'run'; scenario: Scenario; options?: RunOptions };

export type PlanResponse =
  | { ok: true; plan: PlanResult; issues: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export type RunResponse =
  | { ok: true; result: SimulationResult }
  | { ok: false; message: string; code?: string; issues?: ValidationIssue[] };

export type RunHeader = Omit<SimulationResult, 'events' | 'replayCheckpoints' | 'snapshots'> & {
  eventCount: number;
  checkpointCount: number;
};

export type WorkerResponse =
  | ({ id: number; kind: 'plan' } & PlanResponse)
  | ({ id: number; kind: 'run' } & RunResponse)
  | { id: number; kind: 'run-header'; ok: true; header: RunHeader; totalChunks: number }
  | { id: number; kind: 'run-chunk'; ok: true; index: number; events: SimEvent[] }
  | { id: number; kind: 'run-checkpoint'; ok: true; index: number; checkpoint: StateSnapshot };

interface WorkerScope {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;

function planRequest(scenario: Scenario): PlanResponse {
  const structural = validateScenarioStructure(scenario);
  if (!structural.ok) return { ok: false, issues: structural.issues };
  try {
    const bundle = getProfileBundle(structural.scenario);
    const plan = planScenario({ scenario: structural.scenario, ...bundle });
    return { ok: true, plan, issues: plan.issues };
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'PROFILE_MISSING',
          path: 'hardwareProfileId',
          message: error instanceof Error ? error.message : String(error),
          suggestedFix: '选择内置 Profile；当前 UI 不支持导入，需在 packages/profiles 中扩展后重新构建。',
        },
      ],
    };
  }
}

function runRequest(scenario: Scenario, options?: RunOptions): RunResponse {
  const structural = validateScenarioStructure(scenario);
  if (!structural.ok) return { ok: false, message: 'Scenario 结构校验失败。', issues: structural.issues };
  try {
    const bundle = getProfileBundle(structural.scenario);
    const plan = planScenario({ scenario: structural.scenario, ...bundle });
    if (plan.feasibility === 'infeasible') {
      return {
        ok: false,
        code: 'INFEASIBLE',
        message: 'Plan 不可行：请先修复 HBM / 放置 / 功能支持错误。',
        issues: plan.issues,
      };
    }
    if (plan.feasibility === 'unknown' && structural.scenario.assumptions.allowSyntheticTiming !== true) {
      return {
        ok: false,
        code: 'UNKNOWN_REQUIRES_CONSENT',
        message: 'Plan 为 unknown：需要显式选择“仅结构查看”或“使用已标注合成参数模拟”。',
        issues: plan.issues,
      };
    }
    const result = runSimulation({ scenario: structural.scenario, ...bundle }, options);
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      issues: [],
    };
  }
}

const RUN_CHUNK_EVENTS = 4000;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.kind === 'plan') {
    const response = planRequest(request.scenario);
    scope.postMessage({ id: request.id, kind: 'plan', ...response });
    return;
  }
  const response = runRequest(request.scenario, request.options);
  if (!response.ok) {
    scope.postMessage({ id: request.id, kind: 'run', ...response });
    return;
  }
  const { events, replayCheckpoints, snapshots: _snapshots, ...rest } = response.result;
  const checkpoints = replayCheckpoints ?? [];
  const totalChunks = Math.max(1, Math.ceil(events.length / RUN_CHUNK_EVENTS));
  // Timeline snapshots are only used inside the simulator. Replay needs the
  // event log and sparse replay checkpoints, so do not clone snapshots to the
  // main thread or retain them in every run-history entry.
  const header: RunHeader = { ...rest, eventCount: events.length, checkpointCount: checkpoints.length };
  scope.postMessage({ id: request.id, kind: 'run-header', ok: true, header, totalChunks });
  for (let index = 0; index < totalChunks; index += 1) {
    scope.postMessage({
      id: request.id,
      kind: 'run-chunk',
      ok: true,
      index,
      events: events.slice(index * RUN_CHUNK_EVENTS, (index + 1) * RUN_CHUNK_EVENTS),
    });
  }
  for (let index = 0; index < checkpoints.length; index += 1) {
    scope.postMessage({
      id: request.id,
      kind: 'run-checkpoint',
      ok: true,
      index,
      checkpoint: checkpoints[index]!,
    });
  }
};
