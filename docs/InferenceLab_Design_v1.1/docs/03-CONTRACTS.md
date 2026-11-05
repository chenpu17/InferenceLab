# 03 · 对象模型、数据协议、计算规则

> 本文提供 Agent 实现用的**参考接口**，字段可在开发时增补，但不要随意改变核心概念、单位和状态定义。所有配置使用 `schemaVersion`，升级须附迁移函数。

## 1. TypeScript 结构建议

```ts
type ID = string;
type Bytes = number;              // 单位 bytes，必须安全整数 >=0
type Microseconds = number;       // 仿真虚拟时间，安全整数 >=0
type BitsPerSecond = number;      // 物理链路速率
type BytesPerSecond = number;     // 有效吞吐率
type ProvenanceKind = 'derived' | 'measured' | 'estimated' | 'assumed' | 'unknown';
type AccuracyTier = 'structural' | 'analytical' | 'discrete-event' | 'calibrated';
interface Evidence { kind: ProvenanceKind; sourceUrl?: string; sourceTag?: string;
  version?: string; note?: string; measuredAt?: string; validity?: string; }
interface Sourced<T> { value: T | null; evidence: Evidence; }

interface Scenario {
  schemaVersion: '1.0'; id: ID; title: string; seed: number;
  accuracyTier: AccuracyTier;
  hardwareProfileId: ID; modelProfileId: ID; frameworkProfileId: ID;
  deployment: Deployment; runtime: RuntimeConfig; workload: WorkloadConfig;
  assumptions: Record<string, number | boolean | string>;
}
interface Accelerator {
  id: ID; nodeId: ID; vendor: 'nvidia' | 'ascend' | 'amd' | 'toy';
  family: string; hbmPoolId: ID; computeResourceId: ID; dmaResourceIds: ID[];
}
interface MemoryPool {
  id: ID; ownerId: ID; kind: 'HBM' | 'DRAM' | 'PINNED' | 'SSD';
  capacityBytes: Bytes; externalReservedBytes: Bytes; alignmentBytes: Bytes;
  readBytesPerSecond: Sourced<BytesPerSecond>;
  writeBytesPerSecond: Sourced<BytesPerSecond>;
  numaNodeId?: ID;
}
interface Link {
  id: ID; fromId: ID; toId: ID; kind: 'PCIe' | 'HCCS' | 'NVLINK' | 'NVSWITCH' | 'NIC' | 'FABRIC' | 'OTHER';
  nominalBitsPerSecond: BitsPerSecond; effectiveRatio: number;
  latencyUs: number; duplex: 'full' | 'half'; contentionDomainId: ID;
}
interface ContentionDomain {
  id: ID; capacityBitsPerSecond: BitsPerSecond;
  duplex: 'full' | 'half'; arbitration: 'serialized' | 'processor-sharing';
}
interface PhysicalPlacement {
  ranks: Array<{rankId: ID; engineId: ID; acceleratorId: ID;
    dpReplicaId: ID; tpGroupId?: ID; epGroupIds?: ID[];
    ppStageId?: ID; pcpGroupId?: ID; dcpGroupId?: ID;}>
}
interface EngineInstance {
  id: ID; role: 'mixed' | 'prefill' | 'decode'; rankIds: ID[];
  schedulerId: ID; cacheManagerId: ID; kvTransferStrategyId?: ID;
}
interface Deployment { engines: EngineInstance[]; placement: PhysicalPlacement;
  logicalParallelism: Record<string, number>; routing?: RoutingPolicy; }
interface RuntimeConfig {
  maxModelLen: number; maxNumSeqs: number; maxNumBatchedTokens: number;
  blockSize: number; enableChunkedPrefill: boolean; enablePrefixCaching: boolean;
  gpuMemoryUtilization?: number; kvCacheMemoryBytes?: number;
  preemptionPolicy: 'recompute' | 'none' | 'backend-specific';
}
interface RequestSpec {
  id: ID; atUs: number; promptTokens: number; outputTokens: number;
  prefixBlocks?: Array<{hash: string; tokenCount: number}>;
  conversationId?: ID; turnIndex?: number; priority?: number;
}
type WorkloadConfig = { kind: 'trace'; requests: RequestSpec[] } |
  { kind: 'fixed'; count: number; promptTokens: number; outputTokens: number; atUs: number } |
  { kind: 'poisson'; count: number; arrivalRatePerSecond: number;
    promptTokens: number; outputTokens: number } |
  { kind: 'agent'; conversations: number; turns: number; baseSystemTokens: number;
    turnIncrementTokens: number; outputTokens: number; toolWaitUs: number };

interface SimEvent { id: ID; timeUs: Microseconds; order: number;
  type: string; targetId?: ID; requestId?: ID; resourceIds: ID[];
  dependsOn: ID[]; detail: Record<string, unknown>; }
interface Metric { key: string; value: number | null; unit: string;
  quality: 'exact' | 'assumption' | 'calibrated' | 'unavailable';
  evidenceIds: ID[]; reason?: string; }
```

