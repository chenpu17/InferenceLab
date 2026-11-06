import type { FrameworkProfile } from '@inferencelab/core';

/**
 * Conservative teaching matrix for Ascend. It is deliberately not pinned to a
 * CANN or vLLM-Ascend release: real deployments must re-check the exact
 * framework version and operator coverage before trusting a capability flag.
 */
export function createAscendFrameworkProfile(): FrameworkProfile {
  return {
    id: 'fw-ascend-vllm-teaching',
    framework: 'Ascend vLLM teaching adapter',
    versionTagOrCommit: 'vllm-ascend-teaching/0.1.0',
    provenance: {
      kind: 'assumed',
      sourceUrl: 'https://docs.vllm.ai/projects/ascend/en/latest/',
      sourceTag: 'vLLM-Ascend documentation',
      version: 'teaching matrix retrieved 2026-11-06',
      note: '教学用 Ascend 能力矩阵，不是 CANN/vLLM-Ascend 某发行版的等价声明；PD/EP/MLA/MTP 仅按 partial 处理，CPU Offload 等未充分核实的路径保持 unknown。',
    },
    supportedFeatures: {
      chunked_prefill: 'supported',
      prefix_caching: 'supported',
      preemption_recompute: 'supported',
      scheduler_v1_subset: 'supported',
      pd_disaggregation: 'partial',
      expert_parallel: 'partial',
      mla: 'partial',
      speculative_decoding: 'partial',
      mtp: 'partial',
      layerwise_kv_transfer: 'partial',
      host_staging_kv_transfer: 'partial',
      cpu_offload: 'unknown',
      pipeline_parallel: 'unknown',
      sequence_parallel: 'unknown',
      context_parallel: 'unknown',
      sparse_attention: 'unknown',
      dspark: 'unknown',
    },
    parameterMappings: {
      tensor_parallel_size: 'deployment.logicalParallelism.tp',
      data_parallel_size: 'deployment.logicalParallelism.dp',
      expert_parallel_size: 'deployment.logicalParallelism.ep',
      max_num_seqs: 'runtime.maxNumSeqs',
      max_num_batched_tokens: 'runtime.maxNumBatchedTokens',
      block_size: 'runtime.blockSize',
      enable_chunked_prefill: 'runtime.enableChunkedPrefill',
      enable_prefix_caching: 'runtime.enablePrefixCaching',
      gpu_memory_utilization: 'runtime.gpuMemoryUtilization',
      kv_cache_memory_bytes: 'runtime.kvCacheMemoryBytes',
      preemption_mode: 'runtime.preemptionPolicy',
      kv_transfer_strategy: 'deployment.kvTransfer.strategy',
      speculative_method: 'runtime.speculative.method',
    },
    sourceUrls: [
      'https://docs.vllm.ai/projects/ascend/en/latest/',
      'https://www.hiascend.com/document',
    ],
  };
}
