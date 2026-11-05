import { z } from 'zod';
import { resolveHostCacheBytes } from '../domain/config.js';
import type {
  FrameworkProfile,
  HardwareProfile,
  ModelProfile,
  Scenario,
  ValidationIssue,
} from '../domain/types.js';

const id = z.string().min(1).max(128);
const nonNegativeInt = z.number().int().min(0);

const engineSchema = z
  .object({
    id,
    role: z.enum(['mixed', 'prefill', 'decode']),
    rankIds: z.array(id),
    schedulerId: id,
    cacheManagerId: id,
    kvTransferStrategyId: id.optional(),
  })
  .strict();

const rankPlacementSchema = z
  .object({
    rankId: id,
    engineId: id,
    acceleratorId: id,
    dpReplicaId: id,
    tpGroupId: id.optional(),
    epGroupIds: z.array(id).optional(),
    ppStageId: id.optional(),
    ppStageIndex: z.number().int().min(0).optional(),
    pcpGroupId: id.optional(),
    dcpGroupId: id.optional(),
    spGroupId: id.optional(),
  })
  .strict();

const routingSchema = z.union([
  z.object({ kind: z.literal('fixed'), assignments: z.record(id, id).optional() }).strict(),
  z.object({ kind: z.literal('round-robin') }).strict(),
  z.object({ kind: z.literal('sticky') }).strict(),
]);

const deploymentSchema = z
  .object({
    engines: z.array(engineSchema).min(1),
    placement: z.object({ ranks: z.array(rankPlacementSchema).min(1) }).strict(),
    logicalParallelism: z.record(z.string(), z.number().int().min(1)),
    routing: routingSchema.optional(),
    kvTransfer: z
      .object({
        strategy: z.enum(['GPU_LOCAL', 'CPU_OFFLOAD', 'PD_PULL', 'PD_LAYERWISE_PUSH', 'PD_HOST_STAGING']),
        hostCacheBytes: nonNegativeInt.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const speculativeSchema = z
  .object({
    method: z.enum(['mtp', 'dspark']),
    draftTokens: z.number().int().min(1).max(16),
    acceptanceRate: z.number().min(0).max(1),
    draftCostRatio: z.number().min(0).max(2).optional(),
  })
  .strict();

const runtimeSchema = z
  .object({
    maxModelLen: z.number().int().min(1),
    maxNumSeqs: z.number().int().min(1),
    maxNumBatchedTokens: z.number().int().min(1),
    blockSize: z.number().int().min(1),
    enableChunkedPrefill: z.boolean(),
    enablePrefixCaching: z.boolean(),
    gpuMemoryUtilization: z.number().gt(0).max(1).optional(),
    kvCacheMemoryBytes: nonNegativeInt.optional(),
    preemptionPolicy: z.enum(['recompute', 'none', 'backend-specific']),
    enableCpuOffload: z.boolean().optional(),
    hostCacheBytes: nonNegativeInt.optional(),
    enableExpertParallel: z.boolean().optional(),
    pcpSize: z.number().int().min(1).optional(),
    dcpSize: z.number().int().min(1).optional(),
    spSize: z.number().int().min(1).optional(),
    speculative: speculativeSchema.optional(),
  })
  .strict();

const prefixBlockSchema = z.object({ hash: id, tokenCount: z.number().int().min(1) }).strict();

const observedMetricsSchema = z
  .object({
    ttftUs: z.number().min(0).optional(),
    tpotUs: z.number().min(0).optional(),
    finishUs: z.number().min(0).optional(),
    source: z.string().optional(),
  })
  .strict();

const requestSchema = z
  .object({
    id,
    atUs: nonNegativeInt,
    promptTokens: nonNegativeInt,
    outputTokens: nonNegativeInt,
    prefixBlocks: z.array(prefixBlockSchema).optional(),
    conversationId: id.optional(),
    turnIndex: z.number().int().min(0).optional(),
    priority: z.number().int().optional(),
    observed: observedMetricsSchema.optional(),
  })
  .strict();

const workloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('trace'), requests: z.array(requestSchema) }).strict(),
  z
    .object({
      kind: z.literal('fixed'),
      count: nonNegativeInt,
      promptTokens: nonNegativeInt,
      outputTokens: nonNegativeInt,
      atUs: nonNegativeInt,
    })
    .strict(),
  z
    .object({
      kind: z.literal('poisson'),
      count: nonNegativeInt,
      arrivalRatePerSecond: z.number().gt(0),
      promptTokens: nonNegativeInt,
      outputTokens: nonNegativeInt,
    })
    .strict(),
  z
    .object({
      kind: z.literal('agent'),
      conversations: z.number().int().min(1),
      turns: z.number().int().min(1),
      baseSystemTokens: nonNegativeInt,
      turnIncrementTokens: nonNegativeInt,
      outputTokens: nonNegativeInt,
      toolWaitUs: nonNegativeInt,
      routing: z.enum(['sticky', 'round-robin']).optional(),
    })
    .strict(),
]);

