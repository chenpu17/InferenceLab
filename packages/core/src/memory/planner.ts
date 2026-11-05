import { alignUp } from '../domain/units.js';
import type {
  Bytes,
  EnginePlan,
  Evidence,
  ExpertAssignment,
  ExpertPlacementPlan,
  FrameworkProfile,
  HardwareProfile,
  MetricQuality,
  Microseconds,
  ModelProfile,
  ParallelGroup,
  PipelinePlan,
  PlanResult,
  RankPlan,
  ResolvedRank,
  Scenario,
  SequenceParallelPlan,
  SpeculativePlan,
  ValidationIssue,
} from '../domain/types.js';
import { ENGINE_VERSION } from '../domain/types.js';
import { resolveTpGroupSizes } from '../placement/planner.js';
import { validateScenarioSemantics } from '../validation/scenario.js';

export interface PlanInputs {
  scenario: Scenario;
  hardware: HardwareProfile;
  model: ModelProfile;
  framework: FrameworkProfile;
}

interface WeightResult {
  bytes: Bytes | null;
  quality: MetricQuality;
  note?: string;
}

/**
 * Synthetic cost of one SP collective step. This is an explicit assumption,
 * not a hardware calibration; the simulator uses the same value so plan and
 * timeline stay consistent.
 */
export function sequenceParallelCollectiveCostUs(spSize: number): Microseconds {
  return spSize > 1 ? Math.round(12 * Math.log2(spSize)) : 0;
}

function computeWeightBytesPerRank(
  model: ModelProfile,
  tpSize: number,
  dpSize: number,
  ppSize: number,
  epSize: number,
  redundantPerRank: number,
): WeightResult {
  let total = 0;
  let unknown = false;
  for (const tensor of model.tensorInventory) {
    const meta = tensor.scaleAndMetadataBytes ?? 0;
    const align = tensor.alignBytes ?? 1;
    let value: number | null;
    switch (tensor.rule) {
      case 'replicate':
        value = tensor.logicalBytes + meta;
        break;
      case 'shard-tp':
        // A tensor sharded over TP is also split across PP stages when the
        // tensor inventory represents the full model (the toy profiles do).
        // Tensors that must be replicated per stage use the explicit
        // `replicate` rule instead.
        value = Math.ceil(tensor.logicalBytes / (Math.max(1, tpSize) * Math.max(1, ppSize))) + meta;
        break;
      case 'shard-dp':
        value = Math.ceil(tensor.logicalBytes / Math.max(1, dpSize)) + meta;
        break;
      case 'pipeline-partition':
        value = Math.ceil(tensor.logicalBytes / Math.max(1, ppSize)) + meta;
        break;
      case 'expert-partition': {
        if (!model.moe || model.moe.expertBytes === undefined) {
          value = null;
        } else {
          const expertsPerRank = Math.ceil(model.moe.expertCount / Math.max(1, epSize));
          value =
            (expertsPerRank + redundantPerRank) * model.moe.expertBytes +
            meta;
          // Shared-expert weights must be declared in tensorInventory. Adding
          // moe.sharedExpertBytes here as well double-counts profiles that
          // already have a shared-expert tensor.
        }
        break;
      }
      case 'opaque':
        value = tensor.measuredBytesPerRank ?? null;
        break;
      default:
        value = null;
    }
    if (value === null) {
      unknown = true;
    } else {
      total += alignUp(value, align);
    }
  }
  if (unknown) {
    return {
      bytes: null,
      quality: 'unavailable',
      note: '模型权重布局存在未建模项，停止每卡权重数值评估。',
    };
  }
  return { bytes: total, quality: model.provenance.kind === 'measured' ? 'calibrated' : 'assumption' };
}

interface KvResult {
  bytesPerToken: Bytes | null;
  quality: MetricQuality;
  limitations: string[];
}

