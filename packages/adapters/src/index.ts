export * from './trace.js';

import type { FeatureSupport } from '@inferencelab/core';

export interface FeatureMatrixRow {
  key: string;
  label: string;
  support: FeatureSupport;
  milestone: 'M2' | 'M3' | 'M4' | 'M5';
  note: string;
}

/**
 * The UI shows this matrix next to toggles. Unsupported or unknown features
 * are never silently simulated as if they were implemented.
 */
export const teachingFeatureMatrix: FeatureMatrixRow[] = [
  {
    key: 'chunked_prefill',
    label: 'Chunked Prefill',
    support: 'supported',
    milestone: 'M2',
    note: '按 token 预算切分 Prefill；调度顺序可解释。',
  },
  {
    key: 'prefix_caching',
    label: 'Prefix Caching',
    support: 'supported',
    milestone: 'M2',
    note: '连续完整 Block 前缀匹配，部分命中不跨空洞复用。',
  },
  {
    key: 'preemption_recompute',
    label: '抢占 / 重算',
    support: 'supported',
    milestone: 'M2',
    note: 'KV 不足时释放最低优先级请求并重算；不实现 Swap 模式。',
  },
  {
    key: 'pd_disaggregation',
    label: 'PD 分离',
    support: 'supported',
    milestone: 'M3',
    note: 'Prefill Engine 完成后显式传输 KV 到 Decode Engine。',
  },
  {
    key: 'cpu_offload',
    label: 'CPU KV Offload',
    support: 'partial',
    milestone: 'M3',
    note: '仅建模完整 Block 的主机驻留/回迁；不做逐层流水。',
  },
  {
    key: 'expert_parallel',
    label: 'Expert Parallel',
    support: 'partial',
    milestone: 'M4',
    note: '结构/容量层面按专家分片；不模拟 All-to-All 延迟细节。',
  },
  {
    key: 'context_parallel',
    label: 'Context Parallel',
    support: 'partial',
    milestone: 'M4',
    note: 'DCP 复用 TP Rank；PCP 在显式放置中增加 Rank。仅结构/容量，不模拟逐层流水。',
  },
  {
    key: 'layerwise_kv_transfer',
    label: '逐层 KV 传输',
    support: 'unsupported',
    milestone: 'M5',
    note: '当前只支持整段 KV 传输。',
  },
];

export interface ParameterMetadata {
  key: string;
  label: string;
  group: 'scheduler' | 'cache' | 'memory' | 'parallelism' | 'workload';
  type: 'int' | 'float' | 'boolean' | 'enum' | 'tokens';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  description: string;
  affects: string[];
}

export const parameterMetadata: ParameterMetadata[] = [
  {
    key: 'maxNumBatchedTokens',
    label: 'Token 预算',
    group: 'scheduler',
    type: 'int',
    min: 1,
    max: 262144,
    step: 1,
    unit: 'tokens',
    description: '一次调度迭代可处理的 Prefill + Decode Token 上限（vLLM max_num_batched_tokens 子集）。',
    affects: ['TTFT', '吞吐', 'Chunked Prefill 粒度'],
  },
  {
    key: 'maxNumSeqs',
    label: '并发序列上限',
    group: 'scheduler',
    type: 'int',
    min: 1,
    max: 4096,
    step: 1,
    unit: 'seqs',
    description: '一次迭代可同时调度的请求数上限。',
    affects: ['批大小', '排队', 'KV 峰值'],
  },
  {
    key: 'blockSize',
    label: 'KV Block 大小',
    group: 'cache',
    type: 'int',
    min: 1,
    max: 256,
    step: 1,
    unit: 'tokens',
    description: 'KV Cache 的逻辑块大小；影响内部碎片与 Prefix 匹配粒度。',
    affects: ['KV 池块数', '前缀命中粒度', '内存碎片'],
  },
  {
    key: 'enableChunkedPrefill',
    label: 'Chunked Prefill',
    group: 'scheduler',
    type: 'boolean',
    description: '允许长 Prompt 跨多个调度迭代分块计算。',
    affects: ['TTFT', 'Decode 干扰'],
  },
  {
    key: 'enablePrefixCaching',
    label: 'Prefix Caching',
    group: 'cache',
    type: 'boolean',
    description: '保留已计算完整块的哈希，供后续请求连续前缀复用。',
    affects: ['Prefill 计算量', 'KV 占用'],
  },
  {
    key: 'gpuMemoryUtilization',
    label: 'GPU 显存利用率',
    group: 'memory',
    type: 'float',
    min: 0.1,
    max: 1,
    step: 0.01,
    description: 'HBM 预算 = 容量 × 利用率 - 外部预留。',
    affects: ['KV 池容量', '可行性'],
  },
  {
    key: 'kvCacheMemoryBytes',
    label: '显式 KV 预算',
    group: 'memory',
    type: 'int',
    min: 0,
    unit: 'bytes',
    description: '可选覆盖：显式限制 KV Pool 字节数，超过预算时按预算上限处理。',
    affects: ['KV 池块数', '抢占概率'],
  },
  {
    key: 'preemptionPolicy',
    label: '抢占策略',
    group: 'scheduler',
    type: 'enum',
    description: 'recompute 会释放受害者 KV 并重算；none 表示 KV 不足时拒绝/等待。',
    affects: ['尾延迟', '重算 Token 数'],
  },
  {
    key: 'tp',
    label: 'TP',
    group: 'parallelism',
    type: 'int',
    min: 1,
    max: 64,
    description: 'Tensor Parallel 组大小；来自显式 Device→Rank 放置，不做乘法推断。',
    affects: ['每卡权重', 'KV 头分片', '通信开销'],
  },
  {
    key: 'dp',
    label: 'DP',
    group: 'parallelism',
    type: 'int',
    min: 1,
    max: 64,
    description: '数据并行副本数；每个副本有独立 Engine 与 KV Pool。',
    affects: ['路由', '总吞吐', '设备数'],
  },
  {
    key: 'ep',
    label: 'EP',
    group: 'parallelism',
    type: 'int',
    min: 1,
    max: 64,
    description: '专家并行组大小；仅在 MoE 模型下生效。',
    affects: ['每卡专家权重', '专家通信（未细化）'],
  },
];

export function featureSupportFor(key: string): FeatureSupport {
  return teachingFeatureMatrix.find((row) => row.key === key)?.support ?? 'unknown';
}
