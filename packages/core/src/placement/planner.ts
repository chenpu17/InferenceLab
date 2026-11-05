import type {
  Deployment,
  EngineInstance,
  HardwareProfile,
  RankPlacement,
  ValidationIssue,
} from '../domain/types.js';

export interface GenerateDeploymentOptions {
  tp: number;
  dp: number;
  /** Pipeline Parallel stages per model instance; adds ranks. */
  pp?: number;
  /** Sequence Parallel reuses TP ranks; never adds ranks. */
  sp?: number;
  role?: 'mixed' | 'prefill' | 'decode';
  /** Restrict placement to this accelerator subset (used by PD presets). */
  acceleratorIds?: string[];
  /** Prefix for stable IDs, e.g. "p" or "d". */
  idPrefix?: string;
}

export interface GeneratedDeployment {
  deployment: Deployment;
  issues: ValidationIssue[];
}

/**
 * Generate an explicit Device -> Rank -> TP/DP mapping. This is deliberately
 * simple: it does not multiply TP x DP x EP into a fantasy world size.
 */
export function generateDeployment(
  hardware: HardwareProfile,
  options: GenerateDeploymentOptions,
): GeneratedDeployment {
  const { tp, dp, role = 'mixed' } = options;
  const pp = Math.max(1, options.pp ?? 1);
  const requestedSp = Math.max(1, options.sp ?? 1);
  const prefix = options.idPrefix ?? (role === 'mixed' ? '' : `${role[0]}`);
  const idPart = (value: string) => (prefix ? `${prefix}-${value}` : value);
  const issues: ValidationIssue[] = [];

  const pool = options.acceleratorIds
    ? hardware.accelerators.filter((a) => options.acceleratorIds!.includes(a.id))
    : hardware.accelerators;

  const required = tp * dp * pp;
  if (required > pool.length) {
    issues.push({
      severity: 'error',
      code: 'PLACEMENT_INSUFFICIENT_DEVICES',
      path: 'deployment.placement',
      message: `TP=${tp} × DP=${dp} × PP=${pp} 需要 ${required} 张卡，但可用加速卡只有 ${pool.length} 张。`,
      suggestedFix: '降低 TP/DP/PP，或选择更大的硬件 Profile。',
    });
  }
  let sp = requestedSp;
  if (sp > tp) {
    issues.push({
      severity: 'error',
      code: 'SP_EXCEEDS_TP',
      path: 'runtime.spSize',
      message: `SP=${sp} 不能大于 TP=${tp}：SP 复用 TP Rank 的 Activation 分片，不能凭空创建设备。`,
      suggestedFix: '降低 spSize 或提高 TP。',
    });
    sp = Math.max(1, tp);
  }

  const engines: EngineInstance[] = [];
  const ranks: RankPlacement[] = [];
  const count = Math.min(required, pool.length);

  for (let replica = 0; replica < dp; replica += 1) {
    const rankIds: string[] = [];
    for (let stage = 0; stage < pp; stage += 1) {
      for (let i = 0; i < tp; i += 1) {
        const flatIndex = replica * tp * pp + stage * tp + i;
        if (flatIndex >= count) break;
        const accelerator = pool[flatIndex]!;
        const rankId = idPart(`r${flatIndex}`);
        rankIds.push(rankId);
        ranks.push({
          rankId,
          engineId: idPart(`engine-dp${replica}`),
          acceleratorId: accelerator.id,
          dpReplicaId: idPart(`dp${replica}`),
          tpGroupId: pp > 1 ? idPart(`tp${replica}-s${stage}`) : idPart(`tp${replica}`),
          ppStageId: pp > 1 ? idPart(`pp${replica}-s${stage}`) : undefined,
          ppStageIndex: pp > 1 ? stage : undefined,
        });
      }
    }
    if (rankIds.length > 0) {
      engines.push({
        id: idPart(`engine-dp${replica}`),
        role,
        rankIds,
        schedulerId: idPart(`sched-dp${replica}`),
        cacheManagerId: idPart(`cache-dp${replica}`),
      });
    }
  }

  if (sp > 1) {
    const tpMembers = new Map<string, string[]>();
    for (const rank of ranks) {
      const list = tpMembers.get(rank.tpGroupId ?? '') ?? [];
      list.push(rank.rankId);
      tpMembers.set(rank.tpGroupId ?? '', list);
    }
    const rankById = new Map(ranks.map((rank) => [rank.rankId, rank]));
    for (const [tpGroupId, members] of tpMembers) {
      members.forEach((rankId, index) => {
        const rank = rankById.get(rankId)!;
        rank.spGroupId = idPart(`${tpGroupId}-sp${Math.floor(index / sp)}`);
      });
    }
  }

  if (ranks.length !== required) {
    issues.push({
      severity: 'error',
      code: 'PLACEMENT_INCOMPLETE',
      path: 'deployment.placement',
      message: `只生成了 ${ranks.length}/${required} 个 Rank 映射。`,
      suggestedFix: '检查硬件卡数量与 TP/DP/PP 设置。',
    });
  }

  const deployment: Deployment = {
    engines,
    placement: { ranks },
    logicalParallelism: { tp, dp, ...(pp > 1 ? { pp } : {}), ...(sp > 1 ? { sp } : {}) },
    routing: { kind: 'round-robin' },
  };

  return { deployment, issues };
}

