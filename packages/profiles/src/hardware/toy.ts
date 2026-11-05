import type {
  Accelerator,
  ComputeResource,
  ContentionDomain,
  HardwareNode,
  HardwareProfile,
  Link,
  MemoryPool,
} from '@inferencelab/core';

const GIB = 1024 ** 3;
const GB = 1_000_000_000;

const TOY_EVIDENCE = {
  kind: 'assumed' as const,
  note: '合成教学 Profile；数值用于机制演示，不代表任何真实产品规格。',
};

function hbmPool(id: string, ownerId: string, capacityBytes = 80 * GB): MemoryPool {
  return {
    id,
    ownerId,
    kind: 'HBM',
    capacityBytes,
    externalReservedBytes: 2 * GB,
    alignmentBytes: 256,
    readBytesPerSecond: {
      value: 100 * GB,
      evidence: { ...TOY_EVIDENCE, note: '合成 HBM 读带宽 100 GB/s（教学值）。' },
    },
    writeBytesPerSecond: {
      value: 90 * GB,
      evidence: { ...TOY_EVIDENCE, note: '合成 HBM 写带宽 90 GB/s（教学值）。' },
    },
  };
}

function dramPool(id: string, ownerId: string, capacityBytes = 512 * GB): MemoryPool {
  return {
    id,
    ownerId,
    kind: 'DRAM',
    capacityBytes,
    externalReservedBytes: 16 * GB,
    alignmentBytes: 256,
    readBytesPerSecond: { value: 20 * GB, evidence: TOY_EVIDENCE },
    writeBytesPerSecond: { value: 20 * GB, evidence: TOY_EVIDENCE },
  };
}

function compute(id: string, tflops = 30): ComputeResource {
  return {
    id,
    kind: 'compute',
    assumedTflops: tflops,
    concurrency: 1,
    evidence: { ...TOY_EVIDENCE, note: `合成有效算力 ${tflops} TFLOP/s（教学值）。` },
  };
}

function node(id: string, gpuCount: number, options: { hbm?: number; dram?: number } = {}): {
  node: HardwareNode;
  accelerators: Accelerator[];
  pools: MemoryPool[];
  resources: ComputeResource[];
} {
  const pools: MemoryPool[] = [dramPool(`dram-${id}`, id, options.dram)];
  const resources: ComputeResource[] = [];
  const accelerators: Accelerator[] = [];
  for (let i = 0; i < gpuCount; i += 1) {
    const gpuId = `${id}-gpu-${i}`;
    pools.push(hbmPool(`hbm-${gpuId}`, gpuId, options.hbm));
    resources.push(compute(`compute-${gpuId}`));
    resources.push({ id: `dma-${gpuId}`, kind: 'dma', concurrency: 2, evidence: TOY_EVIDENCE });
    accelerators.push({
      id: gpuId,
      nodeId: id,
      vendor: 'toy',
      family: 'ToyAccelerator',
      hbmPoolId: `hbm-${gpuId}`,
      computeResourceId: `compute-${gpuId}`,
      dmaResourceIds: [`dma-${gpuId}`],
      label: `Toy GPU ${id}/${i}`,
    });
  }
  return {
    node: {
      id,
      cpuCores: 64,
      dramPoolId: `dram-${id}`,
      label: `Toy Node ${id}`,
    },
    accelerators,
    pools,
    resources,
  };
}

/**
 * Host DMA links used by CPU KV offload. The host endpoint is intentionally
 * not an Accelerator: it models the node's pinned-memory bridge.
 */
function hostLinks(nodeId: string, gpuCount: number): { links: Link[]; domain: ContentionDomain } {
  const links: Link[] = [];
  for (let i = 0; i < gpuCount; i += 1) {
    links.push({
      id: `pcie-${nodeId}-${i}`,
      fromId: `${nodeId}-gpu-${i}`,
      toId: `host-${nodeId}`,
      kind: 'PCIe',
      nominalBitsPerSecond: 200 * 1e9,
      effectiveRatio: 0.8,
      latencyUs: 10,
      duplex: 'full',
      contentionDomainId: `dom-host-${nodeId}`,
    });
  }
  return {
    links,
    domain: {
      id: `dom-host-${nodeId}`,
      capacityBitsPerSecond: 200 * 1e9,
      duplex: 'full',
      arbitration: 'serialized',
      provenance: TOY_EVIDENCE,
    },
  };
}

