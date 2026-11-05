import {
  generateContextParallelDeployment,
  generateDeployment,
  generatePdDeployment,
  type Deployment,
  type HardwareProfile,
  type Scenario,
  type ValidationIssue,
  type WorkloadConfig,
} from '@inferencelab/core';
import {
  cloneScenario,
  getScenarioPreset,
  hardwareProfiles,
  modelProfiles,
  scenarioPresets,
} from '@inferencelab/profiles';

export { scenarioPresets, hardwareProfiles, modelProfiles };

export const DEFAULT_PRESET_ID = 'toy-32gpu-tp16-dp2';

export function createInitialScenario(): Scenario {
  const preset = getScenarioPreset(DEFAULT_PRESET_ID) ?? scenarioPresets[0]!;
  return cloneScenario(preset.scenario);
}

export function presetForScenario(scenario: Scenario): string | null {
  const preset = scenarioPresets.find((item) => item.scenario.id === scenario.id);
  return preset?.id ?? null;
}

export function hardwareFor(scenario: Scenario) {
  return hardwareProfiles.find((item) => item.id === scenario.hardwareProfileId);
}

export function modelFor(scenario: Scenario) {
  return modelProfiles.find((item) => item.id === scenario.modelProfileId);
}

export function isPdScenario(scenario: Scenario): boolean {
  return scenario.deployment.engines.some((engine) => engine.role !== 'mixed');
}

export function tpDpOf(scenario: Scenario): { tp: number; dp: number } {
  return {
    tp: scenario.deployment.logicalParallelism.tp ?? 1,
    dp: scenario.deployment.logicalParallelism.dp ?? 1,
  };
}

export function pdDimsOf(scenario: Scenario): {
  prefillTp: number;
  prefillDp: number;
  decodeTp: number;
  decodeDp: number;
} {
  return {
    prefillTp: scenario.deployment.logicalParallelism.prefillTp ?? 1,
    prefillDp: scenario.deployment.logicalParallelism.prefillDp ?? 1,
    decodeTp: scenario.deployment.logicalParallelism.decodeTp ?? 1,
    decodeDp: scenario.deployment.logicalParallelism.decodeDp ?? 1,
  };
}

/** Only PD transport strategies are meaningful for a PD deployment. */
export function pdStrategyOf(
  scenario: Scenario,
): 'PD_PULL' | 'PD_LAYERWISE_PUSH' | 'PD_HOST_STAGING' {
  const strategy = scenario.deployment.kvTransfer?.strategy;
  if (strategy === 'PD_LAYERWISE_PUSH' || strategy === 'PD_HOST_STAGING') return strategy;
  return 'PD_PULL';
}

export function withKvTransferStrategy(
  scenario: Scenario,
  strategy: 'PD_PULL' | 'PD_LAYERWISE_PUSH' | 'PD_HOST_STAGING',
): Scenario {
  const next = cloneScenario(scenario);
  next.deployment.kvTransfer = { ...next.deployment.kvTransfer, strategy };
  return next;
}

function deploymentIssue(message: string, path: string): ValidationIssue {
  return {
    severity: 'error',
    code: 'UI_DEPLOYMENT_REBUILD',
    path,
    message,
    suggestedFix: '降低并行度，或选择拥有更多加速卡的硬件 Profile。',
  };
}

function topologyResetIssue(message: string, path: string): ValidationIssue {
  return {
    severity: 'warning',
    code: 'TOPOLOGY_ADVANCED_RESET',
    path,
    message,
    suggestedFix: '重新选择该并行维度，或使用对应的预设模板。',
  };
}

/** EP groups are scoped to one Engine so a DP replica never owns half a group. */
function applyEpGroups(deployment: Deployment, ep: number): Deployment {
  const nextIndex = new Map<string, number>();
  const ranks = deployment.placement.ranks.map((rank) => {
    const index = nextIndex.get(rank.engineId) ?? 0;
    nextIndex.set(rank.engineId, index + 1);
    return { ...rank, epGroupIds: [`ep-${rank.engineId}-${index % ep}`] };
  });
  return {
    ...deployment,
    placement: { ranks },
    logicalParallelism: { ...deployment.logicalParallelism, ep },
  };
}

function canApplyEpGroups(deployment: Deployment, ep: number): boolean {
  const ranksPerEngine = new Map<string, number>();
  for (const rank of deployment.placement.ranks) {
    ranksPerEngine.set(rank.engineId, (ranksPerEngine.get(rank.engineId) ?? 0) + 1);
  }
  return ranksPerEngine.size > 0 && [...ranksPerEngine.values()].every((count) => count % ep === 0);
}

/**
 * Rebuild a mixed deployment while preserving the advanced dimensions that
 * the generator can represent. CP uses its own generator; PP/SP are passed to
 * the mixed generator; EP is re-applied per Engine when the rank count is
 * compatible. If EP cannot be represented, it is explicitly reset rather than
 * leaving logicalParallelism.ep pointing at groups that do not exist.
 */
