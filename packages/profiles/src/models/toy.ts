import type { AttentionLayer, ModelProfile } from '@inferencelab/core';

const GB = 1_000_000_000;

function gqaStack(layers: number, nKVHeads: number, headDim: number, windowTokens?: number): AttentionLayer[] {
  return Array.from({ length: layers }, (_, layerIndex) => ({
    layerIndex,
    kind: 'GQA' as const,
    nQueryHeads: 24,
    nKVHeads,
    headDim,
    kDtypeBytes: 2,
    vDtypeBytes: 2,
    kvLayout: 'head-sharded-tp' as const,
    ...(windowTokens ? { windowTokens } : {}),
  }));
}

/** A small dense decoder used by all default teaching scenarios. */
export function createToyDenseModel(): ModelProfile {
  const layers = 24;
  const hidden = 3072;
  const intermediate = 8192;
  const vocab = 128_000;
  const kvDim = 8 * 128;
  const attentionBytes = layers * (hidden * hidden + 2 * hidden * kvDim) * 2;
  const mlpBytes = layers * 3 * hidden * intermediate * 2;
  return {
    id: 'model-toy-dense-4b',
    revision: '1.0.0',
    profileType: 'synthetic-toy',
    provenance: {
      kind: 'assumed',
      note: '合成 Dense 模型（约 2.5B 参数），用于机制教学；权重布局为显式近似。',
    },
    architectureFamily: 'toy-dense-gqa',
    numLayers: layers,
    hiddenSize: hidden,
    vocabSize: vocab,
    attentionLayers: gqaStack(layers, 8, 128),
    tensorInventory: [
      { id: 'embed', logicalBytes: vocab * hidden * 2, rule: 'shard-tp', alignBytes: 256 },
      { id: 'attention', logicalBytes: attentionBytes, rule: 'shard-tp', alignBytes: 256 },
      { id: 'mlp', logicalBytes: mlpBytes, rule: 'shard-tp', alignBytes: 256 },
      { id: 'lm-head', logicalBytes: vocab * hidden * 2, rule: 'shard-tp', alignBytes: 256 },
      { id: 'norms', logicalBytes: layers * 2 * hidden * 2, rule: 'replicate', alignBytes: 256 },
    ],
    runtimeAssumptions: {
      runtimeBytesPerRank: 500_000_000,
      workspacePeakBytesPerRank: 300_000_000,
      graphCaptureBytesPerRank: 200_000_000,
      communicationBufferBytesPerRank: 100_000_000,
    },
    latencyAssumptions: {
      model: 'max(FLOPs / (TFLOPs × MFU), bytes / effective HBM BW) + launch overhead',
      assumed: true,
      prefillTflopsPerAccelerator: 30,
      decodeLaunchOverheadUs: 50,
    },
    sourceUrls: [],
  };
}

/**
 * MoE variant with explicit expert storage. Expert parallelism is structural:
 * each rank owns ceil(expertCount / epSize) experts.
 */
export function createToyMoeModel(
  options: { id?: string; redundantExpertCount?: number; hotspotSkew?: number } = {},
): ModelProfile {
  const dense = createToyDenseModel();
  const layers = 24;
  const hidden = 3072;
  const intermediate = 8192;
  const vocab = 128_000;
  const expertBytes = 64_000_000;
  const expertCount = 64;
  const redundantExpertCount = options.redundantExpertCount ?? 0;
  return {
    ...dense,
    id: options.id ?? 'model-toy-moe-16b',
    revision: '1.0.0',
    provenance: {
      kind: 'assumed',
      note:
        redundantExpertCount > 0
          ? `合成 MoE 模型：64 专家 / top-4，含 ${redundantExpertCount} 个冗余专家副本；权重为教学近似。`
          : '合成 MoE 模型：64 专家 / top-4，专家权重显式为教学近似。',
    },
    architectureFamily: 'toy-moe-gqa',
    moe: {
      expertCount,
      topK: 4,
      expertBytes,
      sharedExpertBytes: 128_000_000,
      redundantExpertCount,
      hotspotSkew: options.hotspotSkew,
    },
    tensorInventory: [
      { id: 'embed', logicalBytes: vocab * hidden * 2, rule: 'shard-tp', alignBytes: 256 },
      {
        id: 'attention',
        logicalBytes: layers * (hidden * hidden + 2 * hidden * 1024) * 2,
        rule: 'shard-tp',
        alignBytes: 256,
      },
      { id: 'experts', logicalBytes: expertCount * expertBytes, rule: 'expert-partition', alignBytes: 256 },
      { id: 'shared-expert', logicalBytes: layers * 2 * hidden * intermediate * 2, rule: 'shard-tp', alignBytes: 256 },
      { id: 'lm-head', logicalBytes: vocab * hidden * 2, rule: 'shard-tp', alignBytes: 256 },
    ],
  };
}