export interface PdDeploymentOptions {
  prefillTp: number;
  prefillDp: number;
  decodeTp: number;
  decodeDp: number;
  strategy?: 'PD_PULL' | 'PD_LAYERWISE_PUSH' | 'PD_HOST_STAGING';
}

/**
 * Split physical accelerators into independent prefill and decode engine
 * groups. Ranks are never silently reused across roles.
 */
export function generatePdDeployment(
  hardware: HardwareProfile,
  options: PdDeploymentOptions,
): GeneratedDeployment {
  const prefillDevices = options.prefillTp * options.prefillDp;
  const decodeDevices = options.decodeTp * options.decodeDp;
  const issues: ValidationIssue[] = [];
  if (prefillDevices + decodeDevices > hardware.accelerators.length) {
    issues.push({
      severity: 'error',
      code: 'PD_INSUFFICIENT_DEVICES',
      path: 'deployment.placement',
      message: `P(${options.prefillTp}×${options.prefillDp}) + D(${options.decodeTp}×${options.decodeDp}) 需要 ${prefillDevices + decodeDevices} 张卡，硬件只有 ${hardware.accelerators.length} 张。`,
      suggestedFix: '调整 P/D 的 TP/DP 比例。',
    });
  }
  const allIds = hardware.accelerators.map((a) => a.id);
  const prefill = generateDeployment(hardware, {
    tp: options.prefillTp,
    dp: options.prefillDp,
    role: 'prefill',
    acceleratorIds: allIds.slice(0, prefillDevices),
    idPrefix: 'p',
  });
  const decode = generateDeployment(hardware, {
    tp: options.decodeTp,
    dp: options.decodeDp,
    role: 'decode',
    // Allocate decode from the far end so a 1P1D split usually crosses nodes.
    acceleratorIds: allIds.slice(allIds.length - decodeDevices),
    idPrefix: 'd',
  });

  const deployment: Deployment = {
    engines: [...prefill.deployment.engines, ...decode.deployment.engines],
    placement: { ranks: [...prefill.deployment.placement.ranks, ...decode.deployment.placement.ranks] },
    logicalParallelism: {
      tp: options.prefillTp,
      dp: options.prefillDp,
      prefillTp: options.prefillTp,
      prefillDp: options.prefillDp,
      decodeTp: options.decodeTp,
      decodeDp: options.decodeDp,
    },
    routing: { kind: 'round-robin' },
    kvTransfer: { strategy: options.strategy ?? 'PD_PULL' },
  };

  return { deployment, issues: [...issues, ...prefill.issues, ...decode.issues] };
}

export interface ContextParallelOptions {
  tp: number;
  dp: number;
  /** PCP may increase the physical rank count: ranks = tp × dp × pcp. */
  pcp?: number;
  /** DCP reuses existing TP ranks; it never allocates extra devices. */
  dcp?: number;
}

/**
 * Build an explicit PCP/DCP mapping.
 *
 * DCP is a view over the TP group: the same ranks are re-labelled into DCP
 * groups, so the accelerator count does not change. PCP is a real placement
 * dimension in this teaching model, so pcp > 1 adds ranks (and devices).
 */