function regenerateMixed(
  scenario: Scenario,
  hardware: HardwareProfile,
  tp: number,
  dp: number,
): { scenario: Scenario; issues: ValidationIssue[] } {
  const logical = scenario.deployment.logicalParallelism;
  const pp = Math.max(1, logical.pp ?? 1);
  const sp = Math.max(1, scenario.runtime.spSize ?? logical.sp ?? 1);
  const pcp = Math.max(1, scenario.runtime.pcpSize ?? logical.pcp ?? 1);
  const dcp = Math.max(1, scenario.runtime.dcpSize ?? logical.dcp ?? 1);
  const ep = Math.max(1, logical.ep ?? 1);
  const next = cloneScenario(scenario);

  if (pcp > 1 || dcp > 1) {
    const generated = generateContextParallelDeployment(hardware, { tp, dp, pcp, dcp });
    if (generated.issues.some((issue) => issue.severity === 'error')) {
      return { scenario, issues: generated.issues };
    }
    next.deployment = {
      ...generated.deployment,
      kvTransfer: scenario.deployment.kvTransfer,
      routing: generated.deployment.routing,
    };
    return { scenario: next, issues: generated.issues };
  }

  const generated = generateDeployment(hardware, { tp, dp, pp, sp });
  if (generated.issues.some((issue) => issue.severity === 'error')) {
    return { scenario, issues: generated.issues };
  }
  const issues = [...generated.issues];
  let deployment = generated.deployment;
  if (ep > 1) {
    if (canApplyEpGroups(deployment, ep)) {
      deployment = applyEpGroups(deployment, ep);
    } else {
      issues.push(
        topologyResetIssue(
          `TP/DP 调整后每个 Engine 的 Rank 数不能整除 EP=${ep}；已关闭 EP，避免逻辑参数与放置不一致。`,
          'deployment.logicalParallelism.ep',
        ),
      );
      next.runtime = { ...next.runtime, enableExpertParallel: false };
    }
  }
  next.deployment = {
    ...deployment,
    kvTransfer: scenario.deployment.kvTransfer,
    routing: deployment.routing,
  };
  return { scenario: next, issues };
}

/** Number of physical ranks one TP replica consumes in the current topology. */
function ranksPerReplica(scenario: Scenario): number {
  const logical = scenario.deployment.logicalParallelism;
  const pcp = Math.max(1, scenario.runtime.pcpSize ?? logical.pcp ?? 1);
  const pp = Math.max(1, logical.pp ?? 1);
  return Math.max(1, pcp > 1 ? pcp : pp);
}

/** Keeps total accelerator usage constant by deriving DP from TP when possible. */
export function withMixedTp(scenario: Scenario, tp: number): { scenario: Scenario; issues: ValidationIssue[] } {
  if (isPdScenario(scenario)) {
    return {
      scenario,
      issues: [deploymentIssue('PD 分离场景请调整 Prefill/Decode 并行度，而不是混合 TP。', 'deployment.logicalParallelism')],
    };
  }
  const hardware = hardwareFor(scenario);
  if (!hardware) return { scenario, issues: [deploymentIssue('硬件 Profile 不存在。', 'hardwareProfileId')] };
  const deviceCount = hardware.accelerators.length;
  const unit = ranksPerReplica(scenario);
  const safeTp = Math.max(1, Math.min(tp, deviceCount));
  if (safeTp * unit > deviceCount) {
    return {
      scenario,
      issues: [
        deploymentIssue(
          `TP=${safeTp} 与当前 PP/PCP=${unit} 需要 ${safeTp * unit} 张卡，但硬件只有 ${deviceCount} 张。`,
          'deployment.placement',
        ),
      ],
    };
  }
  const dp = Math.max(1, Math.floor(deviceCount / (safeTp * unit)));
  return regenerateMixed(scenario, hardware, safeTp, dp);
}

export function withMixedDp(scenario: Scenario, dp: number): { scenario: Scenario; issues: ValidationIssue[] } {
  if (isPdScenario(scenario)) {
    return {
      scenario,
      issues: [deploymentIssue('PD 分离场景请调整 Prefill/Decode 并行度，而不是混合 DP。', 'deployment.logicalParallelism')],
    };
  }
  const hardware = hardwareFor(scenario);
  if (!hardware) return { scenario, issues: [deploymentIssue('硬件 Profile 不存在。', 'hardwareProfileId')] };
  const { tp } = tpDpOf(scenario);
  const unit = ranksPerReplica(scenario);
  const safeDp = Math.max(1, Math.min(dp, Math.floor(hardware.accelerators.length / Math.max(1, tp * unit))));
  return regenerateMixed(scenario, hardware, tp, safeDp);
}

