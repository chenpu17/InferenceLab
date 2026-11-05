import {
  generateContextParallelDeployment,
  generateDeployment,
  generatePdDeployment,
  type Deployment,
  type FrameworkProfile,
  type HardwareProfile,
  type ModelProfile,
  type RequestSpec,
  type RuntimeConfig,
  type Scenario,
} from '@inferencelab/core';
import { createAscendA3Template, createToy32Hardware, createToy4Hardware } from './hardware/toy.js';
import {
  createGlm53TemplateModel,
  createToyDenseModel,
  createToyMlaModel,
  createToyMoeModel,
  createToySparseModel,
} from './models/toy.js';
import { createTeachingFrameworkProfile } from './frameworks/teaching.js';

const GB = 1_000_000_000;

export interface ScenarioPreset {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  milestone: 'M1' | 'M2' | 'M3' | 'M4' | 'M5';
  scenario: Scenario;
}

export interface ProfileBundle {
  hardware: HardwareProfile;
  model: ModelProfile;
  framework: FrameworkProfile;
}

const hardware4 = createToy4Hardware();
const hardware32 = createToy32Hardware();
const hardwareA3 = createAscendA3Template();
const dense = createToyDenseModel();
const moe = createToyMoeModel();
const moeRedundant = createToyMoeModel({
  id: 'model-toy-moe-16b-redundant',
  redundantExpertCount: 8,
  hotspotSkew: 0.6,
});
const glmTemplate = createGlm53TemplateModel();
const mla = createToyMlaModel();
const mlaDcp = createToyMlaModel({ id: 'model-toy-mla-4b-dcp', contextSharded: true });
const sparse = createToySparseModel();
const framework = createTeachingFrameworkProfile();

export const hardwareProfiles = [hardware4, hardware32, hardwareA3];
export const modelProfiles = [dense, moe, moeRedundant, mla, mlaDcp, sparse, glmTemplate];
export const frameworkProfiles = [framework];

export function getProfileBundle(scenario: Scenario): ProfileBundle {
  const hardware = hardwareProfiles.find((h) => h.id === scenario.hardwareProfileId);
  const model = modelProfiles.find((m) => m.id === scenario.modelProfileId);
  const profile = frameworkProfiles.find((f) => f.id === scenario.frameworkProfileId);
  if (!hardware || !model || !profile) {
    throw new Error(
      `Scenario ${scenario.id} 引用了不存在的 Profile: ${scenario.hardwareProfileId}/${scenario.modelProfileId}/${scenario.frameworkProfileId}`,
    );
  }
  return { hardware, model, framework: profile };
}

function runtime(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    maxModelLen: 4096,
    maxNumSeqs: 8,
    maxNumBatchedTokens: 8192,
    blockSize: 16,
    enableChunkedPrefill: true,
    enablePrefixCaching: true,
    gpuMemoryUtilization: 0.9,
    kvCacheMemoryBytes: 8 * GB,
    preemptionPolicy: 'recompute',
    ...overrides,
  };
}

function deploymentFor(hardware: HardwareProfile, tp: number, dp: number): Deployment {
  const generated = generateDeployment(hardware, { tp, dp });
  if (generated.issues.some((i) => i.severity === 'error')) {
    throw new Error(`预设部署生成失败: ${generated.issues.map((i) => i.message).join('; ')}`);
  }
  return generated.deployment;
}

function withEpGroups(deployment: Deployment, ep: number): Deployment {
  const ranks = deployment.placement.ranks.map((rank, index) => ({
    ...rank,
    epGroupIds: [`ep-${index % ep}`],
  }));
  return {
    ...deployment,
    placement: { ranks },
    logicalParallelism: { ...deployment.logicalParallelism, ep },
  };
}

function baseScenario(
  id: string,
  title: string,
  hardware: HardwareProfile,
  model: ModelProfile,
  deployment: Deployment,
  runtimeConfig: RuntimeConfig,
  workload: Scenario['workload'],
  seed = 42,
): Scenario {
  return {
    schemaVersion: '1.0',
    id,
    title,
    seed,
    accuracyTier: 'discrete-event',
    hardwareProfileId: hardware.id,
    modelProfileId: model.id,
    frameworkProfileId: framework.id,
    deployment,
    runtime: runtimeConfig,
    workload,
    assumptions: {
      note: '机制教学仿真；时间指标使用显式合成成本模型。',
      syntheticTiming: true,
    },
  };
}

