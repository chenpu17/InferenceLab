import type {
  Accelerator,
  FrameworkProfile,
  HardwareProfile,
  MemoryPool,
  ModelProfile,
  Scenario,
  WorkloadConfig,
} from '../src/index.js';

const GB = 1_000_000_000;
const MB = 1_000_000;

export function testHardware(options: { hbmCapacity?: number; kvHint?: number } = {}): HardwareProfile {
  const capacity = options.hbmCapacity ?? 2 * GB;
  const pools: MemoryPool[] = [
    {
      id: 'dram-node-0',
      ownerId: 'node-0',
      kind: 'DRAM',
      capacityBytes: 64 * GB,
      externalReservedBytes: 0,
      alignmentBytes: 256,
      readBytesPerSecond: { value: 20 * GB, evidence: { kind: 'assumed' } },
      writeBytesPerSecond: { value: 20 * GB, evidence: { kind: 'assumed' } },
    },
  ];
  const accelerators: Accelerator[] = [];
  for (let i = 0; i < 4; i += 1) {
    pools.push({
      id: `hbm-${i}`,
      ownerId: `gpu-${i}`,
      kind: 'HBM',
      capacityBytes: capacity,
      externalReservedBytes: 0,
      alignmentBytes: 256,
      readBytesPerSecond: { value: 100 * GB, evidence: { kind: 'assumed' } },
      writeBytesPerSecond: { value: 100 * GB, evidence: { kind: 'assumed' } },
    });
    accelerators.push({
      id: `gpu-${i}`,
      nodeId: 'node-0',
      vendor: 'toy',
      family: 'test',
      hbmPoolId: `hbm-${i}`,
      computeResourceId: `compute-${i}`,
      dmaResourceIds: [],
    });
  }
  const resources = Array.from({ length: 4 }, (_, i) => ({
    id: `compute-${i}`,
    kind: 'compute',
    assumedTflops: 30,
  }));
  return {
    id: 'hw-test',
    version: '1',
    profileType: 'synthetic-toy',
    provenance: { kind: 'assumed' },
    nodes: [{ id: 'node-0', cpuCores: 8, dramPoolId: 'dram-node-0' }],
    accelerators,
    memoryPools: pools,
    links: [
      {
        id: 'link-0-1',
        fromId: 'gpu-0',
        toId: 'gpu-1',
        kind: 'NVLINK',
        nominalBitsPerSecond: 900 * 1e9,
        effectiveRatio: 0.8,
        latencyUs: 2,
        duplex: 'full',
        contentionDomainId: 'dom-0',
      },
      {
        id: 'link-1-2',
        fromId: 'gpu-1',
        toId: 'gpu-2',
        kind: 'NVLINK',
        nominalBitsPerSecond: 900 * 1e9,
        effectiveRatio: 0.8,
        latencyUs: 2,
        duplex: 'full',
        contentionDomainId: 'dom-0',
      },
      {
        id: 'link-2-3',
        fromId: 'gpu-2',
        toId: 'gpu-3',
        kind: 'NVLINK',
        nominalBitsPerSecond: 900 * 1e9,
        effectiveRatio: 0.8,
        latencyUs: 2,
        duplex: 'full',
        contentionDomainId: 'dom-0',
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `pcie-${i}`,
        fromId: `gpu-${i}`,
        toId: 'host-node-0',
        kind: 'PCIe' as const,
        nominalBitsPerSecond: 200 * 1e9,
        effectiveRatio: 0.8,
        latencyUs: 10,
        duplex: 'full' as const,
        contentionDomainId: 'dom-host-0',
      })),
    ],
    contentionDomains: [
      { id: 'dom-0', capacityBitsPerSecond: 900 * 1e9, duplex: 'full', arbitration: 'serialized' },
      { id: 'dom-host-0', capacityBitsPerSecond: 200 * 1e9, duplex: 'full', arbitration: 'serialized' },
    ],
    resources,
  };
}