export function withPdDims(
  scenario: Scenario,
  dims: Partial<{ prefillTp: number; prefillDp: number; decodeTp: number; decodeDp: number }>,
): { scenario: Scenario; issues: ValidationIssue[] } {
  const hardware = hardwareFor(scenario);
  if (!hardware) return { scenario, issues: [deploymentIssue('硬件 Profile 不存在。', 'hardwareProfileId')] };
  const current = pdDimsOf(scenario);
  const nextDims = {
    prefillTp: Math.max(1, dims.prefillTp ?? current.prefillTp),
    prefillDp: Math.max(1, dims.prefillDp ?? current.prefillDp),
    decodeTp: Math.max(1, dims.decodeTp ?? current.decodeTp),
    decodeDp: Math.max(1, dims.decodeDp ?? current.decodeDp),
  };
  const generated = generatePdDeployment(hardware, {
    ...nextDims,
    strategy: pdStrategyOf(scenario),
  });
  if (generated.issues.some((issue) => issue.severity === 'error')) {
    return { scenario, issues: generated.issues };
  }
  const next = cloneScenario(scenario);
  next.deployment = generated.deployment;
  next.deployment.logicalParallelism = { ...next.deployment.logicalParallelism, ...nextDims };
  return { scenario: next, issues: generated.issues };
}

export function withHardware(scenario: Scenario, hardwareId: string): { scenario: Scenario; issues: ValidationIssue[] } {
  const hardware = hardwareProfiles.find((item) => item.id === hardwareId);
  if (!hardware) return { scenario, issues: [deploymentIssue('硬件 Profile 不存在。', 'hardwareProfileId')] };

  if (isPdScenario(scenario)) {
    const dims = pdDimsOf(scenario);
    const strategy = pdStrategyOf(scenario);
    const generated = generatePdDeployment(hardware, { ...dims, strategy });
    if (generated.issues.some((issue) => issue.severity === 'error')) {
      return { scenario, issues: generated.issues };
    }
    const next = cloneScenario(scenario);
    next.hardwareProfileId = hardwareId;
    next.deployment = {
      ...generated.deployment,
      // Keep the host cache capacity when the user switches hardware; the
      // generated PD deployment only knows the transport strategy.
      kvTransfer: { ...generated.deployment.kvTransfer, ...scenario.deployment.kvTransfer, strategy },
      routing: generated.deployment.routing,
    };
    return { scenario: next, issues: generated.issues };
  }

  const deviceCount = hardware.accelerators.length;
  const { tp } = tpDpOf(scenario);
  const unit = ranksPerReplica(scenario);
  const safeTp = Math.max(1, Math.min(tp, deviceCount));
  if (safeTp * unit > deviceCount) {
    return {
      scenario,
      issues: [
        deploymentIssue(
          `TP=${safeTp} 与当前 PP/PCP=${unit} 需要 ${safeTp * unit} 张卡，但硬件只有 ${deviceCount} 张。`,
          'deployment.placement',
        ),
      ],
    };
  }
  const dp = Math.max(1, Math.floor(deviceCount / (safeTp * unit)));
  const base = cloneScenario(scenario);
  base.hardwareProfileId = hardwareId;
  return regenerateMixed(base, hardware, safeTp, dp);
}

export function withModel(scenario: Scenario, modelId: string): Scenario {
  const next = cloneScenario(scenario);
  next.modelProfileId = modelId;
  return next;
}

export function withRuntime(scenario: Scenario, patch: Partial<Scenario['runtime']>): Scenario {
  const next = cloneScenario(scenario);
  next.runtime = { ...next.runtime, ...patch };
  return next;
}

export function withWorkload(scenario: Scenario, workload: WorkloadConfig): Scenario {
  const next = cloneScenario(scenario);
  next.workload = workload;
  return next;
}

export function withFixedWorkload(
  scenario: Scenario,
  patch: Partial<Extract<WorkloadConfig, { kind: 'fixed' }>>,
): Scenario {
  const current = scenario.workload.kind === 'fixed'
    ? scenario.workload
    : { kind: 'fixed' as const, count: 4, promptTokens: 1024, outputTokens: 64, atUs: 0 };
  return withWorkload(scenario, { ...current, ...patch });
}

export function scenarioSummary(scenario: Scenario): string {
  if (isPdScenario(scenario)) {
    const dims = pdDimsOf(scenario);
    return `P${dims.prefillTp}×${dims.prefillDp} + D${dims.decodeTp}×${dims.decodeDp}`;
  }
  const { tp, dp } = tpDpOf(scenario);
  return `TP${tp} × DP${dp}`;
}

export function workloadSummary(scenario: Scenario): string {
  const workload = scenario.workload;
  switch (workload.kind) {
    case 'trace':
      return `Trace · ${workload.requests.length} 请求`;
    case 'fixed':
      return `固定 · ${workload.count} × (${workload.promptTokens}+${workload.outputTokens})`;
    case 'poisson':
      return `Poisson · ${workload.count} 请求 @ ${workload.arrivalRatePerSecond}/s`;
    case 'agent':
      return `Agent · ${workload.conversations} 会话 × ${workload.turns} 轮`;
    default:
      return '未知负载';
  }
}