function sharedPrefixTrace(count: number, sharedBlocks: number, promptTokens: number, outputTokens: number): RequestSpec[] {
  const blockSize = 16;
  const prefix = Array.from({ length: sharedBlocks }, (_, i) => ({
    hash: `shared-prefix-${sharedBlocks}-${i}`,
    tokenCount: blockSize,
  }));
  return Array.from({ length: count }, (_, i) => ({
    id: `req-${i}`,
    atUs: 0,
    promptTokens,
    outputTokens,
    prefixBlocks: prefix,
  }));
}

export const scenarioPresets: ScenarioPreset[] = [
  {
    id: 'toy-4gpu-tp4-basic',
    title: '4 GPU · TP4 基线',
    summary: '4 张 Toy GPU 组成一个 TP4 Engine；4 个请求同时到达，观察 Prefill/Decode 与 KV 池。',
    tags: ['基线', 'TP', 'M2'],
    milestone: 'M2',
    scenario: baseScenario(
      'toy-4gpu-tp4-basic',
      '4 GPU · TP4 基线',
      hardware4,
      dense,
      deploymentFor(hardware4, 4, 1),
      runtime(),
      { kind: 'fixed', count: 4, promptTokens: 1024, outputTokens: 128, atUs: 0 },
    ),
  },
  {
    id: 'toy-32gpu-tp16-dp2',
    title: '32 GPU · TP16 × DP2',
    summary: '两个 DP 副本，每个 TP16；观察副本间请求路由与每副本 KV 峰值。',
    tags: ['TP', 'DP', 'M2'],
    milestone: 'M2',
    scenario: baseScenario(
      'toy-32gpu-tp16-dp2',
      '32 GPU · TP16 × DP2',
      hardware32,
      dense,
      deploymentFor(hardware32, 16, 2),
      runtime({ kvCacheMemoryBytes: 16 * GB, maxNumSeqs: 16, maxNumBatchedTokens: 16384 }),
      { kind: 'fixed', count: 8, promptTokens: 2048, outputTokens: 128, atUs: 0 },
      7,
    ),
  },
  {
    id: 'high-density-demo',
    title: '高密度 · 48 请求 × 1K 输出',
    summary: '32 卡 TP16×DP2，48 条 8K Prompt / 1K Output 请求同时到达；用于主线程响应与事件回放压力测试。',
    tags: ['性能', '高密度', 'M2'],
    milestone: 'M2',
    scenario: baseScenario(
      'high-density-demo',
      '高密度 · 48 请求 × 1K 输出',
      hardware32,
      dense,
      deploymentFor(hardware32, 16, 2),
      runtime({ kvCacheMemoryBytes: 32 * GB, maxNumSeqs: 16, maxNumBatchedTokens: 16384, maxModelLen: 16384 }),
      { kind: 'fixed', count: 48, promptTokens: 8192, outputTokens: 1000, atUs: 0 },
      97,
    ),
  },
  {
    id: 'budget-8-demo',
    title: '预算 8 Token · 分块 Prefill',
    summary: '两个 6-token Prompt 同时到达，max_num_batched_tokens=8：第一步 A 占 6、B 占 2。',
    tags: ['调度', 'Chunked Prefill', '金标'],
    milestone: 'M2',
    scenario: baseScenario(
      'budget-8-demo',
      '预算 8 Token · 分块 Prefill',
      hardware4,
      dense,
      deploymentFor(hardware4, 4, 1),
      runtime({
        maxNumBatchedTokens: 8,
        maxNumSeqs: 4,
        blockSize: 4,
        enablePrefixCaching: false,
        kvCacheMemoryBytes: 1 * GB,
      }),
      {
        kind: 'trace',
        requests: [
          { id: 'A', atUs: 0, promptTokens: 6, outputTokens: 2 },
          { id: 'B', atUs: 0, promptTokens: 6, outputTokens: 2 },
        ],
      },
      11,
    ),
  },
  {
    id: 'prefix-cache-demo',
    title: 'Prefix Cache · 连续前缀命中',
    summary: '三个请求共享连续前缀块；B/C 命中缓存，只有未命中的块需要 Prefill。',
    tags: ['KV Cache', 'Prefix', 'M2'],
    milestone: 'M2',
    scenario: baseScenario(
      'prefix-cache-demo',
      'Prefix Cache · 连续前缀命中',
      hardware4,
      dense,
      deploymentFor(hardware4, 4, 1),
      runtime({ kvCacheMemoryBytes: 2 * GB, maxNumSeqs: 8, maxNumBatchedTokens: 4096 }),
      {
        kind: 'trace',
        requests: [
          {
            id: 'A',
            atUs: 0,
            promptTokens: 64,
            outputTokens: 8,
            prefixBlocks: [
              { hash: 'prefix-shared-0', tokenCount: 16 },
              { hash: 'prefix-shared-1', tokenCount: 16 },
            ],
          },
          {
            id: 'B',
            atUs: 2_000,
            promptTokens: 64,
            outputTokens: 8,
            prefixBlocks: [
              { hash: 'prefix-shared-0', tokenCount: 16 },
              { hash: 'prefix-shared-1', tokenCount: 16 },
            ],
          },
          {
            id: 'C',
            atUs: 4_000,
            promptTokens: 48,
            outputTokens: 8,
            prefixBlocks: [
              { hash: 'prefix-shared-0', tokenCount: 16 },
              { hash: 'prefix-shared-1', tokenCount: 16 },
            ],
          },
        ],
      },
      23,
    ),
  },
  {
    id: 'agent-demo',
    title: 'Agent 多轮 · 粘性会话',
    summary: '两个会话各 3 轮；工具等待后进入下一轮，前缀随历史增长，观察会话粘性与缓存复用。',
    tags: ['Agent', '多轮', 'M2'],
    milestone: 'M2',
    scenario: baseScenario(
      'agent-demo',
      'Agent 多轮 · 粘性会话',
      hardware4,
      dense,
      deploymentFor(hardware4, 4, 1),
      runtime({ kvCacheMemoryBytes: 2 * GB, maxNumSeqs: 8, maxNumBatchedTokens: 4096 }),
      {
        kind: 'agent',
        conversations: 2,
        turns: 3,
        baseSystemTokens: 64,
        turnIncrementTokens: 32,
        outputTokens: 8,
        toolWaitUs: 5_000,
        routing: 'sticky',
      },
      31,
    ),
  },
  {
    id: 'pd-demo',
    title: 'PD 分离 · Prefill → KV 传输 → Decode',
    summary: '4 卡 Prefill Engine + 4 卡 Decode Engine；Prefill 完成后通过共享 Fabric 传输 KV。',
    tags: ['PD', 'KV 传输', 'M3'],
    milestone: 'M3',
    scenario: (() => {
      const generated = generatePdDeployment(hardware32, {
        prefillTp: 4,
        prefillDp: 1,
        decodeTp: 4,
        decodeDp: 1,
        strategy: 'PD_PULL',
      });
      if (generated.issues.some((i) => i.severity === 'error')) {
        throw new Error('PD 预设部署生成失败');
      }
      return baseScenario(
        'pd-demo',
        'PD 分离 · Prefill → KV 传输 → Decode',
        hardware32,
        dense,
        generated.deployment,
        runtime({ kvCacheMemoryBytes: 4 * GB, maxNumSeqs: 8, maxNumBatchedTokens: 2048 }),
        { kind: 'fixed', count: 4, promptTokens: 512, outputTokens: 64, atUs: 0 },
        41,
      );
    })(),
  },
  {
    id: 'offload-demo',
    title: 'CPU Offload · 主机 KV 分层',
    summary: 'HBM KV 池收紧，共享前缀块被淘汰到主机内存；后续请求从主机加载。',
    tags: ['Offload', 'KV 分层', 'M3'],
    milestone: 'M3',
    scenario: baseScenario(
      'offload-demo',
      'CPU Offload · 主机 KV 分层',
      hardware4,
      dense,
      deploymentFor(hardware4, 4, 1),
      runtime({
        kvCacheMemoryBytes: 256_000_000,
        enableCpuOffload: true,
        hostCacheBytes: 4 * GB,
        maxNumSeqs: 4,
        maxNumBatchedTokens: 2048,
      }),
      {
        kind: 'trace',
        requests: sharedPrefixTrace(8, 24, 512, 16).map((request, index) => ({
          ...request,
          atUs: index < 4 ? 0 : 700_000,
        })),
      },
      53,
    ),
  },
  {
    id: 'moe-redundant-demo',
    title: 'MoE · 冗余专家与热点',
    summary: 'EP2 + 8 个冗余专家副本 + 偏斜路由；观察每卡专家权重增加与专家负载热点。',
    tags: ['MoE', 'EP', '冗余专家', 'M4'],
    milestone: 'M4',
    scenario: (() => {
      const base = withEpGroups(deploymentFor(hardware4, 4, 1), 2);
      return baseScenario(
        'moe-redundant-demo',
        'MoE · 冗余专家与热点',
        hardware4,
        moeRedundant,
        base,
        runtime({
          kvCacheMemoryBytes: 4 * GB,
          maxNumSeqs: 8,
          maxNumBatchedTokens: 4096,
          enableExpertParallel: true,
        }),
        { kind: 'fixed', count: 8, promptTokens: 1024, outputTokens: 64, atUs: 0 },
        67,
      );
    })(),
  },
  {
    id: 'cp-demo',
    title: 'CP · DCP 复用 TP，PCP 增加 Rank',
    summary: 'TP2 × PCP2：DCP2 只在 TP2 内重标号；PCP2 让 Rank 数从 2 增至 4。',
    tags: ['CP', 'PCP', 'DCP', 'M4'],
    milestone: 'M4',
    scenario: (() => {
      const generated = generateContextParallelDeployment(hardware4, { tp: 2, dp: 1, pcp: 2, dcp: 2 });
      if (generated.issues.some((issue) => issue.severity === 'error')) {
        throw new Error('CP 预设部署生成失败');
      }
      return baseScenario(
        'cp-demo',
        'CP · DCP 复用 TP，PCP 增加 Rank',
        hardware4,
        dense,
        generated.deployment,
        runtime({ kvCacheMemoryBytes: 2 * GB, maxNumSeqs: 8, maxNumBatchedTokens: 4096, pcpSize: 2, dcpSize: 2 }),
        { kind: 'fixed', count: 4, promptTokens: 2048, outputTokens: 64, atUs: 0 },
        73,
      );
    })(),
  },
  {
    id: 'moe-ep-demo',
    title: 'MoE · EP2 专家并行',
    summary: '64 专家 / top-4；EP2 下每 Rank 持有 32 个专家，展示专家权重驻留而非 TP 乘法。',
    tags: ['MoE', 'EP', 'M4'],
    milestone: 'M4',
    scenario: baseScenario(
      'moe-ep-demo',
      'MoE · EP2 专家并行',
      hardware4,
      moe,
      withEpGroups(deploymentFor(hardware4, 4, 1), 2),
      runtime({
        kvCacheMemoryBytes: 4 * GB,
        maxNumSeqs: 8,
        maxNumBatchedTokens: 4096,
        enableExpertParallel: true,
      }),
      { kind: 'fixed', count: 4, promptTokens: 1024, outputTokens: 64, atUs: 0 },
      61,
    ),
  },
  {
    id: 'pp-sp-demo',
    title: 'PP2 × SP2 · 分层执行与 Activation 分片',
    summary: 'TP2 × PP2 新增 4 个 Rank；SP2 复用同一 TP Group，只把 Activation 沿序列维切分（Workspace 不切分），并与 PCP/DCP 区分。',
    tags: ['PP', 'SP', 'Activation Pipeline', 'M4'],
    milestone: 'M4',
    scenario: baseScenario(
      'pp-sp-demo',
      'PP2 × SP2 · 分层执行与 Activation 分片',
      hardware4,
      dense,
      (() => {
        const generated = generateDeployment(hardware4, { tp: 2, dp: 1, pp: 2, sp: 2 });
        if (generated.issues.some((issue) => issue.severity === 'error')) {
          throw new Error('PP/SP 预设部署生成失败');
        }
        return generated.deployment;
      })(),
      runtime({ kvCacheMemoryBytes: 2 * GB, maxNumSeqs: 8, maxNumBatchedTokens: 4096, spSize: 2 }),
      { kind: 'fixed', count: 4, promptTokens: 1024, outputTokens: 64, atUs: 0 },
      79,
    ),
  },
  {
    id: 'mla-dcp-demo',
    title: 'MLA · Latent KV + DCP2',
    summary: 'MLA 使用 latent=512 + RoPE=64 的 KV 布局，不套用 GQA 头公式；DCP2 在 TP2 内切分 latent 缓存。',
    tags: ['MLA', 'DCP', 'KV Layout', 'M4'],
    milestone: 'M4',
    scenario: (() => {
      const generated = generateContextParallelDeployment(hardware4, { tp: 2, dp: 1, dcp: 2 });
      if (generated.issues.some((issue) => issue.severity === 'error')) {
        throw new Error('MLA/DCP 预设部署生成失败');
      }
      return baseScenario(
        'mla-dcp-demo',
        'MLA · Latent KV + DCP2',
        hardware4,
        mlaDcp,
        generated.deployment,
        runtime({ kvCacheMemoryBytes: 2 * GB, maxNumSeqs: 8, maxNumBatchedTokens: 4096, dcpSize: 2 }),
        { kind: 'fixed', count: 4, promptTokens: 2048, outputTokens: 64, atUs: 0 },
        83,
      );
    })(),
  },
  {
    id: 'sfa-dsa-demo',
    title: 'SFA/DSA · 显式稀疏缓存组',
    summary: '前 12 层 SFA 窗口缓存、后 12 层 DSA 压缩缓存；每层声明 cache group，未声明布局的模型保持 unavailable。',
    tags: ['SFA', 'DSA', '稀疏 Attention', 'M4'],
    milestone: 'M4',
    scenario: baseScenario(
      'sfa-dsa-demo',
      'SFA/DSA · 显式稀疏缓存组',
      hardware4,
      sparse,
      deploymentFor(hardware4, 4, 1),
      runtime({ kvCacheMemoryBytes: 2 * GB, maxNumSeqs: 8, maxNumBatchedTokens: 4096 }),
      { kind: 'fixed', count: 4, promptTokens: 1024, outputTokens: 64, atUs: 0 },
      89,
    ),
  },
  {
    id: 'speculative-mtp-demo',
    title: 'MTP · 投机解码假设',
    summary: '每步 Draft 4 个 Token、接受率 0.6；Token Budget 计入 Draft，收益随接受率变化，不是固定加速比。',
    tags: ['MTP', '投机解码', '假设', 'M4'],
    milestone: 'M4',
    scenario: baseScenario(
      'speculative-mtp-demo',
      'MTP · 投机解码假设',
      hardware4,
      dense,
      deploymentFor(hardware4, 4, 1),
      runtime({
        kvCacheMemoryBytes: 2 * GB,
        maxNumSeqs: 8,
        maxNumBatchedTokens: 4096,
        speculative: { method: 'mtp', draftTokens: 4, acceptanceRate: 0.6, draftCostRatio: 0.15 },
      }),
      { kind: 'fixed', count: 4, promptTokens: 1024, outputTokens: 128, atUs: 0 },
      97,
    ),
  },
  {
    id: 'speculative-dspark-demo',
    title: 'DSpark · Unknown 适配器边界',
    summary: '使用显式 Draft 8 / 接受率 0.35 运行结构对比；教学适配器将 DSpark 标为 unknown，必须显示未验证警告。',
    tags: ['DSpark', '投机解码', 'Unknown', 'M4'],
    milestone: 'M4',
    scenario: baseScenario(
      'speculative-dspark-demo',
      'DSpark · Unknown 适配器边界',
      hardware4,
      dense,
      deploymentFor(hardware4, 4, 1),
      runtime({
        kvCacheMemoryBytes: 2 * GB,
        maxNumSeqs: 8,
        maxNumBatchedTokens: 4096,
        speculative: { method: 'dspark', draftTokens: 8, acceptanceRate: 0.35, draftCostRatio: 0.2 },
      }),
      { kind: 'fixed', count: 4, promptTokens: 1024, outputTokens: 128, atUs: 0 },
      101,
    ),
  },
  {
    id: 'ascend-a3-glm53-template',
    title: 'Ascend A3 · GLM-5.3 结构模板',
    summary: '仅导入结构：算力/HBM 带宽/SFA KV 布局均为 unknown；不允许伪造时间与容量结论。',
    tags: ['Ascend', 'GLM-5.3', 'Unknown', 'M5'],
    milestone: 'M5',
    scenario: baseScenario(
      'ascend-a3-glm53-template',
      'Ascend A3 · GLM-5.3 结构模板',
      hardwareA3,
      glmTemplate,
      deploymentFor(hardwareA3, 8, 2),
      runtime({
        maxModelLen: 32768,
        blockSize: 64,
        kvCacheMemoryBytes: undefined,
        maxNumSeqs: 16,
        maxNumBatchedTokens: 16384,
      }),
      { kind: 'fixed', count: 4, promptTokens: 4096, outputTokens: 128, atUs: 0 },
      71,
    ),
  },
];

export function getScenarioPreset(id: string): ScenarioPreset | undefined {
  return scenarioPresets.find((preset) => preset.id === id);
}

export function cloneScenario(scenario: Scenario): Scenario {
  return JSON.parse(JSON.stringify(scenario)) as Scenario;
}
