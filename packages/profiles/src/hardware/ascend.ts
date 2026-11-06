import type {
  Accelerator,
  ComputeResource,
  ContentionDomain,
  Evidence,
  HardwareNode,
  HardwareProfile,
  Link,
  MemoryPool,
} from '@inferencelab/core';

const GB = 1_000_000_000;
const GIB = 1024 ** 3;
const HOST_LINK_BPS = 64 * GB * 8;
const LINK_EFFICIENCY = 0.8;
const HOST_LATENCY_US = 10;

const A3_SOURCE = 'https://e.huawei.com/cn/products/computing/ascend/atlas-900-a3-superpod';
const A5_SOURCE = 'https://news.mydrivers.com/1/1128/1128973.htm';

/**
 * The public A3 page lists 384 NPUs, 128 GB HBM and 3.2 TB/s per NPU, plus
 * 307.2 PFLOPS FP16 for the full 384-NPU supernode (800 TFLOPS per NPU).
 * Effective link efficiency and single-hop latency are simulation assumptions.
 */
const A3_PROVENANCE: Evidence = {
  kind: 'derived',
  sourceUrl: A3_SOURCE,
  sourceTag: 'Huawei Atlas 900 A3 SuperPoD public product page',
  version: 'retrieved 2026-11-06',
  note: '384 × Ascend 910C，48 节点 × 8 NPU；HBM 128 GB、3.2 TB/s 为厂商页面规格。800 TFLOPS FP16 由整机 307.2 PFLOPS ÷ 384 推导。链路效率 0.8、1 µs UB 延迟与主机 PCIe 64 GB/s 为仿真假设。',
};

/**
 * Public 950DT reporting states 144 GB HiZQ 2.0 HBM, 4 TB/s HBM bandwidth,
 * 2 TB/s bidirectional UnifiedBus and 1 PFLOPS FP8. This profile models one
 * 64-NPU rack; the 8192-card Atlas 950 SuperPoD is out of scope.
 */
const A5_PROVENANCE: Evidence = {
  kind: 'derived',
  sourceUrl: A5_SOURCE,
  sourceTag: 'Ascend 950 whitepaper reporting (secondary public source)',
  version: 'retrieved 2026-11-06',
  note: 'Ascend 950DT 单机柜 64 卡：144 GB HBM、4 TB/s、2 TB/s 双向 UnifiedBus、1 PFLOPS FP8。厂商白皮书经公开报道转述，非一手 PDF；链路效率 0.8、主机 PCIe 64 GB/s 为仿真假设。8192 卡 SuperPoD 不在本 Profile 内。',
};

interface AscendHardwareSpec {
  id: string;
  label: string;
  version: string;
  prefix: string;
  family: string;
  nodeCount: number;
  hbmBytes: number;
  hbmBytesPerSecond: number;
  tflops: number;
  ubBytesPerSecondPerDirection: number;
  ubLatencyUs: number;
  provenance: Evidence;
  specNote: string;
  latencyNote: string;
}

