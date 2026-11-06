/**
 * InferenceLab domain types.
 *
 * Units are explicit in names: bytes, microseconds, bits per second,
 * bytes per second. No implicit unit conversion in the UI layer.
 */

export type ID = string;
export type Bytes = number;
export type Microseconds = number;
export type BitsPerSecond = number;
export type BytesPerSecond = number;

export type ProvenanceKind = 'derived' | 'measured' | 'estimated' | 'assumed' | 'unknown';
export type AccuracyTier = 'structural' | 'analytical' | 'discrete-event' | 'calibrated';
export type MetricQuality = 'exact' | 'assumption' | 'calibrated' | 'unavailable';
export type FeatureSupport = 'supported' | 'partial' | 'unsupported' | 'unknown';
export type Severity = 'error' | 'warning' | 'info';

export interface Evidence {
  kind: ProvenanceKind;
  sourceUrl?: string;
  sourceTag?: string;
  version?: string;
  note?: string;
  measuredAt?: string;
  validity?: string;
}

export interface Sourced<T> {
  value: T | null;
  evidence: Evidence;
}

/* ------------------------------------------------------------------ */
/* Hardware                                                            */
/* ------------------------------------------------------------------ */

export interface HardwareNode {
  id: ID;
  cpuCores: number;
  dramPoolId: ID;
  nicIds?: ID[];
  numaNodeIds?: ID[];
  label?: string;
}

export interface Accelerator {
  id: ID;
  nodeId: ID;
  vendor: 'nvidia' | 'ascend' | 'amd' | 'toy';
  family: string;
  hbmPoolId: ID;
  computeResourceId: ID;
  dmaResourceIds: ID[];
  label?: string;
}

export interface MemoryPool {
  id: ID;
  ownerId: ID;
  kind: 'HBM' | 'DRAM' | 'PINNED' | 'SSD';
  capacityBytes: Bytes;
  externalReservedBytes: Bytes;
  alignmentBytes: Bytes;
  readBytesPerSecond: Sourced<BytesPerSecond>;
  writeBytesPerSecond: Sourced<BytesPerSecond>;
  numaNodeId?: ID;
}

export interface ComputeResource {
  id: ID;
  kind: 'compute' | 'dma' | 'nic' | 'cpu' | string;
  assumedTflops?: number;
  concurrency?: number;
  evidence?: Evidence;
}

export interface Link {
  id: ID;
  fromId: ID;
  toId: ID;
  kind: 'PCIe' | 'HCCS' | 'NVLINK' | 'NVSWITCH' | 'NIC' | 'FABRIC' | 'OTHER' | string;
  nominalBitsPerSecond: BitsPerSecond;
  effectiveRatio: number;
  latencyUs: Microseconds;
  duplex: 'full' | 'half';
  contentionDomainId: ID;
}

export interface ContentionDomain {
  id: ID;
  capacityBitsPerSecond: BitsPerSecond;
  duplex: 'full' | 'half';
  arbitration: 'serialized' | 'processor-sharing';
  provenance?: Evidence;
}