/**
 * MLA teaching model. KV cache uses the latent+RoPE layout, not the GQA head
 * formula. With contextSharded=true the latent cache is divided by DCP size.
 */
export function createToyMlaModel(options: { id?: string; contextSharded?: boolean } = {}): ModelProfile {
  const layers = 24;
  const hidden = 3072;
  const intermediate = 8192;
  const vocab = 128_000;
  const kvLatentDim = 512;
  const ropeDim = 64;
  const contextSharded = options.contextSharded ?? false;
  const attentionBytes = layers * (hidden * hidden + hidden * (kvLatentDim + ropeDim)) * 2;
  const mlpBytes = layers * 3 * hidden * intermediate * 2;
  return {
    id: options.id ?? 'model-toy-mla-4b',
    revision: '1.0.0',
    profileType: 'synthetic-toy',
    provenance: {
      kind: 'assumed',
      note: contextSharded
        ? '合成 MLA 模型：latent=512 + RoPE=64，KV 布局按 DCP 上下文分片显式建模。'
        : '合成 MLA 模型：latent=512 + RoPE=64，KV 布局按 latent 缓存显式建模，用于教学对比。',
    },
    architectureFamily: 'toy-mla',
    numLayers: layers,
    hiddenSize: hidden,
    vocabSize: vocab,
    attentionLayers: Array.from({ length: layers }, (_, layerIndex) => ({
      layerIndex,
      kind: 'MLA' as const,
      nQueryHeads: 24,
      kvLatentDim,
      ropeDim,
      kDtypeBytes: 2,
      kvLayout: 'mla-latent' as const,
      ...(contextSharded ? { contextSharded: true } : {}),
    })),
    tensorInventory: [
      { id: 'embed', logicalBytes: vocab * hidden * 2, rule: 'shard-tp', alignBytes: 256 },
      { id: 'attention', logicalBytes: attentionBytes, rule: 'shard-tp', alignBytes: 256 },
      { id: 'mlp', logicalBytes: mlpBytes, rule: 'shard-tp', alignBytes: 256 },
      { id: 'lm-head', logicalBytes: vocab * hidden * 2, rule: 'shard-tp', alignBytes: 256 },
      { id: 'norms', logicalBytes: layers * 2 * hidden * 2, rule: 'replicate', alignBytes: 256 },
    ],
    runtimeAssumptions: {
      runtimeBytesPerRank: 500_000_000,
      workspacePeakBytesPerRank: 300_000_000,
      graphCaptureBytesPerRank: 200_000_000,
      communicationBufferBytesPerRank: 100_000_000,
    },
    latencyAssumptions: {
      model: 'max(FLOPs / (TFLOPs × MFU), bytes / effective HBM BW) + launch overhead',
      assumed: true,
      prefillTflopsPerAccelerator: 30,
      decodeLaunchOverheadUs: 50,
    },
    sourceUrls: [],
  };
}

/**
 * Sparse-attention teaching model with explicit cache groups. Half the layers
 * use a windowed SFA cache, half use a compressed DSA cache. Values are
 * assumptions; a model without these fields must stay `unavailable`.
 */