export const scenarioSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    id,
    title: z.string().min(1).max(200),
    seed: z.number().int().min(0),
    accuracyTier: z.enum(['structural', 'analytical', 'discrete-event', 'calibrated']),
    hardwareProfileId: id,
    modelProfileId: id,
    frameworkProfileId: id,
    deployment: deploymentSchema,
    runtime: runtimeSchema,
    workload: workloadSchema,
    assumptions: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
  })
  .strict();

export type StructuralValidationResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; issues: ValidationIssue[] };

export function validateScenarioStructure(input: unknown): StructuralValidationResult {
  const result = scenarioSchema.safeParse(input);
  if (result.success) {
    return { ok: true, scenario: result.data as Scenario };
  }
  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    severity: 'error',
    code: 'SCHEMA_INVALID',
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    suggestedFix: '修正该字段的类型或取值后重新导入。',
  }));
  return { ok: false, issues };
}

export interface ProfileRegistry {
  getHardware(id: string): HardwareProfile | undefined;
  getModel(id: string): ModelProfile | undefined;
  getFramework(id: string): FrameworkProfile | undefined;
}

function issue(
  severity: ValidationIssue['severity'],
  code: string,
  path: string,
  message: string,
  suggestedFix?: string,
): ValidationIssue {
  return { severity, code, path, message, suggestedFix };
}

/**
 * Business-semantic validation. JSON schema only checks shape; this checks
 * consistency across profiles, placement, runtime and workload.
 */