export interface HardwareProfile {
  id: ID;
  /** Human-readable name for selectors; IDs remain the stable identity. */
  label?: string;
  version: string;
  profileType: 'synthetic-toy' | 'hardware-measured' | 'hardware-vendor-spec';
  provenance: Evidence;
  nodes: HardwareNode[];
  accelerators: Accelerator[];
  memoryPools: MemoryPool[];
  links: Link[];
  contentionDomains: ContentionDomain[];
  resources: ComputeResource[];
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export type AttentionKind = 'MHA' | 'GQA' | 'MLA' | 'SFA' | 'DSA' | 'HYBRID' | 'WINDOW' | 'UNKNOWN';

/**
 * Explicit layout for sparse / hybrid attention layers. SFA/DSA cannot be
 * derived from the GQA head formula; a layer must declare either its stored
 * cache shape or a measured per-token byte count.
 */
export interface SparseKvLayout {
  cacheGroup: string;
  storage: 'full' | 'window' | 'compressed';
  nKVHeads?: number;
  headDim?: number;
  /** Compressed latent width for SFA/DSA storage. */
  kvLatentDim?: number;
  dtypeBytes?: number;
  windowTokens?: number;
}

export interface AttentionLayer {
  layerIndex: number;
  kind: AttentionKind;
  nQueryHeads?: number;
  nKVHeads?: number;
  headDim?: number;
  kDtypeBytes?: number;
  vDtypeBytes?: number;
  /** MLA latent cache dimension (stored), not head KV formula. */
  kvLatentDim?: number;
  ropeDim?: number;
  windowTokens?: number;
  kvLayout?: 'head-sharded-tp' | 'replicated' | 'mla-latent' | 'context-sharded' | 'opaque';
  /** MLA cache may be sharded by DCP while still using the latent layout. */
  contextSharded?: boolean;
  /** Explicit sparse/hybrid cache layout; required when the GQA formula does not apply. */
  sparseKV?: SparseKvLayout;
  /** Explicit measured/assumed bytes per token for the full model, if known. */
  measuredBytesPerToken?: number;
}

export type TensorPlacementRule = 'replicate' | 'shard-tp' | 'shard-dp' | 'expert-partition' | 'pipeline-partition' | 'opaque';

export interface TensorInventoryItem {
  id: ID;
  logicalBytes: Bytes;
  rule: TensorPlacementRule;
  scaleAndMetadataBytes?: Bytes;
  alignBytes?: Bytes;
  /** For opaque / measured per-rank resident bytes. */
  measuredBytesPerRank?: Bytes;
  layerRange?: [number, number];
}

export interface MoeSpec {
  expertCount: number;
  topK: number;
  expertBytes?: Bytes;
  sharedExpertBytes?: Bytes;
  redundantExpertCount?: number;
  /** Synthetic routing skew in [0,1]; 0 = balanced, higher = stronger hotspot. */
  hotspotSkew?: number;
}

export interface ExpertAssignment {
  expertId: ID;
  rankId: ID;
  acceleratorId: ID;
  replica: boolean;
  bytes: Bytes;
}

export interface ExpertPlacementPlan {
  epSize: number;
  expertCount: number;
  topK: number;
  expertsPerRank: number;
  redundantExpertsPerRank: number;
  totalExpertBytes: Bytes;
  assignments: ExpertAssignment[];
}

export interface ModelProfile {
  id: ID;
  revision: string;
  profileType: 'synthetic-toy' | 'model-measured' | 'model-vendor-spec';
  provenance: Evidence;
  architectureFamily: string;
  numLayers: number;
  hiddenSize: number;
  vocabSize: number;
  attentionLayers: AttentionLayer[];
  tensorInventory: TensorInventoryItem[];
  moe?: MoeSpec;
  runtimeAssumptions: {
    runtimeBytesPerRank: Bytes;
    workspacePeakBytesPerRank: Bytes;
    graphCaptureBytesPerRank: Bytes;
    communicationBufferBytesPerRank: Bytes;
  };
  latencyAssumptions: {
    model: string;
    assumed: boolean;
    /** Optional assumed effective compute in TFLOP/s per accelerator. */
    prefillTflopsPerAccelerator?: number;
    /** Optional assumed decode launch overhead. */
    decodeLaunchOverheadUs?: number;
  };
  sourceUrls: string[];
}

/* ------------------------------------------------------------------ */
/* Framework adapter                                                   */
/* ------------------------------------------------------------------ */

export interface FrameworkProfile {
  id: ID;
  framework: string;
  versionTagOrCommit: string;
  provenance: Evidence;
  supportedFeatures: Record<string, FeatureSupport>;
  parameterMappings: Record<string, string>;
  sourceUrls: string[];
}

/* ------------------------------------------------------------------ */
/* Scenario                                                            */
/* ------------------------------------------------------------------ */

export interface EngineInstance {
  id: ID;
  role: 'mixed' | 'prefill' | 'decode';
  rankIds: ID[];
  schedulerId: ID;
  cacheManagerId: ID;
  kvTransferStrategyId?: ID;
}

export interface RankPlacement {
  rankId: ID;
  engineId: ID;
  acceleratorId: ID;
  dpReplicaId: ID;
  tpGroupId?: ID;
  epGroupIds?: ID[];
  ppStageId?: ID;
  /** Zero-based stage index inside one pipeline replica. */
  ppStageIndex?: number;
  pcpGroupId?: ID;
  dcpGroupId?: ID;
  /** Sequence Parallel group; reuses TP ranks. */
  spGroupId?: ID;
}

export interface PhysicalPlacement {
  ranks: RankPlacement[];
}

export type RoutingPolicy =
  | { kind: 'fixed'; assignments?: Record<ID, ID> }
  | { kind: 'round-robin' }
  | { kind: 'sticky' };

export interface Deployment {
  engines: EngineInstance[];
  placement: PhysicalPlacement;
  logicalParallelism: Record<string, number>;
  routing?: RoutingPolicy;
  kvTransfer?: {
    strategy: 'GPU_LOCAL' | 'CPU_OFFLOAD' | 'PD_PULL' | 'PD_LAYERWISE_PUSH' | 'PD_HOST_STAGING';
    hostCacheBytes?: Bytes;
  };
}

export interface RuntimeConfig {
  maxModelLen: number;
  maxNumSeqs: number;
  maxNumBatchedTokens: number;
  blockSize: number;
  enableChunkedPrefill: boolean;
  enablePrefixCaching: boolean;
  gpuMemoryUtilization?: number;
  kvCacheMemoryBytes?: number;
  preemptionPolicy: 'recompute' | 'none' | 'backend-specific';
  /** M3: host KV cache tier */
  enableCpuOffload?: boolean;
  hostCacheBytes?: Bytes;
  /** M4 structural toggles; unsupported combinations are reported by adapters. */
  enableExpertParallel?: boolean;
  pcpSize?: number;
  dcpSize?: number;
  /** Sequence Parallel reuses TP ranks; it never adds devices. */
  spSize?: number;
  /** MTP / DSpark speculative decoding assumptions. */
  speculative?: SpeculativeConfig;
}

/**
 * Speculative decoding is workload-dependent. The acceptance rate is an
 * explicit scenario assumption, not a fixed speedup promised by the tool.
 */
export interface SpeculativeConfig {
  method: 'mtp' | 'dspark';
  /** Draft tokens proposed per decode step. */
  draftTokens: number;
  /** Acceptance probability in [0, 1]. */
  acceptanceRate: number;
  /** Extra draft compute as a fraction of one target decode step. Defaults to 0.15 when omitted. */
  draftCostRatio?: number;
}

export interface PrefixBlockSpec {
  hash: string;
  tokenCount: number;
}

export interface RequestSpec {
  id: ID;
  atUs: Microseconds;
  promptTokens: number;
  outputTokens: number;
  prefixBlocks?: PrefixBlockSpec[];
  conversationId?: ID;
  turnIndex?: number;
  priority?: number;
  /** Optional measured observations from an imported trace. */
  observed?: ObservedRequestMetrics;
}

export interface ObservedRequestMetrics {
  ttftUs?: Microseconds;
  tpotUs?: Microseconds;
  finishUs?: Microseconds;
  source?: string;
}

export type WorkloadConfig =
  | { kind: 'trace'; requests: RequestSpec[] }
  | { kind: 'fixed'; count: number; promptTokens: number; outputTokens: number; atUs: Microseconds }
  | { kind: 'poisson'; count: number; arrivalRatePerSecond: number; promptTokens: number; outputTokens: number }
  | {
      kind: 'agent';
      conversations: number;
      turns: number;
      baseSystemTokens: number;
      turnIncrementTokens: number;
      outputTokens: number;
      toolWaitUs: Microseconds;
      routing?: 'sticky' | 'round-robin';
    };

export interface Scenario {
  schemaVersion: '1.0';
  id: ID;
  title: string;
  seed: number;
  accuracyTier: AccuracyTier;
  hardwareProfileId: ID;
  modelProfileId: ID;
  frameworkProfileId: ID;
  deployment: Deployment;
  runtime: RuntimeConfig;
  workload: WorkloadConfig;
  assumptions: Record<string, number | boolean | string>;
}

/* ------------------------------------------------------------------ */
/* Validation & planning                                               */
/* ------------------------------------------------------------------ */

export interface ValidationIssue {
  severity: Severity;
  code: string;
  path: string;
  message: string;
  evidence?: Evidence;
  suggestedFix?: string;
}

export interface ResolvedRank {
  rankId: ID;
  acceleratorId: ID;
  nodeId: ID;
  engineId: ID;
  dpReplicaId: ID;
  tpGroupId?: ID;
  tpRankIndex?: number;
  epGroupIds?: ID[];
  ppStageId?: ID;
  ppStageIndex?: number;
  pcpGroupId?: ID;
  dcpGroupId?: ID;
  spGroupId?: ID;
}

export interface ParallelGroup {
  id: ID;
  kind: 'TP' | 'DP' | 'EP' | 'PP' | 'SP' | 'PCP' | 'DCP' | 'PD';
  memberRankIds: ID[];
  replicaId?: ID;
}

export interface RankPlan {
  rankId: ID;
  acceleratorId: ID;
  nodeId: ID;
  engineId: ID;
  dpReplicaId: ID;
  tpGroupId?: ID;
  tpGroupSize: number;
  tpRankIndex: number;
  ppStageId?: ID;
  ppStageIndex?: number;
  spGroupId?: ID;
  /** Synthetic activation bytes for this rank after SP sharding. */
  activationBytesPerRank?: Bytes;
  weightBytes: Bytes;
  /** MoE-only: resident expert bytes on this rank (base + redundant copies). */
  expertBytes?: Bytes;
  expertCount?: number;
  redundantExpertCount?: number;
  runtimeBytes: Bytes;
  workspacePeakBytes: Bytes;
  graphCaptureBytes: Bytes;
  commBufferBytes: Bytes;
  hbmCapacityBytes: Bytes;
  hbmBudgetBytes: Bytes;
  kvPoolReservedBytes: Bytes;
  kvBytesPerToken: Bytes;
  kvBytesPerBlock: Bytes;
  maxKvBlocks: number;
  hbmCommittedBytes: Bytes;
  hbmSlackBytes: Bytes;
  kvPoolUsedBytes: Bytes;
  computeTflops: number | null;
  hbmReadBytesPerSecond: BytesPerSecond | null;
  hbmWriteBytesPerSecond: BytesPerSecond | null;
  weightQuality: MetricQuality;
  kvQuality: MetricQuality;
  /**
   * Quality of the capacity ledger itself. `unavailable` means the weight
   * bytes or KV layout is unknown, so KV reservation/block counts must not be
   * presented as computed capacity.
   */
  capacityQuality: MetricQuality;
}

export interface EnginePlan {
  id: ID;
  role: 'mixed' | 'prefill' | 'decode';
  rankIds: ID[];
  dpReplicaId: ID;
  kvBytesPerBlock: Bytes;
  maxKvBlocksPerRank: number;
  kvPoolReservedBytesPerRank: Bytes;
  prefillTflopsTotal: number;
  decodeWeightBytesPerRank: Bytes;
  ppSize?: number;
  ppStageIds?: ID[];
  spSize?: number;
}

export interface PipelineStagePlan {
  stageId: ID;
  stageIndex: number;
  layerRange: [number, number];
  rankIds: ID[];
  activationBytesPerToken: Bytes;
}

export interface PipelinePlan {
  ppSize: number;
  stages: PipelineStagePlan[];
  /** Ideal bubble fraction for the configured max_num_seqs micro-batches. */
  bubbleFraction: number;
  activationBytesPerToken: Bytes;
  note: string;
}

export interface SequenceParallelPlan {
  spSize: number;
  groupIds: ID[];
  /** Activation bytes are divided by this factor; Workspace is not sharded. */
  activationShardFactor: number;
  collectiveCostUs: Microseconds;
  note: string;
}

export interface SpeculativePlan {
  method: 'mtp' | 'dspark';
  draftTokens: number;
  acceptanceRate: number;
  expectedAcceptedTokensPerStep: number;
  draftCostRatio: number;
  expectedDecodeSpeedup: number;
  /** Framework capability matrix entry for this method. */
  frameworkSupport: FeatureSupport;
  note: string;
}

export interface PlanResult {
  scenarioId: ID;
  engineVersion: string;
  accuracyTier: AccuracyTier;
  resolvedRanks: ResolvedRank[];
  groups: ParallelGroup[];
  ranks: RankPlan[];
  engines: EnginePlan[];
  /** MoE-only structural placement; absent for dense models. */
  expertPlacement?: ExpertPlacementPlan;
  /** PP/SP/MTP structural plans; absent when the feature is disabled. */
  pipeline?: PipelinePlan;
  sequenceParallel?: SequenceParallelPlan;
  speculative?: SpeculativePlan;
  issues: ValidationIssue[];
  feasibility: 'feasible' | 'infeasible' | 'unknown';
  limitations: string[];
  totals: {
    acceleratorCount: number;
    nodeCount: number;
    replicaCount: number;
    weightBytesPerRankMin: Bytes;
    weightBytesPerRankMax: Bytes;
    kvPoolBytesTotal: Bytes;
    hbmCapacityBytesTotal: Bytes;
  };
  provenance: Evidence;
}

/* ------------------------------------------------------------------ */
/* Simulation events & trace                                           */
/* ------------------------------------------------------------------ */

export type SimEventType =
  | 'REQUEST_ARRIVED'
  | 'REQUEST_QUEUED'
  | 'REQUEST_SCHEDULED'
  | 'PREFIX_LOOKUP_DONE'
  | 'KV_ALLOCATED'
  | 'KV_FREED'
  | 'BLOCK_CACHED'
  | 'BLOCK_EVICTED'
  | 'BLOCK_OFFLOAD_STARTED'
  | 'BLOCK_OFFLOAD_COMPLETED'
  | 'BLOCK_LOAD_STARTED'
  | 'BLOCK_LOAD_COMPLETED'
  | 'COMPUTE_STARTED'
  | 'COMPUTE_DONE'
  | 'TRANSFER_STARTED'
  | 'TRANSFER_COMPLETED'
  | 'TOKEN_EMITTED'
  | 'REQUEST_PREEMPTED'
  | 'REQUEST_FINISHED'
  | 'REQUEST_REJECTED'
  | 'SCHEDULE_TICK'
  | 'RESOURCE_UPDATED'
  | 'SIMULATION_ENDED';

export interface SimEvent {
  id: ID;
  timeUs: Microseconds;
  order: number;
  type: SimEventType;
  targetId?: ID;
  requestId?: ID;
  resourceIds: ID[];
  dependsOn: ID[];
  detail: Record<string, unknown>;
}

export type RequestStatus =
  | 'ARRIVED'
  | 'WAITING'
  | 'RUNNING'
  | 'WAITING_FOR_REMOTE_KV'
  | 'PREEMPTED'
  | 'FINISHED'
  | 'REJECTED'
  | 'CANCELLED';

export interface RequestTrace {
  id: ID;
  engineId: ID;
  dpReplicaId: ID;
  arrivalUs: Microseconds;
  promptTokens: number;
  outputTokens: number;
  logicalInputTokens: number;
  cachedInputTokens: number;
  computedPrefillTokens: number;
  generatedTokens: number;
  status: RequestStatus;
  firstTokenUs: Microseconds | null;
  lastTokenUs: Microseconds | null;
  finishUs: Microseconds | null;
  ttftUs: Microseconds | null;
  tpotUs: Microseconds | null;
  queueWaitUs: Microseconds;
  preemptions: number;
  kvBlocksPeak: number;
  waitingReason: string | null;
  transferBytes: Bytes;
  prefillEngineId?: ID;
  decodeEngineId?: ID;
  conversationId?: ID;
  turnIndex?: number;
  /** Measured values imported from a trace, never inferred by the simulator. */
  observed?: ObservedRequestMetrics;
}

export interface ExpertLoad {
  expertId: ID;
  rankId: ID;
  acceleratorId: ID;
  replica: boolean;
  tokens: number;
  share: number;
}

export interface MoeRunSummary {
  epSize: number;
  topK: number;
  dispatchedTokens: number;
  crossRankDispatches: number;
  a2aBytes: Bytes;
  a2aUs: Microseconds;
  hotspotRatio: number;
  hotspotExpertId: ID | null;
  loads: ExpertLoad[];
  quality: MetricQuality;
}

export interface CalibrationCurve {
  id: ID;
  op: 'prefill' | 'decode' | 'kv-transfer';
  hardwareProfileId: ID;
  /** Required: a curve without an explicit model is not a match. */
  modelProfileId: ID;
  /** Required: a curve without an explicit framework version is not a match. */
  frameworkVersion: string;
  dtype: string;
  batchMin: number;
  batchMax: number;
  seqLenMin: number;
  seqLenMax: number;
  /** Measured duration for the midpoint of this scope. */
  timeUs: Microseconds;
  achievedBytesPerSecond?: BytesPerSecond;
  /** Optional declared measurement uncertainty (percent, 0–100). */
  uncertaintyPct?: number;
  sourceUrl?: string;
  measuredAt?: string;
  note?: string;
}

export interface CalibrationSummary {
  importedCurves: number;
  appliedCurveIds: ID[];
  timingQuality: MetricQuality;
  outOfScope: boolean;
  /** Max declared uncertainty among applied curves, if any curve declared one. */
  uncertaintyPct: number | null;
  note: string;
}

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  quality: MetricQuality;
  evidenceIds: ID[];
  reason?: string;
  group?: string;
}