/** Four accelerators in one node, fully connected with a synthetic NVLink-like fabric. */
export function createToy4Hardware(): HardwareProfile {
  const n = node('node-0', 4);
  const links: Link[] = [];
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      links.push({
        id: `nvl-0-${i}-${j}`,
        fromId: `node-0-gpu-${i}`,
        toId: `node-0-gpu-${j}`,
        kind: 'NVLINK',
        nominalBitsPerSecond: 7_200 * 1e9,
        effectiveRatio: 0.8,
        latencyUs: 2,
        duplex: 'full',
        contentionDomainId: 'dom-nvl-node-0',
      });
    }
  }
  const host = hostLinks('node-0', 4);
  links.push(...host.links);
  const domains: ContentionDomain[] = [
    {
      id: 'dom-nvl-node-0',
      capacityBitsPerSecond: 7_200 * 1e9,
      duplex: 'full',
      arbitration: 'serialized',
      provenance: TOY_EVIDENCE,
    },
    host.domain,
  ];
  return {
    id: 'hw-toy-4gpu',
    version: '1.0.0',
    profileType: 'synthetic-toy',
    provenance: TOY_EVIDENCE,
    nodes: [n.node],
    accelerators: n.accelerators,
    memoryPools: n.pools,
    links,
    contentionDomains: domains,
    resources: n.resources,
  };
}

/**
 * 32 accelerators in 2 nodes (16 each). Intra-node is full-mesh NVLink-like;
 * inter-node goes through a shared fabric so PD transfers are visibly constrained.
 */
export function createToy32Hardware(): HardwareProfile {
  const nodes: HardwareNode[] = [];
  const accelerators: Accelerator[] = [];
  const pools: MemoryPool[] = [];
  const resources: ComputeResource[] = [];
  const links: Link[] = [];
  const domains: ContentionDomain[] = [];
  for (let n = 0; n < 2; n += 1) {
    const created = node(`node-${n}`, 16);
    nodes.push(created.node);
    accelerators.push(...created.accelerators);
    pools.push(...created.pools);
    resources.push(...created.resources);
    domains.push({
      id: `dom-nvl-node-${n}`,
      capacityBitsPerSecond: 7_200 * 1e9,
      duplex: 'full',
      arbitration: 'serialized',
      provenance: TOY_EVIDENCE,
    });
    for (let i = 0; i < 16; i += 1) {
      for (let j = i + 1; j < 16; j += 1) {
        links.push({
          id: `nvl-${n}-${i}-${j}`,
          fromId: `node-${n}-gpu-${i}`,
          toId: `node-${n}-gpu-${j}`,
          kind: 'NVLINK',
          nominalBitsPerSecond: 7_200 * 1e9,
          effectiveRatio: 0.8,
          latencyUs: 2,
          duplex: 'full',
          contentionDomainId: `dom-nvl-node-${n}`,
        });
      }
    }
    for (let i = 0; i < 16; i += 1) {
      links.push({
        id: `nic-${n}-${i}`,
        fromId: `node-${n}-gpu-${i}`,
        toId: 'fabric-0',
        kind: 'NIC',
        nominalBitsPerSecond: 400 * 1e9,
        effectiveRatio: 0.75,
        latencyUs: 20,
        duplex: 'full',
        contentionDomainId: 'dom-fabric-0',
      });
    }
    const host = hostLinks(`node-${n}`, 16);
    links.push(...host.links);
    domains.push(host.domain);
  }
  domains.push({
    id: 'dom-fabric-0',
    capacityBitsPerSecond: 400 * 1e9,
    duplex: 'full',
    arbitration: 'serialized',
    provenance: TOY_EVIDENCE,
  });
  return {
    id: 'hw-toy-32gpu',
    version: '1.0.0',
    profileType: 'synthetic-toy',
    provenance: TOY_EVIDENCE,
    nodes,
    accelerators,
    memoryPools: pools,
    links,
    contentionDomains: domains,
    resources,
  };
}