function computeKvBytesPerToken(
  model: ModelProfile,
  tpSize: number,
  dcpSize: number,
  maxModelLen: number,
  ppSize: number,
  ppStageIndex = 0,
): KvResult {
  let total = 0;
  const limitations: string[] = [];
  let dcpUnappliedLayers = 0;
  let quality: MetricQuality = model.provenance.kind === 'measured' ? 'calibrated' : 'assumption';

  if (model.attentionLayers.length === 0) {
    return { bytesPerToken: null, quality: 'unavailable', limitations: ['模型没有 Attention Layer 描述。'] };
  }

  const stageStart = ppSize > 1 ? Math.floor((model.numLayers * ppStageIndex) / ppSize) : 0;
  const stageEnd = ppSize > 1 ? Math.floor((model.numLayers * (ppStageIndex + 1)) / ppSize) : model.numLayers;

  for (const layer of model.attentionLayers) {
    if (ppSize > 1 && (layer.layerIndex < stageStart || layer.layerIndex >= stageEnd)) {
      continue;
    }
    if (layer.measuredBytesPerToken !== undefined) {
      total += layer.measuredBytesPerToken;
      continue;
    }
    if (layer.kind === 'MLA') {
      if (layer.kvLatentDim === undefined || layer.kDtypeBytes === undefined) {
        return {
          bytesPerToken: null,
          quality: 'unavailable',
          limitations: ['MLA 层缺少 kvLatentDim/dtype，不能套用 GQA/MHA 公式。'],
        };
      }
      const latentDim = layer.kvLatentDim + (layer.ropeDim ?? 0);
      const sharded = layer.contextSharded === true || layer.kvLayout === 'context-sharded';
      if (!sharded && dcpSize > 1) dcpUnappliedLayers += 1;
      const perRank = latentDim * layer.kDtypeBytes / (sharded ? Math.max(1, dcpSize) : 1);
      total += perRank;
      limitations.push(
        sharded
          ? `第 ${layer.layerIndex} 层 MLA 使用 latent=${layer.kvLatentDim}+rope=${layer.ropeDim ?? 0}，按 DCP=${dcpSize} 切分 KV。`
          : `第 ${layer.layerIndex} 层 MLA 使用 latent=${layer.kvLatentDim}+rope=${layer.ropeDim ?? 0}，按每 Rank 复制估算（未启用 DCP 分片）。`,
      );
      quality = quality === 'calibrated' ? quality : 'assumption';
      continue;
    }
    const requiresSparseLayout =
      layer.kind === 'SFA' || layer.kind === 'DSA' || layer.kind === 'HYBRID' || layer.kind === 'UNKNOWN';
    // An explicit sparse/hybrid cache layout wins over the dense GQA formula,
    // even on a GQA/MHA/WINDOW layer; ignoring it would silently overstate KV.
    if (layer.sparseKV) {
      const layout = layer.sparseKV;
      const dtype = layout.dtypeBytes ?? layer.kDtypeBytes ?? 2;
      let base: number | null = null;
      let headDim: number | null = null;
      let latentDim: number | null = null;
      if (layout.storage === 'compressed') {
        if (layout.kvLatentDim !== undefined) {
          latentDim = layout.kvLatentDim;
          base = latentDim * dtype;
        }
      } else if (layout.nKVHeads !== undefined && layout.headDim !== undefined) {
        // Full/window sparse storage keeps K and V per selected head.
        headDim = layout.headDim;
        base = layout.nKVHeads * headDim * dtype * 2;
      }
      if (base === null) {
        return {
          bytesPerToken: null,
          quality: 'unavailable',
          limitations: [`${layer.kind} 的 sparseKV 缺少 storage=${layout.storage} 所需的形状字段。`],
        };
      }
      // Sparse layouts are still sharded by the declared kvLayout: ignoring
      // TP/DCP here would overstate per-rank KV capacity for a sparse model.
      const sparseLayout = layer.kvLayout ?? 'head-sharded-tp';
      let perRank = base;
      let shardNote = '按显式每 Rank 值（未切分）';
      if (sparseLayout === 'context-sharded') {
        perRank = base / Math.max(1, dcpSize);
        shardNote = `按 DCP=${dcpSize} 切分`;
      } else if (sparseLayout === 'head-sharded-tp') {
        if (headDim !== null && layout.nKVHeads !== undefined) {
          perRank = Math.ceil(layout.nKVHeads / Math.max(1, tpSize)) * headDim * dtype * 2;
        } else if (latentDim !== null) {
          perRank = Math.ceil(latentDim / Math.max(1, tpSize)) * dtype;
        }
        shardNote = `按 TP=${tpSize} 切分`;
        if (dcpSize > 1) dcpUnappliedLayers += 1;
      } else if (sparseLayout === 'replicated') {
        shardNote = '每 Rank 复制';
        if (dcpSize > 1) dcpUnappliedLayers += 1;
      } else if (dcpSize > 1) {
        dcpUnappliedLayers += 1;
      }
      total += perRank;
      limitations.push(
        `${layer.kind} 使用显式 ${layout.storage} 缓存组 ${layout.cacheGroup}（${shardNote}）；稀疏选择开销与压缩率按 Profile 假设，非实测。`,
      );
      const window = layout.windowTokens ?? layer.windowTokens;
      if (window !== undefined && window < maxModelLen) {
        limitations.push(`第 ${layer.layerIndex} 层窗口 ${window} < max_model_len=${maxModelLen}；池容量需按窗口/稀疏策略确认。`);
      }
      quality = quality === 'calibrated' ? quality : 'assumption';
      continue;
    }
    if (requiresSparseLayout) {
      return {
        bytesPerToken: null,
        quality: 'unavailable',
        limitations: [`${layer.kind} 的 KV 布局未建模；需声明 sparseKV 缓存组或 measuredBytesPerToken。`],
      };
    }
    if (layer.nKVHeads === undefined || layer.headDim === undefined) {
      return {
        bytesPerToken: null,
        quality: 'unavailable',
        limitations: [`第 ${layer.layerIndex} 层缺少 nKVHeads/headDim。`],
      };
    }
    const kBytes = layer.kDtypeBytes ?? 2;
    const vBytes = layer.vDtypeBytes ?? kBytes;
    const fullLayer = layer.nKVHeads * layer.headDim * (kBytes + vBytes);
    let perRank = fullLayer;
    switch (layer.kvLayout ?? 'head-sharded-tp') {
      case 'head-sharded-tp': {
        const headsPerRank = Math.ceil(layer.nKVHeads / Math.max(1, tpSize));
        perRank = headsPerRank * layer.headDim * (kBytes + vBytes);
        if (dcpSize > 1) dcpUnappliedLayers += 1;
        break;
      }
      case 'replicated':
        perRank = fullLayer;
        if (dcpSize > 1) dcpUnappliedLayers += 1;
        break;
      case 'context-sharded':
        perRank = fullLayer / Math.max(1, dcpSize);
        break;
      case 'mla-latent':
      case 'opaque':
      default:
        return {
          bytesPerToken: null,
          quality: 'unavailable',
          limitations: [`第 ${layer.layerIndex} 层 KV 布局 ${layer.kvLayout} 缺少显式每 Rank 数据。`],
        };
    }
    if (layer.windowTokens !== undefined && layer.windowTokens < maxModelLen) {
      limitations.push(
        `第 ${layer.layerIndex} 层使用窗口 ${layer.windowTokens}；每 Token KV 不变，池容量仍按 max_model_len 估算，未按窗口缩减，需后端确认实际回收策略。`,
      );
    }
    total += perRank;
  }

  if (dcpSize > 1 && dcpUnappliedLayers > 0) {
    limitations.push(
      `DCP=${dcpSize} 已声明，但 ${dcpUnappliedLayers} 个 Attention 层未声明 context-sharded/contextSharded 布局，KV 不随 DCP 切分；这些层仍按 TP/复制估算。`,
    );
  }

  if (ppSize > 1) {
    limitations.push(
      `PP=${ppSize} 的每 Rank KV 按 Stage ${ppStageIndex} 的层范围 [${stageStart}, ${stageEnd}) 求和；不同 Stage 的层数可能不同。`,
    );
  }

  return { bytesPerToken: total, quality, limitations };
}