export interface MetricSeriesPoint {
  timeUs: Microseconds;
  value: number;
}

export interface MetricSeries {
  key: string;
  label: string;
  unit: string;
  quality: MetricQuality;
  points: MetricSeriesPoint[];
}

export interface KvBlockView {
  id: ID;
  poolId: ID;
  engineId: ID;
  blockIndex: number;
  hash: string | null;
  parentHash: string | null;
  state: 'FREE' | 'RESERVED' | 'PARTIAL' | 'COMPLETE' | 'CACHED_ACTIVE' | 'REUSABLE' | 'EVICTING' | 'OFFLOADING' | 'HOST_RESIDENT' | 'LOADING';
  location: 'HBM' | 'DRAM' | 'SSD';
  refCount: number;
  requestId: ID | null;
  bytes: Bytes;
  lastUsedUs: Microseconds;
  generation: number;
}

export interface RequestView {
  id: ID;
  engineId: ID;
  dpReplicaId: ID;
  status: RequestStatus;
  promptTokens: number;
  outputTokens: number;
  numComputedTokens: number;
  computedPrefillTokens: number;
  numGeneratedTokens: number;
  cachedInputTokens: number;
  firstTokenUs: Microseconds | null;
  lastTokenUs: Microseconds | null;
  arrivalUs: Microseconds;
  finishUs: Microseconds | null;
  waitingReason: string | null;
  preemptions: number;
  kvBlockIds: ID[];
  scheduledTokensThisStep: number;
}