实际 `HardwareProfile`, `ModelProfile`, `FrameworkProfile` 要拆成单独 schema，不应把庞大内容内嵌到每个 Scenario 中。`scenario.json` 使用 profile ID 引用，导出 bundle 时可以一并打包锁定。

## 2. Profile 标准

### 2.1 HardwareProfile

包含 `version`, `source`, `nodes`, `accelerators`, `memoryPools`, `links`, `resources`, `topology`。服务器不保证所有卡在同一个 Fabric；GPU/NPU↔NIC 之间路径可能包含同机总线/交换芯片，必须明确设置。多 NIC 实际聚合效率由 `effectiveRatio`、各 Link 与 `contentionDomains` 共同控制，禁止以端口速率简单相加视作单流吞吐。

### 2.2 ModelProfile

包含 `modelId`, `revision`, `architectureFamily`, `numLayers`, `hiddenSize`, `vocabSize`, `attentionLayers`, `moeLayers`, `tensorInventory`, `quantization`, `kvLayout`, `provenance`。

推荐每 Attention Layer 单独声明 `kind`, `nQueryHeads`, `nKVHeads`, `headDim`, `kvDtypeBytes`, `windowTokens?`, `cacheGroups`。MLA 使用 `layout: 'mla-latent'` 并声明该层实际存储的 latent/rope 维度、cache dtype 与 per rank 切分规则；如果使用经实测的 KV 字节数，标记 `measured`，且仅对对应后端有效。

MoE 需要 `expertCount`, `topK`, `expertTensorSizes`, `expertPlacement`, `sharedExpertBytes`、可选 `redundantExpertPlacement`。不要根据一个数字 `numParameters` 推算全部权重占用。

### 2.3 FrameworkProfile

包含 `framework`、`versionTagOrCommit`、`runner`、`supportedFeatures`、`parameterMappings`、`kvConnectorKinds`、`linksToSource`；版本绝不能默默更新。`vllm-v1-subset` 是本项目教学模型，不应命名 `vllm-exact`。

## 3. 启动前的校验规则

返回 `{severity, code, path, message, evidence?, suggestedFix?}` 数组。例：

- 每个 Rank 映射到存在的加速器；同一个 Engine 中不得不合理映射两个活跃 Rank 到同一设备（允许明确配置多进程共享，但应计算竞争）。
- `tpGroupId` 的规模与所声明 TP 一致；DP 副本有独立分组和 KV Manager；多角色同时部署时物理资源不得超分配。
- 计算权重、Graph/Workspace、通信、KV reserve 后，HBM 预算不能为负；未知权重 → 不能宣称部署成功。
- `maxNumSeqs >= 1`, `maxNumBatchedTokens >= 1`, `maxModelLen >= 1`；在 pin 住的 V1 adapter 中校验其相互约束（例如部分版本 `max_num_batched_tokens >= max_num_seqs`，Chunked Prefill 关闭时可能需 `>= max_model_len`）。
- `blockSize > 0` 且在后端允许集合内；KV cache 分配单位按 Block 四舍向上，不是把总 token 字节直接平铺。
- `maxModelLen` 与 Request ISL/OSL 冲突须依配置拒绝或截断，不允许无声忽略。
- `effectiveRatio ∈ (0,1]`、capacity>0、time/bandwidth≥0，Link Path 连通、无未声明无限带宽捷径。
- 有未建模的模型布局 / 特性 unknown / 缺失的时间曲线，停止相应数值模拟、提供引导；结构视图仍可用。
- PD 场景 P/D 拥有不同 `EngineInstance`；D KV 目标空间预留必须存在，远端 KV 未 ready 不得 decode。

## 4. 核心计算的测试边界

### 4.1 GQA / MHA KV bytes（未分片理论值）

对单一层：

```
KV_B_per_token_layer = K_bytes + V_bytes
                      = nKVHeads × headDim × kDtypeBytes
                        + nKVHeads × headDim × vDtypeBytes
KV_B_model_per_token = Σ layers KV_B_per_token_layer
KV_B_per_block(rank,g) = blockSize × localKV_B_per_token(rank,g) + alignment/padding
```