function buildHardware(spec: AscendHardwareSpec): HardwareProfile {
  const nodes: HardwareNode[] = [];
  const accelerators: Accelerator[] = [];
  const memoryPools: MemoryPool[] = [];
  const resources: ComputeResource[] = [];
  const links: Link[] = [];
  const contentionDomains: ContentionDomain[] = [];
  const fabricId = `${spec.prefix}-ub-fabric`;

  const hbmEvidence: Evidence = {
    ...spec.provenance,
    note: `${spec.specNote} HBM 读写共享该峰值口径；仿真成本只使用读带宽。`,
  };
  const computeEvidence: Evidence = {
    ...spec.provenance,
    note: `${spec.specNote} 单峰值算力；当前成本模型不区分 FP16/FP8/FP4。`,
  };
  const assumedNode: Evidence = {
    kind: 'assumed',
    note: '节点 CPU/DRAM 与主机 PCIe 带宽未在公开规格中逐项确认，使用保守仿真假设。',
  };
  const ubDomainEvidence: Evidence = {
    kind: 'assumed',
    sourceUrl: spec.provenance.sourceUrl,
    sourceTag: spec.provenance.sourceTag,
    note: `每条 NPU 上行链路独立竞争域，表达非阻塞 UB；${spec.latencyNote} 有效效率 ${LINK_EFFICIENCY} 为仿真假设。`,
  };

  for (let n = 0; n < spec.nodeCount; n += 1) {
    const nodeId = `${spec.prefix}-node-${n}`;
    const nodeLabel = `${spec.family} Node ${String(n + 1).padStart(2, '0')}`;
    nodes.push({
      id: nodeId,
      cpuCores: 192,
      dramPoolId: `dram-${nodeId}`,
      label: nodeLabel,
    });
    memoryPools.push({
      id: `dram-${nodeId}`,
      ownerId: nodeId,
      kind: 'DRAM',
      capacityBytes: 2 * 1024 * GIB,
      externalReservedBytes: 64 * GB,
      alignmentBytes: 256,
      readBytesPerSecond: { value: 20 * GB, evidence: assumedNode },
      writeBytesPerSecond: { value: 20 * GB, evidence: assumedNode },
    });

    for (let i = 0; i < 8; i += 1) {
      const npuId = `${nodeId}-npu-${i}`;
      memoryPools.push({
        id: `hbm-${npuId}`,
        ownerId: npuId,
        kind: 'HBM',
        capacityBytes: spec.hbmBytes,
        externalReservedBytes: 8 * GB,
        alignmentBytes: 512,
        readBytesPerSecond: { value: spec.hbmBytesPerSecond, evidence: hbmEvidence },
        writeBytesPerSecond: { value: spec.hbmBytesPerSecond, evidence: hbmEvidence },
      });
      resources.push({
        id: `compute-${npuId}`,
        kind: 'compute',
        assumedTflops: spec.tflops,
        concurrency: 1,
        evidence: computeEvidence,
      });
      resources.push({
        id: `dma-${npuId}`,
        kind: 'dma',
        concurrency: 2,
        evidence: assumedNode,
      });
      accelerators.push({
        id: npuId,
        nodeId,
        vendor: 'ascend',
        family: spec.family,
        hbmPoolId: `hbm-${npuId}`,
        computeResourceId: `compute-${npuId}`,
        dmaResourceIds: [`dma-${npuId}`],
        label: `${spec.family} NPU ${String(n + 1).padStart(2, '0')}/${i}`,
      });

      // One direct uplink per NPU. The pseudo fabric is not a HardwareNode:
      // it only lets BFS compose two NPU uplinks into one transfer path.
      const ubDomainId = `dom-ub-${npuId}`;
      links.push({
        id: `ub-${npuId}`,
        fromId: npuId,
        toId: fabricId,
        kind: 'UB',
        nominalBitsPerSecond: spec.ubBytesPerSecondPerDirection * 8,
        effectiveRatio: LINK_EFFICIENCY,
        latencyUs: spec.ubLatencyUs,
        duplex: 'full',
        contentionDomainId: ubDomainId,
      });
      contentionDomains.push({
        id: ubDomainId,
        capacityBitsPerSecond: spec.ubBytesPerSecondPerDirection * 8,
        duplex: 'full',
        arbitration: 'serialized',
        provenance: ubDomainEvidence,
      });

      // Host path is used by CPU KV offload. Giving each NPU its own domain
      // avoids turning eight independent PCIe links into one serial queue.
      const hostDomainId = `dom-host-${npuId}`;
      links.push({
        id: `pcie-${npuId}`,
        fromId: npuId,
        toId: `host-${nodeId}`,
        kind: 'PCIe',
        nominalBitsPerSecond: HOST_LINK_BPS,
        effectiveRatio: LINK_EFFICIENCY,
        latencyUs: HOST_LATENCY_US,
        duplex: 'full',
        contentionDomainId: hostDomainId,
      });
      contentionDomains.push({
        id: hostDomainId,
        capacityBitsPerSecond: HOST_LINK_BPS,
        duplex: 'full',
        arbitration: 'serialized',
        provenance: assumedNode,
      });
    }
  }

  return {
    id: spec.id,
    label: spec.label,
    version: spec.version,
    profileType: 'hardware-vendor-spec',
    provenance: spec.provenance,
    nodes,
    accelerators,
    memoryPools,
    links,
    contentionDomains,
    resources,
  };
}

/** Atlas 900 A3 SuperPoD: 48 compute nodes × 8 Ascend 910C = 384 NPUs. */
export function createAscend910C384Hardware(): HardwareProfile {
  return buildHardware({
    id: 'hw-ascend-910c-a3-384',
    label: 'Ascend A3 · 910C × 384',
    version: 'vendor-spec/2026-11-06',
    prefix: 'a3',
    family: 'Ascend 910C',
    nodeCount: 48,
    hbmBytes: 128 * GB,
    hbmBytesPerSecond: 3.2e12,
    tflops: 800,
    ubBytesPerSecondPerDirection: 392 * GB,
    ubLatencyUs: 1,
    provenance: A3_PROVENANCE,
    specNote: '384 卡 Atlas 900 A3 SuperPoD 的公开峰值。',
    latencyNote: 'UB 单跳 1 µs 是假设值，不是厂商实测。',
  });
}

/** Ascend 950DT: one 64-NPU rack (8 nodes × 8 NPU). */
export function createAscend950DT64Hardware(): HardwareProfile {
  return buildHardware({
    id: 'hw-ascend-950dt-rack-64',
    label: 'Ascend 950DT · 64-NPU rack',
    version: 'vendor-spec/2026-11-06',
    prefix: 'a5',
    family: 'Ascend 950DT',
    nodeCount: 8,
    hbmBytes: 144 * GB,
    hbmBytesPerSecond: 4e12,
    tflops: 1000,
    ubBytesPerSecondPerDirection: 1e12,
    ubLatencyUs: 0.2,
    provenance: A5_PROVENANCE,
    specNote: '950DT 单机柜 64 卡的公开规格。',
    latencyNote: 'UB 单跳 0.2 µs 来自公开资料约 200 ns 的口径。',
  });
}