export function planScenario(inputs: PlanInputs): PlanResult {
  const { scenario, hardware, model, framework } = inputs;
  const issues: ValidationIssue[] = validateScenarioSemantics(scenario, {
    getHardware: () => hardware,
    getModel: () => model,
    getFramework: () => framework,
  });

  const tpSizes = resolveTpGroupSizes(scenario.deployment);
  const dpSize = Math.max(1, scenario.deployment.logicalParallelism.dp ?? 1);
  const ppSize = Math.max(1, scenario.deployment.logicalParallelism.pp ?? 1);
  const spSize = Math.max(1, scenario.runtime.spSize ?? scenario.deployment.logicalParallelism.sp ?? 1);
  const epSize = Math.max(1, scenario.deployment.logicalParallelism.ep ?? 1);
  const dcpSize = Math.max(1, scenario.runtime.dcpSize ?? scenario.deployment.logicalParallelism.dcp ?? 1);
  const activationDtypeBytes = model.attentionLayers[0]?.kDtypeBytes ?? 2;
  const activationBytesPerToken = model.hiddenSize * activationDtypeBytes;
  const activationBytesPerRank = Math.ceil(activationBytesPerToken / spSize);
  const acceleratorMap = new Map(hardware.accelerators.map((a) => [a.id, a]));
  const poolMap = new Map(hardware.memoryPools.map((p) => [p.id, p]));
  const computeMap = new Map(hardware.resources.map((r) => [r.id, r]));

  // Expert placement is explicit: each rank owns a contiguous slice of the
  // expert list inside its EP group. Redundant experts are extra resident
  // copies, not additional logical experts.
  const moe = model.moe;
  const expertsPerRank = moe ? Math.ceil(moe.expertCount / epSize) : 0;
  const redundantExpertsPerRank = moe ? Math.ceil((moe.redundantExpertCount ?? 0) / epSize) : 0;
  const epMembers = new Map<string, string[]>();
  for (const rank of scenario.deployment.placement.ranks) {
    for (const groupId of rank.epGroupIds ?? []) {
      const list = epMembers.get(groupId) ?? [];
      list.push(rank.rankId);
      epMembers.set(groupId, list);
    }
  }
  const rankEpIndex = new Map<string, number>();
  scenario.deployment.placement.ranks.forEach((rank, placementIndex) => {
    const groupId = rank.epGroupIds?.[0];
    const members = groupId ? epMembers.get(groupId) ?? [] : [];
    rankEpIndex.set(rank.rankId, members.length > 0 ? Math.max(0, members.indexOf(rank.rankId)) : placementIndex % epSize);
  });
  const expertAssignments: ExpertAssignment[] = [];
  if (moe && moe.expertBytes !== undefined) {
    for (const rank of scenario.deployment.placement.ranks) {
      const epIndex = rankEpIndex.get(rank.rankId) ?? 0;
      for (let i = 0; i < expertsPerRank; i += 1) {
        const expertIndex = epIndex + i * epSize;
        if (expertIndex >= moe.expertCount) continue;
        expertAssignments.push({
          expertId: `expert-${expertIndex}`,
          rankId: rank.rankId,
          acceleratorId: rank.acceleratorId,
          replica: false,
          bytes: moe.expertBytes,
        });
      }
      for (let i = 0; i < redundantExpertsPerRank; i += 1) {
        expertAssignments.push({
          expertId: `expert-${(epIndex + i) % moe.expertCount}-redundant-${rank.rankId}`,
          rankId: rank.rankId,
          acceleratorId: rank.acceleratorId,
          replica: true,
          bytes: moe.expertBytes,
        });
      }
    }
  }
  const expertPlacement: ExpertPlacementPlan | undefined = moe
    ? {
        epSize,
        expertCount: moe.expertCount,
        topK: moe.topK,
        expertsPerRank,
        redundantExpertsPerRank,
        totalExpertBytes: expertAssignments.reduce((sum, item) => sum + item.bytes, 0),
        assignments: expertAssignments,
      }
    : undefined;

  const resolvedRanks: ResolvedRank[] = [];
  const rankPlans: RankPlan[] = [];
  const tpGroupMembers = new Map<string, string[]>();
  const dpGroupMembers = new Map<string, string[]>();
  const engineRankMap = new Map<string, string[]>();
  for (const rank of scenario.deployment.placement.ranks) {
    if (rank.tpGroupId) {
      const list = tpGroupMembers.get(rank.tpGroupId) ?? [];
      list.push(rank.rankId);
      tpGroupMembers.set(rank.tpGroupId, list);
    }
    const dpList = dpGroupMembers.get(rank.dpReplicaId) ?? [];
    dpList.push(rank.rankId);
    dpGroupMembers.set(rank.dpReplicaId, dpList);
    const engineList = engineRankMap.get(rank.engineId) ?? [];
    engineList.push(rank.rankId);
    engineRankMap.set(rank.engineId, engineList);
  }

  const limitations: string[] = [];
  let allWeightsKnown = true;
  let allKvKnown = true;

  for (const rank of scenario.deployment.placement.ranks) {
    const accelerator = acceleratorMap.get(rank.acceleratorId);
    if (!accelerator) {
      issues.push({
        severity: 'error',
        code: 'RANK_ACCELERATOR_MISSING',
        path: `deployment.placement.ranks.${rank.rankId}`,
        message: `Rank ${rank.rankId} 指向不存在的加速卡 ${rank.acceleratorId}。`,
      });
      continue;
    }
    const node = hardware.nodes.find((n) => n.id === accelerator.nodeId);
    const hbmPool = poolMap.get(accelerator.hbmPoolId);
    const compute = computeMap.get(accelerator.computeResourceId);
    const tpSize = tpSizes.get(rank.rankId) ?? 1;
    const tpMembers = rank.tpGroupId ? tpGroupMembers.get(rank.tpGroupId) ?? [] : [];
    const tpRankIndex = Math.max(0, tpMembers.indexOf(rank.rankId));

    const weights = computeWeightBytesPerRank(model, tpSize, dpSize, ppSize, epSize, redundantExpertsPerRank);
    if (weights.bytes === null) {
      allWeightsKnown = false;
      issues.push({
        severity: 'warning',
        code: 'WEIGHTS_UNAVAILABLE',
        path: `modelProfileId`,
        message: `Rank ${rank.rankId} 的权重驻留无法计算：${weights.note ?? '缺少 Tensor 布局。'}`,
        suggestedFix: '补充模型 Tensor Inventory 或导入经测量的每卡权重。',
      });
    }
    const kv = computeKvBytesPerToken(
      model,
      tpSize,
      dcpSize,
      scenario.runtime.maxModelLen,
      ppSize,
      rank.ppStageIndex ?? 0,
    );
    if (kv.bytesPerToken === null) {
      allKvKnown = false;
      issues.push({
        severity: 'warning',
        code: 'KV_UNAVAILABLE',
        path: 'modelProfileId',
        message: `Rank ${rank.rankId} 的 KV 布局无法计算：${kv.limitations[0] ?? '缺少 Attention 布局。'}`,
        suggestedFix: '补充 Attention Layer 形状或经测量的每 Token KV 字节数。',
      });
    }
    for (const limitation of kv.limitations) {
      if (!limitations.includes(limitation)) limitations.push(limitation);
    }

    const weightBytes = weights.bytes ?? 0;
    const runtimeBytes = model.runtimeAssumptions.runtimeBytesPerRank;
    const workspacePeakBytes = model.runtimeAssumptions.workspacePeakBytesPerRank;
    const graphCaptureBytes = model.runtimeAssumptions.graphCaptureBytesPerRank;
    const commBufferBytes = model.runtimeAssumptions.communicationBufferBytesPerRank;

    const hbmCapacity = hbmPool?.capacityBytes ?? 0;
    const externalReserved = hbmPool?.externalReservedBytes ?? 0;
    const utilization = scenario.runtime.gpuMemoryUtilization ?? 0.9;
    const hbmBudget = Math.max(0, hbmCapacity * utilization - externalReserved);
    const capacityKnown = weights.bytes !== null && kv.bytesPerToken !== null;
    const fixed = weightBytes + runtimeBytes + workspacePeakBytes + graphCaptureBytes + commBufferBytes;
    // Unknown weights or KV layout cannot produce a defensible reservation:
    // subtracting only the known fixed items would fabricate a huge KV pool.
    // An explicit kv_cache_memory_bytes is a user-declared budget, so it may
    // still seed a synthetic run when the KV layout itself is known.
    let kvReserved = capacityKnown ? Math.max(0, hbmBudget - fixed) : 0;
    if (capacityKnown && scenario.runtime.kvCacheMemoryBytes !== undefined) {
      if (scenario.runtime.kvCacheMemoryBytes > kvReserved) {
        issues.push({
          severity: 'warning',
          code: 'KV_EXPLICIT_OVERRIDE_EXCEEDS_BUDGET',
          path: 'runtime.kvCacheMemoryBytes',
          message: `显式 kv_cache_memory_bytes=${scenario.runtime.kvCacheMemoryBytes} 超过预算可容纳值 ${Math.floor(kvReserved)}；已按预算上限处理。`,
          suggestedFix: '降低显式 KV 预算或提高 gpu_memory_utilization。',
        });
      }
      kvReserved = Math.min(kvReserved, scenario.runtime.kvCacheMemoryBytes);
    } else if (!capacityKnown && kv.bytesPerToken !== null && scenario.runtime.kvCacheMemoryBytes !== undefined) {
      kvReserved = Math.min(Math.max(0, scenario.runtime.kvCacheMemoryBytes), hbmBudget);
      issues.push({
        severity: 'warning',
        code: 'CAPACITY_UNKNOWN_EXPLICIT_KV',
        path: 'runtime.kvCacheMemoryBytes',
        message: `Rank ${rank.rankId} 的权重未知；使用显式 kv_cache_memory_bytes=${Math.floor(kvReserved)} 作为合成运行的 KV 池，HBM 容量仍不可验证。`,
        suggestedFix: '补充权重 Tensor Inventory 后再做容量结论；合成运行的时间指标保持 SYNTHETIC。',
      });
    }
    const committed = fixed + kvReserved;
    const slack = hbmBudget - committed;

    const kvBytesPerToken = kv.bytesPerToken ?? 0;
    const alignment = hbmPool?.alignmentBytes ?? 256;
    const kvBytesPerBlock = kvBytesPerToken > 0 ? alignUp(kvBytesPerToken * scenario.runtime.blockSize, alignment) : 0;
    const maxKvBlocks = kvBytesPerBlock > 0 ? Math.floor(kvReserved / kvBytesPerBlock) : 0;

    if (capacityKnown && slack < 0) {
      issues.push({
        severity: 'error',
        code: 'HBM_OVER_BUDGET',
        path: `deployment.placement.ranks.${rank.rankId}`,
        message: `Rank ${rank.rankId} (${accelerator.id}) HBM 预算 ${Math.round(hbmBudget)} bytes 小于固定占用 ${Math.round(fixed)} bytes。`,
        suggestedFix: '降低模型驻留、提高 gpu_memory_utilization，或使用更多 TP/设备。',
      });
    }
    if (capacityKnown && maxKvBlocks < 1) {
      issues.push({
        severity: 'error',
        code: 'KV_POOL_EMPTY',
        path: `deployment.placement.ranks.${rank.rankId}`,
        message: `Rank ${rank.rankId} 的 KV 池不足以容纳一个 Block（block_size=${scenario.runtime.blockSize}），Plan 不可运行。`,
        suggestedFix: '降低权重/运行时占用、提高 gpu_memory_utilization，或显式提供足够的 kv_cache_memory_bytes。',
      });
    }

    const weightQuality: MetricQuality = weights.bytes === null ? 'unavailable' : weights.quality;
    const kvQuality: MetricQuality = kv.bytesPerToken === null ? 'unavailable' : kv.quality;
    const capacityQuality: MetricQuality = !capacityKnown
      ? 'unavailable'
      : weightQuality === 'calibrated' && kvQuality === 'calibrated'
        ? 'calibrated'
        : 'assumption';
    const hbmRead = hbmPool?.readBytesPerSecond.value ?? null;
    const hbmWrite = hbmPool?.writeBytesPerSecond.value ?? null;

    resolvedRanks.push({
      rankId: rank.rankId,
      acceleratorId: rank.acceleratorId,
      nodeId: node?.id ?? accelerator.nodeId,
      engineId: rank.engineId,
      dpReplicaId: rank.dpReplicaId,
      tpGroupId: rank.tpGroupId,
      tpRankIndex,
      epGroupIds: rank.epGroupIds,
      ppStageId: rank.ppStageId,
      ppStageIndex: rank.ppStageIndex,
      pcpGroupId: rank.pcpGroupId,
      dcpGroupId: rank.dcpGroupId,
      spGroupId: rank.spGroupId,
    });

    rankPlans.push({
      rankId: rank.rankId,
      acceleratorId: rank.acceleratorId,
      nodeId: node?.id ?? accelerator.nodeId,
      engineId: rank.engineId,
      dpReplicaId: rank.dpReplicaId,
      tpGroupId: rank.tpGroupId,
      tpGroupSize: tpSize,
      tpRankIndex,
      ppStageId: rank.ppStageId,
      ppStageIndex: rank.ppStageIndex,
      spGroupId: rank.spGroupId,
      activationBytesPerRank: ppSize > 1 || spSize > 1 ? activationBytesPerRank : undefined,
      weightBytes,
      expertBytes: moe && moe.expertBytes !== undefined ? (expertsPerRank + redundantExpertsPerRank) * moe.expertBytes : undefined,
      expertCount: moe ? expertsPerRank : undefined,
      redundantExpertCount: moe ? redundantExpertsPerRank : undefined,
      runtimeBytes,
      workspacePeakBytes,
      graphCaptureBytes,
      commBufferBytes,
      hbmCapacityBytes: hbmCapacity,
      hbmBudgetBytes: hbmBudget,
      kvPoolReservedBytes: kvReserved,
      kvBytesPerToken,
      kvBytesPerBlock,
      maxKvBlocks,
      hbmCommittedBytes: committed,
      hbmSlackBytes: slack,
      kvPoolUsedBytes: 0,
      computeTflops: compute?.assumedTflops ?? null,
      hbmReadBytesPerSecond: hbmRead,
      hbmWriteBytesPerSecond: hbmWrite,
      weightQuality,
      kvQuality,
      capacityQuality,
    });
  }

  const groups: ParallelGroup[] = [];
  for (const [id, memberRankIds] of tpGroupMembers) {
    groups.push({ id, kind: 'TP', memberRankIds });
  }
  for (const [id, memberRankIds] of dpGroupMembers) {
    groups.push({ id, kind: 'DP', memberRankIds, replicaId: id });
  }
  for (const engine of scenario.deployment.engines) {
    if (engine.role !== 'mixed') {
      groups.push({
        id: `pd-${engine.id}`,
        kind: 'PD',
        memberRankIds: engine.rankIds,
        replicaId: engine.role,
      });
    }
  }
  const epGroups = new Map<string, string[]>();
  for (const rank of scenario.deployment.placement.ranks) {
    for (const epGroupId of rank.epGroupIds ?? []) {
      const list = epGroups.get(epGroupId) ?? [];
      list.push(rank.rankId);
      epGroups.set(epGroupId, list);
    }
  }
  for (const [id, memberRankIds] of epGroups) {
    groups.push({ id, kind: 'EP', memberRankIds });
  }
  const pcpGroups = new Map<string, string[]>();
  const dcpGroups = new Map<string, string[]>();
  for (const rank of scenario.deployment.placement.ranks) {
    if (rank.pcpGroupId) {
      const list = pcpGroups.get(rank.pcpGroupId) ?? [];
      list.push(rank.rankId);
      pcpGroups.set(rank.pcpGroupId, list);
    }
    if (rank.dcpGroupId) {
      const list = dcpGroups.get(rank.dcpGroupId) ?? [];
      list.push(rank.rankId);
      dcpGroups.set(rank.dcpGroupId, list);
    }
  }
  for (const [id, memberRankIds] of pcpGroups) {
    groups.push({ id, kind: 'PCP', memberRankIds });
  }
  for (const [id, memberRankIds] of dcpGroups) {
    groups.push({ id, kind: 'DCP', memberRankIds });
  }
  const ppGroups = new Map<string, string[]>();
  const spGroups = new Map<string, string[]>();
  for (const rank of scenario.deployment.placement.ranks) {
    if (rank.ppStageId) {
      const list = ppGroups.get(rank.ppStageId) ?? [];
      list.push(rank.rankId);
      ppGroups.set(rank.ppStageId, list);
    }
    if (rank.spGroupId) {
      const list = spGroups.get(rank.spGroupId) ?? [];
      list.push(rank.rankId);
      spGroups.set(rank.spGroupId, list);
    }
  }
  for (const [id, memberRankIds] of ppGroups) {
    groups.push({ id, kind: 'PP', memberRankIds });
  }
  for (const [id, memberRankIds] of spGroups) {
    groups.push({ id, kind: 'SP', memberRankIds });
  }

  const engines: EnginePlan[] = scenario.deployment.engines.map((engine) => {
    const ranks = rankPlans.filter((r) => engine.rankIds.includes(r.rankId));
    const first = ranks[0];
    const maxBlocks = ranks.length > 0 ? Math.min(...ranks.map((r) => r.maxKvBlocks)) : 0;
    const kvPool = ranks.length > 0 ? Math.min(...ranks.map((r) => r.kvPoolReservedBytes)) : 0;
    const tflops = ranks.reduce((sum, r) => sum + (r.computeTflops ?? 0), 0);
    const ppStageIds = [...new Set(ranks.map((r) => r.ppStageId).filter((id): id is string => id !== undefined))];
    return {
      id: engine.id,
      role: engine.role,
      rankIds: engine.rankIds,
      dpReplicaId: first?.dpReplicaId ?? engine.id,
      kvBytesPerBlock: first?.kvBytesPerBlock ?? 0,
      maxKvBlocksPerRank: maxBlocks,
      kvPoolReservedBytesPerRank: kvPool,
      prefillTflopsTotal: tflops,
      decodeWeightBytesPerRank: first?.weightBytes ?? 0,
      ...(ppSize > 1 ? { ppSize, ppStageIds } : {}),
      ...(spSize > 1 ? { spSize } : {}),
    };
  });

  const hasErrors = issues.some((i) => i.severity === 'error');
  const feasibility: PlanResult['feasibility'] = hasErrors
    ? 'infeasible'
    : !allWeightsKnown || !allKvKnown
      ? 'unknown'
      : 'feasible';

  const replicaCount = new Set(scenario.deployment.placement.ranks.map((r) => r.dpReplicaId)).size;
  const nodeIds = new Set(hardware.accelerators.filter((a) => scenario.deployment.placement.ranks.some((r) => r.acceleratorId === a.id)).map((a) => a.nodeId));
  const weights = rankPlans.map((r) => r.weightBytes).filter((v) => v > 0);

  if (ppSize > model.numLayers) {
    issues.push({
      severity: 'warning',
      code: 'PP_STAGES_EXCEED_LAYERS',
      path: 'deployment.logicalParallelism.pp',
      message: `PP=${ppSize} 大于模型层数 ${model.numLayers}；部分 Stage 将没有 Transformer 层，pipeline 结果只具结构意义。`,
      suggestedFix: '降低 PP 或选择层数更多的模型。',
    });
  }

  let pipeline: PipelinePlan | undefined;
  if (ppSize > 1) {
    const stages = Array.from({ length: ppSize }, (_, stageIndex) => {
      const layerStart = Math.floor((model.numLayers * stageIndex) / ppSize);
      const layerEnd = Math.floor((model.numLayers * (stageIndex + 1)) / ppSize);
      return {
        stageId: `pp-stage-${stageIndex}`,
        stageIndex,
        layerRange: [layerStart, layerEnd] as [number, number],
        rankIds: rankPlans.filter((r) => r.ppStageIndex === stageIndex).map((r) => r.rankId),
        activationBytesPerToken,
      };
    });
    const microbatches = Math.max(1, scenario.runtime.maxNumSeqs);
    const bubbleFraction = (ppSize - 1) / (microbatches + ppSize - 1);
    pipeline = {
      ppSize,
      stages,
      bubbleFraction,
      activationBytesPerToken,
      note: `PP 按 ${ppSize} 个 Stage 均匀切分 ${model.numLayers} 层；bubble 以 max_num_seqs=${microbatches} 个微批估算，activation 跨 Stage 传输只计结构成本。`,
    };
    limitations.push('PP 采用均匀层切分与理想 microbatch 填充；真实流水线调度、Stage 负载不均与跨节点带宽未建模。');
  }

  let sequenceParallel: SequenceParallelPlan | undefined;
  if (spSize > 1) {
    sequenceParallel = {
      spSize,
      groupIds: [...spGroups.keys()],
      activationShardFactor: spSize,
      collectiveCostUs: sequenceParallelCollectiveCostUs(spSize),
      note: 'SP 复用 TP Rank，只沿序列维切分 Activation；Workspace 不随之切分。它不同于 PCP/DCP 的上下文 KV 切分，也不新增设备。',
    };
    limitations.push('SP 的 collective 成本为按 log2(spSize) 估算的假设值，未按具体 All-Gather/Reduce-Scatter 实现标定。');
  }

  let speculative: SpeculativePlan | undefined;
  if (scenario.runtime.speculative) {
    const config = scenario.runtime.speculative;
    const draftCostRatio = config.draftCostRatio ?? 0.15;
    const expectedAcceptedTokensPerStep = 1 + config.draftTokens * config.acceptanceRate;
    const frameworkSupport = framework.supportedFeatures[config.method] ?? 'unknown';
    speculative = {
      method: config.method,
      draftTokens: config.draftTokens,
      acceptanceRate: config.acceptanceRate,
      expectedAcceptedTokensPerStep,
      draftCostRatio,
      expectedDecodeSpeedup: expectedAcceptedTokensPerStep / (1 + draftCostRatio * config.draftTokens),
      frameworkSupport,
      note:
        frameworkSupport === 'unknown'
          ? `适配器 ${framework.id} 未声明支持 ${config.method.toUpperCase()}；以下仅为场景假设，不作为已验证收益。`
          : frameworkSupport === 'unsupported'
            ? `适配器 ${framework.id} 明确不支持 ${config.method.toUpperCase()}；以下数值仅用于结构展示。`
            : 'MTP/DSpark 的接受率是场景假设；收益随任务与采样参数变化，不是固定加速比。',
    };
    if (frameworkSupport === 'unknown') {
      limitations.push(`${config.method.toUpperCase()} 在适配器 ${framework.id} 中为 unknown；Plan 不宣称该功能已验证。`);
    } else if (frameworkSupport === 'unsupported') {
      limitations.push(`${config.method.toUpperCase()} 在适配器 ${framework.id} 中为 unsupported；Plan 不可运行。`);
    }
    limitations.push('投机解码按每步期望接受 Token 数建模，未模拟 Draft 模型独立显存、验证失败回滚与批内混合接受率。');
  }

  const provenance: Evidence = {
    kind: model.provenance.kind === 'measured' ? 'measured' : 'assumed',
    note: '容量计算基于 Profile 与显式并行映射；时间指标另行标注假设。',
  };

  return {
    scenarioId: scenario.id,
    engineVersion: ENGINE_VERSION,
    accuracyTier: scenario.accuracyTier,
    resolvedRanks,
    groups,
    ranks: rankPlans,
    engines,
    expertPlacement,
    pipeline,
    sequenceParallel,
    speculative,
    issues,
    feasibility,
    limitations,
    totals: {
      acceleratorCount: rankPlans.length,
      nodeCount: nodeIds.size,
      replicaCount,
      weightBytesPerRankMin: weights.length ? Math.min(...weights) : 0,
      weightBytesPerRankMax: weights.length ? Math.max(...weights) : 0,
      kvPoolBytesTotal: rankPlans.reduce((sum, r) => sum + r.kvPoolReservedBytes, 0),
      hbmCapacityBytesTotal: rankPlans.reduce((sum, r) => sum + r.hbmCapacityBytes, 0),
    },
    provenance,
  };
}