只有当 K/V dtype 一致时才写成 `2 × nKVHeads × headDim × dtypeBytes`。若有滑窗/混合缓存/跨层合并，需依缓存策略另行计算。**分布式每 Rank KV**不直接等于 `全模型 KV/TP`：可能有复制、头数量不足、DCP 分片或不同 per-layer layout。

### 4.2 KV Pool / HBM

例如一张假设 16 GiB 的 Toy GPU：`weightResident=6 GiB`, `runtime=1 GiB`, `workspace/graph/comm=2 GiB`, `other=1 GiB`，则用于 KV 池的上界为 6 GiB（还未考虑策略预留/对齐）。**这是演示，不是任何真实设备数据**。

预分配 KV 时：
```
GPU_HBM_committed = weights + runtime + other + workspace + kvPoolReserved
KV_POOL_USED = allocatedBlocks * bytesPerBlock
KV_POOL_FREE = kvPoolReserved - KV_POOL_USED
```
不得把 `KV_POOL_USED` 再加到 `GPU_HBM_committed`。

### 4.3 网络速率

```
wireBytesPerSecond = nominalBitsPerSecond / 8
usableBytesPerSecond = wireBytesPerSecond * efficiency
minServiceTimeSeconds >= payloadBytes / bottleneckUsableBytesPerSecond
```

要加上固定开销、路径上各阶段拷贝和竞争等。独立交换域中各 Link 可重叠流水，但不能把每一段数据搬运延时不加区分地统统求和（或完全取 max）。

### 4.4 Token Budget 简化用例

假设 `maxNumBatchedTokens=8`，两个等待中的请求分别需 6、6 个未计算 prompt tokens；没有正在 Decode 的请求、KV 容量充足、按 FCFS：本轮 A 6 + B 2（Chunked Prefill 打开）是有效的**子集示例**，下一轮 B 4。若存在正在运行的 Decode 请求则优先消耗相应预算，具体由 adapter 定义。

### 4.5 `max_num_seqs` 语义

`max_num_seqs=4` 不代表 API 同时只能保持四个连接，而是每轮调度最多处理四条序列（具体包括 scheduler active 与 runner buffers 的语义依版本而定）。超过四个 Request 可在 WAITING；所有请求统计仍记录。

### 4.6 TPOT 与 TTFT

```
TTFT_server = t(firstTokenEmitted) - t(engineReceived)
TTFT_client = t(firstTokenReceived) - t(clientSent)
TPOT = (t(lastToken) - t(firstToken)) / (numOutputTokens - 1), N>1
ITL_i = t(token_i) - t(token_{i-1})
```

必须标明 server/client 观测边界。输出 1 Token 时 TPOT = N/A，非 0。对批量压测的 TPS/TPM 应报告 **请求窗口/测量持续时间**，不能把累计输出 token / 单个请求时长当作集群吞吐。

## 5. 端到端事件链示例（结构而非固定时间）

```text
RequestArrival → AdmitOrQueue → PrefixLookup
  ├── GPU hit ───────────────────────┐
  ├── Host hit → Transfer H2D → Ready │
  └── Miss → Allocate KV → Prefill Chunks
                                    ↓
                        P Complete / KV Local Ready
                                    ↓
                     [PD?] KV Transfer + D Allocate
                                    ↓
                          Decode Scheduler Iterations
                                    ↓
                     Token Emission → Request Finished
                                    ↓
             KV ref release / retained cache / offload
```

`toolWait` 应体现在下一条 Request 的 arrival/turn gap，避免把同一推理请求在 GPU 侧暂停 10 秒却还一直占用 Running Slot 的不实模拟。

## 6. 数据示例与 Schema

见 `../schemas/scenario.schema.json`、`../examples/toy-scenario.json`、`../examples/ascend-a3-glm53-template.json`。JSON Schema 负责结构校验，**业务语义校验必须由 TypeScript Validator 完成**。这些文件是输入参考样例，不代表模型网络或硬件真实定值。

## 7. 导出数据格式

```
ExperimentResult {
  schemaVersion, engineVersion, scenarioSnapshot, profilesFingerprint,
  startedWithSeed, completedState, metrics: Metric[],
  events: SimEvent[] | eventFileRef,
  snapshots: StateSnapshot[], constraints: ValidationIssue[],
  assumptionsUsed: Evidence[], limitations: string[]
}
```

报告分为三栏：结构上能确定什么、基于假设计算的什么、还需要实际压测来证实什么。支持 JSON 优先；HTML/PNG 截图/Markdown 报告在 M5 加入。