export function testModel(options: { layers?: number; weightBytes?: number } = {}): ModelProfile {
  const layers = options.layers ?? 2;
  const weightBytes = options.weightBytes ?? 1 * GB;
  return {
    id: 'model-test',
    revision: '1',
    profileType: 'synthetic-toy',
    provenance: { kind: 'assumed' },
    architectureFamily: 'test',
    numLayers: layers,
    hiddenSize: 128,
    vocabSize: 1024,
    attentionLayers: Array.from({ length: layers }, (_, layerIndex) => ({
      layerIndex,
      kind: 'GQA',
      nQueryHeads: 4,
      nKVHeads: 4,
      headDim: 32,
      kDtypeBytes: 2,
      vDtypeBytes: 2,
      kvLayout: 'head-sharded-tp',
    })),
    tensorInventory: [{ id: 'weights', logicalBytes: weightBytes, rule: 'shard-tp', alignBytes: 256 }],
    runtimeAssumptions: {
      runtimeBytesPerRank: 10 * MB,
      workspacePeakBytesPerRank: 10 * MB,
      graphCaptureBytesPerRank: 10 * MB,
      communicationBufferBytesPerRank: 10 * MB,
    },
    latencyAssumptions: { model: 'test', assumed: true, decodeLaunchOverheadUs: 10 },
    sourceUrls: [],
  };
}

export function testFramework(): FrameworkProfile {
  return {
    id: 'fw-test',
    framework: 'test',
    versionTagOrCommit: '1',
    provenance: { kind: 'assumed' },
    supportedFeatures: {
      scheduler_v1_subset: 'supported',
      chunked_prefill: 'supported',
      prefix_caching: 'supported',
      preemption_recompute: 'supported',
    },
    parameterMappings: {},
    sourceUrls: [],
  };
}

export function testScenario(
  workload: WorkloadConfig,
  options: {
    blockSize?: number;
    maxNumBatchedTokens?: number;
    maxNumSeqs?: number;
    kvCacheMemoryBytes?: number;
    maxModelLen?: number;
    enablePrefixCaching?: boolean;
    enableChunkedPrefill?: boolean;
    preemptionPolicy?: 'recompute' | 'none';
    enableCpuOffload?: boolean;
    hostCacheBytes?: number;
    tp?: number;
    dp?: number;
    seed?: number;
  } = {},
): Scenario {
  const tp = options.tp ?? 4;
  const dp = options.dp ?? 1;
  const engines = [];
  const ranks = [];
  for (let replica = 0; replica < dp; replica += 1) {
    const rankIds: string[] = [];
    for (let i = 0; i < tp; i += 1) {
      const rankId = `r${replica * tp + i}`;
      rankIds.push(rankId);
      ranks.push({
        rankId,
        engineId: `engine-${replica}`,
        acceleratorId: `gpu-${replica * tp + i}`,
        dpReplicaId: `dp-${replica}`,
        tpGroupId: `tp-${replica}`,
      });
    }
    engines.push({
      id: `engine-${replica}`,
      role: 'mixed' as const,
      rankIds,
      schedulerId: `sched-${replica}`,
      cacheManagerId: `cache-${replica}`,
    });
  }
  return {
    schemaVersion: '1.0',
    id: 'scenario-test',
    title: 'Test',
    seed: options.seed ?? 1,
    accuracyTier: 'discrete-event',
    hardwareProfileId: 'hw-test',
    modelProfileId: 'model-test',
    frameworkProfileId: 'fw-test',
    deployment: {
      engines,
      placement: { ranks },
      logicalParallelism: { tp, dp },
      routing: { kind: 'round-robin' },
    },
    runtime: {
      maxModelLen: options.maxModelLen ?? 4096,
      maxNumSeqs: options.maxNumSeqs ?? 8,
      maxNumBatchedTokens: options.maxNumBatchedTokens ?? 256,
      blockSize: options.blockSize ?? 4,
      enableChunkedPrefill: options.enableChunkedPrefill ?? true,
      enablePrefixCaching: options.enablePrefixCaching ?? false,
      gpuMemoryUtilization: 0.9,
      kvCacheMemoryBytes: options.kvCacheMemoryBytes ?? 2 * MB,
      preemptionPolicy: options.preemptionPolicy ?? 'recompute',
      ...(options.enableCpuOffload ? { enableCpuOffload: true } : {}),
      ...(options.hostCacheBytes !== undefined ? { hostCacheBytes: options.hostCacheBytes } : {}),
    },
    workload,
    assumptions: { allowSyntheticTiming: true },
  };
}