export function createToySparseModel(): ModelProfile {
  const layers = 24;
  const hidden = 3072;
  const intermediate = 8192;
  const vocab = 128_000;
  const attentionBytes = layers * hidden * hidden * 2;
  const mlpBytes = layers * 3 * hidden * intermediate * 2;
  return {
    id: 'model-toy-sparse-4b',
    revision: '1.0.0',
    profileType: 'synthetic-toy',
    provenance: {
      kind: 'assumed',
      note: '合成稀疏 Attention 模型：SFA 窗口缓存 + DSA 压缩缓存，显式 cache group 仅用于教学。',
    },
    architectureFamily: 'toy-sparse-sfa-dsa',
    numLayers: layers,
    hiddenSize: hidden,
    vocabSize: vocab,
    attentionLayers: Array.from({ length: layers }, (_, layerIndex): AttentionLayer => {
      if (layerIndex < layers / 2) {
        return {
          layerIndex,
          kind: 'SFA',
          kvLayout: 'head-sharded-tp',
          kDtypeBytes: 2,
          sparseKV: {
            cacheGroup: 'sfa-window',
            storage: 'window',
            nKVHeads: 4,
            headDim: 128,
            dtypeBytes: 2,
            windowTokens: 4096,
          },
        };
      }
      return {
        layerIndex,
        kind: 'DSA',
        kvLayout: 'head-sharded-tp',
        kDtypeBytes: 2,
        sparseKV: {
          cacheGroup: 'dsa-compressed',
          storage: 'compressed',
          kvLatentDim: 256,
          dtypeBytes: 2,
        },
      };
    }),
    tensorInventory: [
      { id: 'embed', logicalBytes: vocab * hidden * 2, rule: 'shard-tp', alignBytes: 256 },
      { id: 'attention', logicalBytes: attentionBytes, rule: 'shard-tp', alignBytes: 256 },
      { id: 'mlp', logicalBytes: mlpBytes, rule: 'shard-tp', alignBytes: 256 },
      { id: 'lm-head', logicalBytes: vocab * hidden * 2, rule: 'shard-tp', alignBytes: 256 },
      { id: 'norms', logicalBytes: layers * 2 * hidden * 2, rule: 'replicate', alignBytes: 256 },
    ],
    runtimeAssumptions: {
      runtimeBytesPerRank: 500_000_000,
      workspacePeakBytesPerRank: 300_000_000,
      graphCaptureBytesPerRank: 200_000_000,
      communicationBufferBytesPerRank: 100_000_000,
    },
    latencyAssumptions: {
      model: 'max(FLOPs / (TFLOPs × MFU), bytes / effective HBM BW) + launch overhead',
      assumed: true,
      prefillTflopsPerAccelerator: 30,
      decodeLaunchOverheadUs: 50,
    },
    sourceUrls: [],
  };
}

/**
 * Structural-only template. SFA KV layout is not modeled, so the plan must
 * report "unknown" rather than substituting MHA/GQA numbers.
 */
export function createGlm53TemplateModel(): ModelProfile {
  const layers = 80;
  return {
    id: 'model-glm53-template',
    revision: '0.1.0-template',
    profileType: 'model-vendor-spec',
    provenance: {
      kind: 'unknown',
      note: 'GLM-5.3 结构模板：缺少可验证的权重与 KV 布局数据；仅用于导入/结构展示。',
    },
    architectureFamily: 'glm-5.3-template',
    numLayers: layers,
    hiddenSize: 8192,
    vocabSize: 160_000,
    attentionLayers: Array.from({ length: layers }, (_, layerIndex) => ({
      layerIndex,
      kind: 'SFA' as const,
      kvLayout: 'opaque' as const,
    })),
    tensorInventory: [
      { id: 'opaque-weights', logicalBytes: 0, rule: 'opaque' },
    ],
    runtimeAssumptions: {
      runtimeBytesPerRank: 4_000_000_000,
      workspacePeakBytesPerRank: 2_000_000_000,
      graphCaptureBytesPerRank: 1_000_000_000,
      communicationBufferBytesPerRank: 500_000_000,
    },
    latencyAssumptions: {
      model: 'unknown',
      assumed: false,
    },
    sourceUrls: [],
  };
}

export const TOY_DENSE_BYTES_PER_PARAM = 2;
export const TOY_DENSE_APPROX_PARAMS = 2_500_000_000;
export const TOY_GB = GB;