export interface EngineView {
  id: ID;
  role: 'mixed' | 'prefill' | 'decode';
  dpReplicaId: ID;
  waiting: ID[];
  running: ID[];
  preempted: ID[];
  kvBlocksUsed: number;
  kvBlocksFree: number;
  kvBlocksTotal: number;
  kvPoolBytesUsed: Bytes;
  kvPoolBytesTotal: Bytes;
  lastBudgetTotal: number;
  lastBudgetUsed: number;
  lastIteration: number;
}

export interface SimViewState {
  timeUs: Microseconds;
  requests: Record<ID, RequestView>;
  engines: Record<ID, EngineView>;
  blocks: Record<ID, KvBlockView>;
  latestEventId: ID | null;
  eventCount: number;
}

export interface StateSnapshot {
  eventIndex: number;
  timeUs: Microseconds;
  state: SimViewState;
}

export interface SimulationResult {
  schemaVersion: '1.0';
  engineVersion: string;
  scenario: Scenario;
  plan: PlanResult;
  events: SimEvent[];
  metrics: Metric[];
  series: MetricSeries[];
  requests: RequestTrace[];
  snapshots: StateSnapshot[];
  /** MoE-only token routing summary (synthetic teaching model). */
  moe?: MoeRunSummary;
  /** Calibration scope actually applied to this run. */
  calibration?: CalibrationSummary;
  /**
   * Full view-state checkpoints (including KV blocks) used by the UI replay
   * index. Sparse by design; they are not part of the portable result schema.
   */
  replayCheckpoints?: StateSnapshot[];
  assumptionsUsed: Evidence[];
  limitations: string[];
  seed: number;
  endedAtUs: Microseconds;
  eventCount: number;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Runtime helpers                                                     */
/* ------------------------------------------------------------------ */

export interface RunOptions {
  maxEvents?: number;
  maxVirtualTimeUs?: number;
  snapshotEveryEvents?: number;
  replayCheckpointEveryEvents?: number;
  /** Optional structured benchmark curves; only matching scopes are used. */
  calibrationCurves?: CalibrationCurve[];
}

export interface EngineVersionInfo {
  engine: string;
  version: string;
  scheduler: string;
  costModel: string;
}

export const ENGINE_VERSION = '0.1.0';
export const ENGINE_NAME = 'inferencelab-core';