/** Two prefill GPUs + two decode GPUs with an explicit PD transfer strategy. */
export function pdTestScenario(
  workload: WorkloadConfig,
  options: {
    blockSize?: number;
    maxNumBatchedTokens?: number;
    maxNumSeqs?: number;
    kvCacheMemoryBytes?: number;
    maxModelLen?: number;
    enablePrefixCaching?: boolean;
    enableChunkedPrefill?: boolean;
    strategy?: 'PD_PULL' | 'PD_LAYERWISE_PUSH' | 'PD_HOST_STAGING';
  } = {},
): Scenario {
  const ranks: Scenario['deployment']['placement']['ranks'] = [
    { rankId: 'p-r0', engineId: 'p-engine-0', acceleratorId: 'gpu-0', dpReplicaId: 'p-dp-0', tpGroupId: 'p-tp-0' },
    { rankId: 'p-r1', engineId: 'p-engine-0', acceleratorId: 'gpu-1', dpReplicaId: 'p-dp-0', tpGroupId: 'p-tp-0' },
    { rankId: 'd-r0', engineId: 'd-engine-0', acceleratorId: 'gpu-2', dpReplicaId: 'd-dp-0', tpGroupId: 'd-tp-0' },
    { rankId: 'd-r1', engineId: 'd-engine-0', acceleratorId: 'gpu-3', dpReplicaId: 'd-dp-0', tpGroupId: 'd-tp-0' },
  ];
  return {
    schemaVersion: '1.0',
    id: 'scenario-pd-test',
    title: 'PD Test',
    seed: 1,
    accuracyTier: 'discrete-event',
    hardwareProfileId: 'hw-test',
    modelProfileId: 'model-test',
    frameworkProfileId: 'fw-test',
    deployment: {
      engines: [
        {
          id: 'p-engine-0',
          role: 'prefill',
          rankIds: ['p-r0', 'p-r1'],
          schedulerId: 'p-sched-0',
          cacheManagerId: 'p-cache-0',
        },
        {
          id: 'd-engine-0',
          role: 'decode',
          rankIds: ['d-r0', 'd-r1'],
          schedulerId: 'd-sched-0',
          cacheManagerId: 'd-cache-0',
        },
      ],
      placement: { ranks },
      logicalParallelism: { prefillTp: 2, prefillDp: 1, decodeTp: 2, decodeDp: 1 },
      routing: { kind: 'round-robin' },
      kvTransfer: { strategy: options.strategy ?? 'PD_PULL' },
    },
    runtime: {
      maxModelLen: options.maxModelLen ?? 4096,
      maxNumSeqs: options.maxNumSeqs ?? 8,
      maxNumBatchedTokens: options.maxNumBatchedTokens ?? 256,
      blockSize: options.blockSize ?? 4,
      enableChunkedPrefill: options.enableChunkedPrefill ?? true,
      enablePrefixCaching: options.enablePrefixCaching ?? false,
      gpuMemoryUtilization: 0.9,
      kvCacheMemoryBytes: options.kvCacheMemoryBytes ?? 2 * MB,
      preemptionPolicy: 'recompute',
    },
    workload,
    assumptions: { allowSyntheticTiming: true },
  };
}
