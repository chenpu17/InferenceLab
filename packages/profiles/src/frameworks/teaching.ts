import type { FrameworkProfile } from '@inferencelab/core';

/** The teaching adapter intentionally declares only a documented subset. */
export function createTeachingFrameworkProfile(): FrameworkProfile {
  return {
    id: 'fw-teaching-vllm-subset',
    framework: 'Teaching vLLM V1 subset',
    versionTagOrCommit: 'educational-subset/0.1.0',
    provenance: {
      kind: 'assumed',
      note: '受 vLLM V1 调度思想启发的可解释子集，不是官方实现，也不声称版本等价。',
    },
    supportedFeatures: {
      chunked_prefill: 'supported',
      prefix_caching: 'supported',
      preemption_recompute: 'supported',
      pd_disaggregation: 'supported',
      cpu_offload: 'partial',
      expert_parallel: 'partial',
      context_parallel: 'partial',
      layerwise_kv_transfer: 'partial',
      host_staging_kv_transfer: 'partial',
      pipeline_parallel: 'partial',
      sequence_parallel: 'partial',
      speculative_decoding: 'partial',
      mtp: 'partial',
      dspark: 'unknown',
      mla: 'partial',
      sparse_attention: 'partial',
      scheduler_v1_subset: 'supported',
    },
    parameterMappings: {
      max_num_seqs: 'runtime.maxNumSeqs',
      max_num_batched_tokens: 'runtime.maxNumBatchedTokens',
      block_size: 'runtime.blockSize',
      enable_chunked_prefill: 'runtime.enableChunkedPrefill',
      enable_prefix_caching: 'runtime.enablePrefixCaching',
      gpu_memory_utilization: 'runtime.gpuMemoryUtilization',
      kv_cache_memory_bytes: 'runtime.kvCacheMemoryBytes',
      preemption_mode: 'runtime.preemptionPolicy',
      kv_transfer_strategy: 'deployment.kvTransfer.strategy',
    },
    sourceUrls: ['https://docs.vllm.ai/en/latest/'],
  };
}