export function validateScenarioSemantics(scenario: Scenario, registry: ProfileRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const hardware = registry.getHardware(scenario.hardwareProfileId);
  const model = registry.getModel(scenario.modelProfileId);
  const framework = registry.getFramework(scenario.frameworkProfileId);

  if (!hardware) {
    issues.push(
      issue('error', 'HARDWARE_PROFILE_MISSING', 'hardwareProfileId', `找不到硬件 Profile "${scenario.hardwareProfileId}"。`, '选择内置硬件 Profile；当前 UI 不支持导入 Profile。'),
    );
  }
  if (!model) {
    issues.push(
      issue('error', 'MODEL_PROFILE_MISSING', 'modelProfileId', `找不到模型 Profile "${scenario.modelProfileId}"。`, '选择内置模型 Profile；当前 UI 不支持导入 Profile。'),
    );
  }
  if (!framework) {
    issues.push(
      issue('error', 'FRAMEWORK_PROFILE_MISSING', 'frameworkProfileId', `找不到框架 Profile "${scenario.frameworkProfileId}"。`, '选择内置教学适配器。'),
    );
  }
  if (!hardware || !model || !framework) return issues;

  const runtime = scenario.runtime;
  if (runtime.maxNumBatchedTokens < 1) {
    issues.push(issue('error', 'RUNTIME_BUDGET', 'runtime.maxNumBatchedTokens', 'max_num_batched_tokens 必须 >= 1。'));
  }
  if (runtime.maxNumSeqs < 1) {
    issues.push(issue('error', 'RUNTIME_SEQS', 'runtime.maxNumSeqs', 'max_num_seqs 必须 >= 1。'));
  }
  if (runtime.blockSize <= 0 || runtime.blockSize % 1 !== 0) {
    issues.push(issue('error', 'RUNTIME_BLOCK_SIZE', 'runtime.blockSize', 'block_size 必须为正整数。'));
  }
  if (![16, 32, 64, 128].includes(runtime.blockSize)) {
    issues.push(
      issue('warning', 'RUNTIME_BLOCK_SIZE_UNUSUAL', 'runtime.blockSize', `block_size=${runtime.blockSize} 不在教学适配器常用集合 {16,32,64,128} 内。`, '确认后端支持该粒度。'),
    );
  }
  if (!runtime.enableChunkedPrefill && runtime.maxNumBatchedTokens < runtime.maxModelLen) {
    issues.push(
      issue(
        'warning',
        'RUNTIME_CHUNKED_DISABLED',
        'runtime.enableChunkedPrefill',
        '关闭 Chunked Prefill 时，某些后端要求单轮 token budget 足以覆盖最长 prefill；当前 budget 小于 max_model_len。',
        '打开 Chunked Prefill 或提高 max_num_batched_tokens。',
      ),
    );
  }
  if (runtime.gpuMemoryUtilization !== undefined && (runtime.gpuMemoryUtilization <= 0 || runtime.gpuMemoryUtilization > 1)) {
    issues.push(issue('error', 'RUNTIME_MEM_UTIL', 'runtime.gpuMemoryUtilization', 'gpu_memory_utilization 必须在 (0, 1] 内。'));
  }

  const tp = scenario.deployment.logicalParallelism.tp ?? 1;
  const dp = scenario.deployment.logicalParallelism.dp ?? 1;
  const ep = scenario.deployment.logicalParallelism.ep ?? 1;
  const pp = scenario.deployment.logicalParallelism.pp ?? 1;
  const sp = runtime.spSize ?? scenario.deployment.logicalParallelism.sp ?? 1;
  const pcp = runtime.pcpSize ?? scenario.deployment.logicalParallelism.pcp ?? 1;
  const dcp = runtime.dcpSize ?? scenario.deployment.logicalParallelism.dcp ?? 1;
  if (tp < 1 || dp < 1) {
    issues.push(issue('error', 'PARALLELISM_INVALID', 'deployment.logicalParallelism', 'TP 与 DP 必须 >= 1。'));
  }
  if (pp < 1) {
    issues.push(issue('error', 'PP_INVALID', 'deployment.logicalParallelism.pp', 'PP 必须 >= 1。'));
  }
  if (runtime.speculative && runtime.maxNumBatchedTokens < 1 + runtime.speculative.draftTokens) {
    issues.push(
      issue(
        'error',
        'RUNTIME_BUDGET_SPECULATIVE',
        'runtime.maxNumBatchedTokens',
        `投机解码每步至少需要 1 + draftTokens = ${1 + runtime.speculative.draftTokens} 个 Token Budget；当前 max_num_batched_tokens=${runtime.maxNumBatchedTokens}，请求会永久无法调度。`,
        '提高 max_num_batched_tokens 或降低 draftTokens。',
      ),
    );
  }
  if (sp > tp) {
    issues.push(
      issue('error', 'SP_EXCEEDS_TP', 'runtime.spSize', `SP=${sp} 不能大于 TP=${tp}；SP 复用 TP Rank 的 Activation 分片，不能新增设备。`),
    );
  }
  const hasPd = scenario.deployment.engines.some((e) => e.role !== 'mixed');
  if (pp > 1 && hasPd) {
    issues.push(
      issue(
        'error',
        'PP_PD_COMBINATION_UNSUPPORTED',
        'deployment.logicalParallelism.pp',
        '当前教学适配器不建模 PP 与 PD 分离的组合；请分开验证 PP 或 PD。',
        '将 PP 设为 1，或使用 mixed Engine。',
      ),
    );
  }
  if (pp > 1 && pcp > 1) {
    issues.push(
      issue(
        'error',
        'PP_PCP_COMBINATION_UNSUPPORTED',
        'deployment.logicalParallelism.pp',
        '当前教学适配器不建模 PP 与 PCP 的组合；两者都会改变 Rank 布局。',
        '将 PP 或 PCP 设为 1。',
      ),
    );
  }
  if (scenario.runtime.enableExpertParallel && !model?.moe) {
    issues.push(
      issue('error', 'EP_REQUIRES_MOE', 'runtime.enableExpertParallel', 'EP 只适用于带 MoE 结构的模型；Dense 模型不能启用专家并行。'),
    );
  }
  if (model?.moe && ep > 1 && scenario.deployment.placement.ranks.length < ep) {
    issues.push(
      issue('error', 'EP_EXCEEDS_RANKS', 'deployment.logicalParallelism.ep', `EP=${ep} 需要至少 ${ep} 个显式 Rank。`),
    );
  }
  if (dcp > tp) {
    issues.push(
      issue('error', 'DCP_EXCEEDS_TP', 'runtime.dcpSize', `DCP=${dcp} 不能大于 TP=${tp}；DCP 必须复用 TP Rank，不能新增设备。`),
    );
  }
  if (pcp > 1) {
    issues.push(
      issue(
        'info',
        'PCP_PARTIAL_SUPPORT',
        'runtime.pcpSize',
        `PCP=${pcp} 在教学中按显式 Rank 放置；适配器仅声明 partial 支持，不宣称与上游实现等价。`,
      ),
    );
  }

  const rankIds = new Set<string>();
  const acceleratorUse = new Map<string, string>();
  const engineIds = new Set(scenario.deployment.engines.map((e) => e.id));
  for (const engine of scenario.deployment.engines) {
    if (engine.rankIds.length === 0) {
      issues.push(issue('error', 'ENGINE_EMPTY', `deployment.engines.${engine.id}`, `Engine ${engine.id} 没有 Rank。`));
    }
  }
  for (const rank of scenario.deployment.placement.ranks) {
    const path = `deployment.placement.ranks.${rank.rankId}`;
    if (rankIds.has(rank.rankId)) {
      issues.push(issue('error', 'RANK_DUPLICATE', path, `Rank ID ${rank.rankId} 重复。`));
    }
    rankIds.add(rank.rankId);
    if (!engineIds.has(rank.engineId)) {
      issues.push(issue('error', 'RANK_ENGINE_MISSING', path, `Rank ${rank.rankId} 引用了不存在的 Engine ${rank.engineId}。`));
    }
    const accelerator = hardware.accelerators.find((a) => a.id === rank.acceleratorId);
    if (!accelerator) {
      issues.push(issue('error', 'RANK_ACCELERATOR_MISSING', path, `Rank ${rank.rankId} 引用了不存在的加速卡 ${rank.acceleratorId}。`));
    } else {
      const previous = acceleratorUse.get(rank.acceleratorId);
      if (previous) {
        issues.push(
          issue('error', 'RANK_ACCELERATOR_REUSED', path, `加速卡 ${rank.acceleratorId} 同时映射给 Rank ${previous} 与 ${rank.rankId}；MVP 不支持共享设备。`, '减少 Rank 数或更换设备。'),
        );
      }
      acceleratorUse.set(rank.acceleratorId, rank.rankId);
    }
  }

  const engineRankIds = new Set(scenario.deployment.engines.flatMap((e) => e.rankIds));
  for (const rank of scenario.deployment.placement.ranks) {
    if (!engineRankIds.has(rank.rankId)) {
      issues.push(issue('error', 'RANK_ORPHAN', `deployment.placement.ranks.${rank.rankId}`, `Rank ${rank.rankId} 不在任何 Engine 的 rankIds 中。`));
    }
  }

  // TP group consistency
  const tpGroups = new Map<string, string[]>();
  for (const rank of scenario.deployment.placement.ranks) {
    if (rank.tpGroupId) {
      const list = tpGroups.get(rank.tpGroupId) ?? [];
      list.push(rank.rankId);
      tpGroups.set(rank.tpGroupId, list);
    }
  }
  if (tpGroups.size > 0) {
    const hasPd = scenario.deployment.engines.some((e) => e.role !== 'mixed');
    const engineRole = new Map(scenario.deployment.engines.map((e) => [e.id, e.role]));
    const rankById = new Map(scenario.deployment.placement.ranks.map((r) => [r.rankId, r]));
    for (const [groupId, members] of tpGroups) {
      const roles = new Set(
        members.map((rankId) => engineRole.get(rankById.get(rankId)!.engineId)),
      );
      const expectedTp = hasPd
        ? Math.max(
            1,
            ...Array.from(roles).map((role) =>
              role === 'prefill'
                ? scenario.deployment.logicalParallelism.prefillTp ?? tp
                : role === 'decode'
                  ? scenario.deployment.logicalParallelism.decodeTp ?? tp
                  : tp,
            ),
          )
        : tp;
      if (members.length !== expectedTp) {
        issues.push(
          issue('error', 'TP_GROUP_SIZE', `deployment.placement.ranks`, `TP Group ${groupId} 有 ${members.length} 个 Rank，但对应角色 TP=${expectedTp}。`, '重新生成并行映射。'),
        );
      }
    }
    const replicaCount = new Set(scenario.deployment.placement.ranks.map((r) => r.dpReplicaId)).size;
    if (!hasPd && replicaCount !== dp) {
      issues.push(
        issue('error', 'DP_REPLICA_COUNT', 'deployment.logicalParallelism.dp', `检测到 ${replicaCount} 个 DP 副本，但 logicalParallelism.dp=${dp}。`, '重新生成并行映射。'),
      );
    }
    if (hasPd) {
      for (const role of ['prefill', 'decode'] as const) {
        const roleEngines = scenario.deployment.engines.filter((e) => e.role === role);
        if (roleEngines.length === 0) continue;
        const roleReplicas = new Set(
          scenario.deployment.placement.ranks
            .filter((r) => roleEngines.some((e) => e.id === r.engineId))
            .map((r) => r.dpReplicaId),
        ).size;
        const expected = scenario.deployment.logicalParallelism[`${role}Dp`];
        if (expected !== undefined && roleReplicas !== expected) {
          issues.push(
            issue('error', 'PD_REPLICA_COUNT', `deployment.logicalParallelism.${role}Dp`, `${role} 角色检测到 ${roleReplicas} 个副本，但 ${role}Dp=${expected}。`),
          );
        }
      }
    }
    const expectedRanks = hasPd
      ? (scenario.deployment.logicalParallelism.prefillTp ?? 0) *
          (scenario.deployment.logicalParallelism.prefillDp ?? 0) +
        (scenario.deployment.logicalParallelism.decodeTp ?? 0) *
          (scenario.deployment.logicalParallelism.decodeDp ?? 0)
      : tp * dp * pcp * pp;
    if (scenario.deployment.placement.ranks.length !== expectedRanks) {
      issues.push(
        issue('warning', 'RANK_COUNT_MISMATCH', 'deployment.placement.ranks', `当前有 ${scenario.deployment.placement.ranks.length} 个 Rank，期望 ${expectedRanks}。`, '仅在明确使用额外并行维度时才允许不一致。'),
      );
    }
  }

  // PP / SP group consistency. PP adds physical stages; SP is a view over TP.
  const rankById = new Map(scenario.deployment.placement.ranks.map((r) => [r.rankId, r]));

  // EP/DCP/PCP groups must exist and have the declared width. Their semantics
  // differ: EP groups span the ranks that hold the expert shards, DCP groups
  // reuse a TP group, and PCP groups span TP ranks across context slices.
  if (ep > 1) {
    const epGroups = new Map<string, string[]>();
    for (const rank of scenario.deployment.placement.ranks) {
      for (const groupId of rank.epGroupIds ?? []) {
        const list = epGroups.get(groupId) ?? [];
        list.push(rank.rankId);
        epGroups.set(groupId, list);
      }
    }
    if (epGroups.size === 0) {
      issues.push(issue('error', 'EP_GROUPS_MISSING', 'deployment.placement.ranks', `EP=${ep} 但没有任何 Rank 声明 epGroupIds。`, '重新生成并行映射或关闭 EP。'));
    }
    for (const [groupId, members] of epGroups) {
      if (members.length !== ep) {
        issues.push(issue('error', 'EP_GROUP_SIZE', 'deployment.placement.ranks', `EP Group ${groupId} 有 ${members.length} 个 Rank，但 ep=${ep}。`, '重新生成并行映射。'));
      }
    }
  }
  if (dcp > 1) {
    const dcpGroups = new Map<string, string[]>();
    for (const rank of scenario.deployment.placement.ranks) {
      if (rank.dcpGroupId) {
        const list = dcpGroups.get(rank.dcpGroupId) ?? [];
        list.push(rank.rankId);
        dcpGroups.set(rank.dcpGroupId, list);
      }
    }
    if (dcpGroups.size === 0) {
      issues.push(issue('error', 'DCP_GROUPS_MISSING', 'runtime.dcpSize', `DCP=${dcp} 但没有任何 Rank 声明 dcpGroupId。`, '重新生成并行映射或关闭 DCP。'));
    }
    for (const [groupId, members] of dcpGroups) {
      if (members.length !== dcp) {
        issues.push(issue('error', 'DCP_GROUP_SIZE', 'runtime.dcpSize', `DCP Group ${groupId} 有 ${members.length} 个 Rank，但 dcpSize=${dcp}。`, '重新生成并行映射。'));
      }
      const tpMemberships = new Set(members.map((rankId) => rankById.get(rankId)?.tpGroupId));
      if (tpMemberships.size > 1) {
        issues.push(issue('error', 'DCP_GROUP_CROSSES_TP', 'runtime.dcpSize', `DCP Group ${groupId} 跨越多个 TP Group；DCP 必须复用同一 TP Group 的 Rank。`));
      }
    }
  }
  if (pcp > 1) {
    const pcpGroups = new Map<string, string[]>();
    for (const rank of scenario.deployment.placement.ranks) {
      if (rank.pcpGroupId) {
        const list = pcpGroups.get(rank.pcpGroupId) ?? [];
        list.push(rank.rankId);
        pcpGroups.set(rank.pcpGroupId, list);
      }
    }
    if (pcpGroups.size === 0) {
      issues.push(issue('error', 'PCP_GROUPS_MISSING', 'runtime.pcpSize', `PCP=${pcp} 但没有任何 Rank 声明 pcpGroupId。`, '重新生成并行映射或关闭 PCP。'));
    }
    for (const [groupId, members] of pcpGroups) {
      if (members.length !== tp * pcp) {
        issues.push(issue('error', 'PCP_GROUP_SIZE', 'runtime.pcpSize', `PCP Group ${groupId} 有 ${members.length} 个 Rank，期望 TP×PCP=${tp * pcp}。`, '重新生成并行映射。'));
      }
    }
  }
  const ppStages = new Map<string, string[]>();
  for (const rank of scenario.deployment.placement.ranks) {
    if (rank.ppStageId) {
      const list = ppStages.get(rank.ppStageId) ?? [];
      list.push(rank.rankId);
      ppStages.set(rank.ppStageId, list);
    }
  }
  if (pp > 1) {
    // PP stage IDs are scoped per DP replica (pp0-s0, pp1-s0, ...). The stage
    // count is therefore the number of distinct stage indices, not the number
    // of IDs across all replicas.
    const stageIndices = new Set(
      scenario.deployment.placement.ranks
        .map((rank) => rank.ppStageIndex)
        .filter((index): index is number => index !== undefined),
    );
    if (stageIndices.size !== pp) {
      issues.push(
        issue('error', 'PP_STAGE_COUNT', 'deployment.placement.ranks', `检测到 ${stageIndices.size} 个 PP Stage Index，但 logicalParallelism.pp=${pp}。`, '重新生成并行映射。'),
      );
    }
    for (const [stageId, members] of ppStages) {
      if (members.length !== tp) {
        issues.push(
          issue('error', 'PP_STAGE_SIZE', 'deployment.placement.ranks', `PP Stage ${stageId} 有 ${members.length} 个 Rank，期望每个 Stage TP=${tp}。`, '重新生成并行映射。'),
        );
      }
    }
    const expectedPerStage = tp * dp;
    for (const stageIndex of stageIndices) {
      const count = scenario.deployment.placement.ranks.filter(
        (rank) => rank.ppStageIndex === stageIndex,
      ).length;
      if (count !== expectedPerStage) {
        issues.push(
          issue(
            'error',
            'PP_STAGE_REPLICA_COUNT',
            'deployment.placement.ranks',
            `PP Stage ${stageIndex} 在 ${dp} 个 DP 副本中共有 ${count} 个 Rank，期望 TP×DP=${expectedPerStage}。`,
            '重新生成并行映射。',
          ),
        );
      }
    }
  } else if (ppStages.size > 0) {
    issues.push(issue('warning', 'PP_STAGE_UNUSED', 'deployment.placement.ranks', '存在 ppStageId，但 logicalParallelism.pp=1。'));
  }

  const spGroups = new Map<string, string[]>();
  for (const rank of scenario.deployment.placement.ranks) {
    if (rank.spGroupId) {
      const list = spGroups.get(rank.spGroupId) ?? [];
      list.push(rank.rankId);
      spGroups.set(rank.spGroupId, list);
    }
  }
  if (sp > 1) {
    if (spGroups.size === 0) {
      issues.push(issue('warning', 'SP_GROUPS_MISSING', 'runtime.spSize', `SP=${sp} 但没有任何 Rank 声明 spGroupId；SP 将只影响时间模型。`));
    }
    for (const [groupId, members] of spGroups) {
      if (members.length !== sp) {
        issues.push(
          issue('error', 'SP_GROUP_SIZE', 'deployment.placement.ranks', `SP Group ${groupId} 有 ${members.length} 个 Rank，但 spSize=${sp}。`, '重新生成并行映射。'),
        );
      }
      const tpMemberships = new Set(members.map((rankId) => rankById.get(rankId)?.tpGroupId));
      if (tpMemberships.size > 1) {
        issues.push(
          issue('error', 'SP_GROUP_CROSSES_TP', 'deployment.placement.ranks', `SP Group ${groupId} 跨越多个 TP Group；SP 必须复用同一 TP Group 的 Rank。`),
        );
      }
    }
  }

  if (runtime.speculative && hasPd) {
    issues.push(
      issue(
        'info',
        'SPECULATIVE_PD_SIMPLIFIED',
        'runtime.speculative',
        '当前教学模型把投机解码应用于所有 Decode Engine，未区分 Draft 模型独立部署；结果仅作结构级对比。',
      ),
    );
  }

  // Feature matrix
  const hasMla = model.attentionLayers.some((layer) => layer.kind === 'MLA' || layer.kvLayout === 'mla-latent');
  const hasSparse = model.attentionLayers.some(
    (layer) =>
      layer.kind === 'SFA' ||
      layer.kind === 'DSA' ||
      layer.kind === 'HYBRID' ||
      layer.kind === 'WINDOW' ||
      layer.sparseKV !== undefined,
  );
  if (runtime.preemptionPolicy === 'backend-specific') {
    issues.push(
      issue(
        'info',
        'PREEMPTION_BACKEND_SPECIFIC',
        'runtime.preemptionPolicy',
        'backend-specific 抢占未单独建模；仿真按 recompute 处理，结果只作结构级对比。',
      ),
    );
  }
  const speculative = runtime.speculative;
  const featureChecks: Array<[string, boolean, string]> = [
    ['scheduler_v1_subset', true, 'frameworkProfileId'],
    ['chunked_prefill', Boolean(runtime.enableChunkedPrefill), 'runtime.enableChunkedPrefill'],
    ['prefix_caching', Boolean(runtime.enablePrefixCaching), 'runtime.enablePrefixCaching'],
    ['preemption_recompute', runtime.preemptionPolicy !== 'none', 'runtime.preemptionPolicy'],
    ['expert_parallel', Boolean(runtime.enableExpertParallel), 'runtime.enableExpertParallel'],
    ['context_parallel', pcp > 1 || dcp > 1, 'runtime.pcpSize'],
    ['cpu_offload', Boolean(runtime.enableCpuOffload), 'runtime.enableCpuOffload'],
    ['pipeline_parallel', pp > 1, 'deployment.logicalParallelism.pp'],
    ['sequence_parallel', sp > 1, 'runtime.spSize'],
    ['speculative_decoding', Boolean(speculative), 'runtime.speculative'],
    ['mla', hasMla, 'modelProfileId'],
    ['sparse_attention', hasSparse, 'modelProfileId'],
  ];
  if (speculative) featureChecks.push([speculative.method, true, 'runtime.speculative.method']);
  const strategy = scenario.deployment.kvTransfer?.strategy;
  if (hasPd) featureChecks.push(['pd_disaggregation', true, 'deployment.engines']);
  if (strategy === 'PD_LAYERWISE_PUSH') featureChecks.push(['layerwise_kv_transfer', true, 'deployment.kvTransfer.strategy']);
  if (strategy === 'PD_HOST_STAGING') featureChecks.push(['host_staging_kv_transfer', true, 'deployment.kvTransfer.strategy']);
  for (const [feature, enabled, path] of featureChecks) {
    if (!enabled) continue;
    const support = framework.supportedFeatures[feature] ?? 'unknown';
    if (support === 'unsupported') {
      issues.push(issue('error', 'FEATURE_UNSUPPORTED', path, `适配器 ${framework.id} 明确不支持 ${feature.toUpperCase()}。`));
    } else if (support === 'partial') {
      issues.push(
        issue('info', 'FEATURE_PARTIAL', path, `${feature.toUpperCase()} 在适配器 ${framework.id} 中为 partial：只覆盖已声明的子集，不能宣称与上游实现等价。`),
      );
    } else if (support === 'unknown') {
      issues.push(
        issue('warning', 'FEATURE_UNKNOWN', path, `${feature.toUpperCase()} 在适配器 ${framework.id} 中为 unknown，不能宣称已验证可用。`, '仅以教学假设模式运行，或提供对应版本的官方依据。'),
      );
    }
  }

  // Workload constraints
  const workload = scenario.workload;
  const checkLengths = (promptTokens: number, outputTokens: number, path: string) => {
    if (promptTokens < 0 || outputTokens < 0) {
      issues.push(issue('error', 'WORKLOAD_NEGATIVE', path, 'Prompt/Output token 数不能为负。'));
    }
    if (promptTokens + outputTokens > runtime.maxModelLen) {
      issues.push(
        issue(
          'warning',
          'WORKLOAD_EXCEEDS_MODEL_LEN',
          path,
          `ISL+OSL=${promptTokens + outputTokens} 超过 max_model_len=${runtime.maxModelLen}；仿真会在到达时拒绝该请求（REQUEST_REJECTED / MAX_MODEL_LEN_EXCEEDED）。`,
          '提高 max_model_len 或降低请求长度。',
        ),
      );
    }
  };
  if (workload.kind === 'trace') {
    if (workload.requests.length === 0) {
      issues.push(issue('warning', 'WORKLOAD_EMPTY', 'workload.requests', 'Trace 没有任何请求。'));
    }
    for (const request of workload.requests) {
      checkLengths(request.promptTokens, request.outputTokens, `workload.requests.${request.id}`);
      if (request.prefixBlocks) {
        for (const block of request.prefixBlocks) {
          if (block.tokenCount !== runtime.blockSize) {
            issues.push(
              issue('warning', 'PREFIX_BLOCK_PARTIAL', `workload.requests.${request.id}.prefixBlocks`, `Prefix block ${block.hash} 的 tokenCount=${block.tokenCount}，不是完整块 ${runtime.blockSize}；不会按完整前缀命中。`),
            );
          }
        }
      }
    }
  } else if (workload.kind === 'fixed' || workload.kind === 'poisson') {
    checkLengths(workload.promptTokens, workload.outputTokens, 'workload');
  } else {
    checkLengths(workload.baseSystemTokens, workload.outputTokens, 'workload');
    // Match agentTurnSpec: each completed turn appends its output plus the next
    // turn's increment to the prompt history.
    const lastTurn = workload.baseSystemTokens + (workload.turns - 1) * (workload.turnIncrementTokens + workload.outputTokens) + workload.outputTokens;
    if (lastTurn > runtime.maxModelLen) {
      issues.push(issue('warning', 'AGENT_EXCEEDS_MODEL_LEN', 'workload.turns', `最后一轮 prompt+output=${lastTurn} 超过 max_model_len=${runtime.maxModelLen}。`));
    }
  }

  // PD / transfer consistency
  const roles = new Set(scenario.deployment.engines.map((e) => e.role));
  if (roles.has('prefill') || roles.has('decode')) {
    if (!roles.has('prefill') || !roles.has('decode')) {
      issues.push(issue('error', 'PD_INCOMPLETE', 'deployment.engines', 'PD 分离场景必须同时存在 prefill 与 decode 引擎。'));
    }
    const strategy = scenario.deployment.kvTransfer?.strategy;
    const pdStrategies = new Set(['PD_PULL', 'PD_LAYERWISE_PUSH', 'PD_HOST_STAGING']);
    if (!strategy || strategy === 'GPU_LOCAL') {
      issues.push(issue('error', 'PD_STRATEGY_MISSING', 'deployment.kvTransfer.strategy', 'PD 分离需要 KV Transfer 策略（PD_PULL / PD_LAYERWISE_PUSH / PD_HOST_STAGING）。'));
    } else if (!pdStrategies.has(strategy)) {
      issues.push(issue('error', 'PD_STRATEGY_INVALID', 'deployment.kvTransfer.strategy', `CPU_OFFLOAD 不是 PD 引擎间的传输策略；请使用 PD_PULL / PD_LAYERWISE_PUSH / PD_HOST_STAGING。`));
    }
  }

  if (runtime.enableCpuOffload && resolveHostCacheBytes(scenario) <= 0) {
    issues.push(issue('warning', 'OFFLOAD_HOST_CACHE_UNSET', 'runtime.enableCpuOffload', '启用 CPU Offload 但未设置 Host Cache 容量；将使用 DRAM 可用容量作为上界。'));
  }

  // Unknown hardware data must not silently become precise performance.
  const domainIds = new Set(hardware.contentionDomains.map((domain) => domain.id));
  for (const link of hardware.links) {
    if (!domainIds.has(link.contentionDomainId)) {
      issues.push(
        issue(
          'error',
          'LINK_DOMAIN_MISSING',
          `hardware.links.${link.id}.contentionDomainId`,
          `链路 ${link.id} 引用了不存在的 contention domain "${link.contentionDomainId}"；共享带宽将无法串行化。`,
          '在硬件 Profile 中声明该 contention domain，或修正链路引用。',
        ),
      );
    }
  }
  const hbmPools = hardware.memoryPools.filter((p) => p.kind === 'HBM');
  if (hbmPools.some((p) => p.readBytesPerSecond.value === null)) {
    issues.push(issue('warning', 'HBM_BW_UNKNOWN', 'hardwareProfileId', '部分 HBM 带宽为 unknown；只能做结构分析，不产生时间预测。'));
  }
  if (model.tensorInventory.length === 0) {
    issues.push(issue('warning', 'WEIGHTS_UNKNOWN', 'modelProfileId', '模型缺少 Tensor Inventory；无法计算每卡权重驻留。'));
  }

  return issues;
}