export function generateContextParallelDeployment(
  hardware: HardwareProfile,
  options: ContextParallelOptions,
): GeneratedDeployment {
  const pcp = Math.max(1, options.pcp ?? 1);
  const dcp = Math.max(1, options.dcp ?? 1);
  const issues: ValidationIssue[] = [];
  if (dcp > options.tp) {
    issues.push({
      severity: 'error',
      code: 'DCP_EXCEEDS_TP',
      path: 'runtime.dcpSize',
      message: `DCP=${dcp} 不能大于 TP=${options.tp}：DCP 必须复用 TP rank，不能凭空创建设备。`,
      suggestedFix: '降低 dcpSize 或提高 TP。',
    });
  }
  if (pcp === 1 && dcp === 1) {
    return generateDeployment(hardware, { tp: options.tp, dp: options.dp });
  }
  if (pcp === 1) {
    const base = generateDeployment(hardware, { tp: options.tp, dp: options.dp });
    const tpMembers = new Map<string, string[]>();
    for (const rank of base.deployment.placement.ranks) {
      const list = tpMembers.get(rank.tpGroupId ?? '') ?? [];
      list.push(rank.rankId);
      tpMembers.set(rank.tpGroupId ?? '', list);
    }
    const ranks = base.deployment.placement.ranks.map((rank) => {
      const members = tpMembers.get(rank.tpGroupId ?? '') ?? [];
      const tpIndex = Math.max(0, members.indexOf(rank.rankId));
      return {
        ...rank,
        dcpGroupId: dcp > 1 ? `dcp-${rank.tpGroupId ?? 'tp'}-${Math.floor(tpIndex / dcp)}` : undefined,
      };
    });
    return {
      deployment: {
        ...base.deployment,
        placement: { ranks },
        logicalParallelism: { ...base.deployment.logicalParallelism, dcp },
      },
      issues: [...issues, ...base.issues],
    };
  }

  const required = options.tp * options.dp * pcp;
  if (required > hardware.accelerators.length) {
    issues.push({
      severity: 'error',
      code: 'PCP_INSUFFICIENT_DEVICES',
      path: 'deployment.placement',
      message: `TP=${options.tp} × DP=${options.dp} × PCP=${pcp} 需要 ${required} 张卡，但硬件只有 ${hardware.accelerators.length} 张。`,
      suggestedFix: '降低 PCP/TP/DP，或选择更大的硬件 Profile。',
    });
  }
  const count = Math.min(required, hardware.accelerators.length);
  const engines: EngineInstance[] = [];
  const ranks: RankPlacement[] = [];
  let flat = 0;
  for (let replica = 0; replica < options.dp; replica += 1) {
    const rankIds: string[] = [];
    for (let p = 0; p < pcp; p += 1) {
      for (let i = 0; i < options.tp; i += 1) {
        if (flat >= count) break;
        const accelerator = hardware.accelerators[flat]!;
        const rankId = `r${flat}`;
        rankIds.push(rankId);
        ranks.push({
          rankId,
          engineId: `engine-dp${replica}`,
          acceleratorId: accelerator.id,
          dpReplicaId: `dp${replica}`,
          tpGroupId: `tp${replica}-p${p}`,
          pcpGroupId: `pcp${replica}`,
          dcpGroupId: dcp > 1 ? `dcp${replica}-p${p}-${Math.floor(i / dcp)}` : undefined,
        });
        flat += 1;
      }
    }
    if (rankIds.length > 0) {
      engines.push({
        id: `engine-dp${replica}`,
        role: 'mixed',
        rankIds,
        schedulerId: `sched-dp${replica}`,
        cacheManagerId: `cache-dp${replica}`,
      });
    }
  }
  if (ranks.length !== required) {
    issues.push({
      severity: 'error',
      code: 'PLACEMENT_INCOMPLETE',
      path: 'deployment.placement',
      message: `只生成了 ${ranks.length}/${required} 个 Rank 映射。`,
    });
  }
  return {
    deployment: {
      engines,
      placement: { ranks },
      logicalParallelism: { tp: options.tp, dp: options.dp, pcp, dcp },
      routing: { kind: 'round-robin' },
    },
    issues,
  };
}

/** Resolve TP group size for each rank from explicit placement. */
export function resolveTpGroupSizes(deployment: Deployment): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rank of deployment.placement.ranks) {
    if (rank.tpGroupId) counts.set(rank.tpGroupId, (counts.get(rank.tpGroupId) ?? 0) + 1);
  }
  const result = new Map<string, number>();
  for (const rank of deployment.placement.ranks) {
    result.set(rank.rankId, rank.tpGroupId ? (counts.get(rank.tpGroupId) ?? 1) : 1);
  }
  return result;
}