/**
 * Structural Ascend A3 / GLM-5.3 template. Compute and HBM bandwidth are
 * intentionally unknown so the UI must show "unknown" instead of inventing
 * timing numbers.
 */
export function createAscendA3Template(): HardwareProfile {
  const nodes: HardwareNode[] = [];
  const accelerators: Accelerator[] = [];
  const pools: MemoryPool[] = [];
  const resources: ComputeResource[] = [];
  const links: Link[] = [];
  for (let n = 0; n < 8; n += 1) {
    const nodeId = `a3-node-${n}`;
    nodes.push({ id: nodeId, cpuCores: 192, dramPoolId: `dram-${nodeId}`, label: `A3 Node ${n}` });
    pools.push({
      id: `dram-${nodeId}`,
      ownerId: nodeId,
      kind: 'DRAM',
      capacityBytes: 2 * 1024 * GIB,
      externalReservedBytes: 64 * GB,
      alignmentBytes: 256,
      readBytesPerSecond: { value: null, evidence: { kind: 'unknown', note: '模板未提供主机内存带宽。' } },
      writeBytesPerSecond: { value: null, evidence: { kind: 'unknown', note: '模板未提供主机内存带宽。' } },
    });
    for (let i = 0; i < 8; i += 1) {
      const gpuId = `${nodeId}-npu-${i}`;
      pools.push({
        id: `hbm-${gpuId}`,
        ownerId: gpuId,
        kind: 'HBM',
        capacityBytes: 128 * GB,
        externalReservedBytes: 8 * GB,
        alignmentBytes: 512,
        readBytesPerSecond: { value: null, evidence: { kind: 'unknown', note: '模板未提供 HBM 带宽。' } },
        writeBytesPerSecond: { value: null, evidence: { kind: 'unknown', note: '模板未提供 HBM 带宽。' } },
      });
      resources.push({
        id: `compute-${gpuId}`,
        kind: 'compute',
        assumedTflops: undefined,
        concurrency: 1,
        evidence: { kind: 'unknown', note: '模板未提供算力。' },
      });
      resources.push({ id: `dma-${gpuId}`, kind: 'dma', concurrency: 2 });
      accelerators.push({
        id: gpuId,
        nodeId,
        vendor: 'ascend',
        family: 'A3-template',
        hbmPoolId: `hbm-${gpuId}`,
        computeResourceId: `compute-${gpuId}`,
        dmaResourceIds: [`dma-${gpuId}`],
        label: `A3 NPU ${n}/${i}`,
      });
      if (i > 0) {
        links.push({
          id: `hccs-${n}-${i - 1}-${i}`,
          fromId: `${nodeId}-npu-${i - 1}`,
          toId: gpuId,
          kind: 'HCCS',
          nominalBitsPerSecond: 392 * 1e9,
          effectiveRatio: 0.8,
          latencyUs: 2,
          duplex: 'full',
          contentionDomainId: `dom-hccs-${n}`,
        });
      }
      links.push({
        id: `roce-${n}-${i}`,
        fromId: gpuId,
        toId: 'a3-fabric',
        kind: 'FABRIC',
        nominalBitsPerSecond: 400 * 1e9,
        effectiveRatio: 0.7,
        latencyUs: 25,
        duplex: 'full',
        contentionDomainId: 'dom-a3-fabric',
      });
    }
  }
  return {
    id: 'hw-ascend-a3-template',
    version: '0.1.0-template',
    profileType: 'hardware-vendor-spec',
    provenance: {
      kind: 'unknown',
      note: '结构模板：仅提供节点/设备/链路结构，算力与带宽未校准，禁止用于容量或性能结论。',
    },
    nodes,
    accelerators,
    memoryPools: pools,
    links,
    contentionDomains: [
      ...Array.from({ length: 8 }, (_, n) => ({
        id: `dom-hccs-${n}`,
        capacityBitsPerSecond: 392 * 1e9,
        duplex: 'full' as const,
        arbitration: 'serialized' as const,
      })),
      { id: 'dom-a3-fabric', capacityBitsPerSecond: 400 * 1e9, duplex: 'full', arbitration: 'serialized' },
    ],
    resources,
  };
}
