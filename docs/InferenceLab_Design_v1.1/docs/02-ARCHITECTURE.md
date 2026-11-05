# 02 · 架构与机制仿真技术规格

## 1. 顶层架构

```
┌──────────────────────── Browser ────────────────────────────┐
│ UI / Inference Studio                                      │
│ Config | Topology | Memory | Timeline | Metrics | Compare  │
│      ↓ schema-validated commands     ↑ immutable snapshots │
│ App State (Zustand)                 Worker Bridge           │
│                                       ↕                    │
│ Web Worker: Inference Core                                 │
│  ┌─────────────┬──────────────┬──────────────────────────┐  │
│  │ Validation  │ Placement    │ Event Engine             │  │
│  │ + Feature   │ + Memory     │ Scheduler / KV / Transfer│  │
│  │ Registry    │ Planner      │ Resource Arbitration     │  │
│  └─────────────┴──────────────┴──────────────────────────┘  │
│           ↓ deterministic results + provenance             │
│      Trace / Statistics / Bounded event snapshots          │
└────────────────────────────────────────────────────────────┘
                           ↕ local only
                JSON Scenario / Profiles / Trace
```

推荐代码 Monorepo（pnpm workspaces 或 npm workspaces），无需过度工程化：

```
apps/web/                    # React + Vite + Tailwind + Zustand
packages/core/               # Pure TS；禁止 React/DOM 依赖
  src/domain/                # immutable Entity IDs、units、scenario
  src/validation/            # JSON/schema + semantic constraints
  src/placement/             # device/rank/group/replica, memory budget
  src/events/                # stable priority queue, virtual clock, PRNG
  src/scheduler/             # policy interfaces; vllm-v1-subset
  src/cache/                 # KV allocator, hash lookup, refcount, offload
  src/resource/              # device compute, HBM, CPU, memory, links
  src/models/                # cost model & attention layouts
  src/metrics/               # timestamps, percentiles, attribution
  src/trace/                 # deterministic event export/replay
packages/profiles/           # toy / validated hardware-model metadata
packages/adapters/           # framework-version feature matrix & parsers
```

**单向数据流**：UI 编辑草稿 → 校验/解析 → 创建不可变 ScenarioSnapshot → Worker `run()` → 输出 EventLog、Snapshot、Metrics → UI 根据 virtualTime 播放事件。拖动参数只更新草稿；需要重新运行才改变实验结果，避免混淆“同一事件历史”和“新配置”。

## 2. 术语及最小实体

- `HardwareNode`: 服务器；下挂 CPUs、NUMA DRAM、Accelerators、NIC、Storage。
- `Accelerator`: 单卡；HBM、compute、DMA engines、设备间 peer links、归属 host。
- `MemoryPool`: 带容量、预留、分配粒度、带宽/延迟与归属的资源池；至少 HBM/DRAM（可含 pinned）/SSD。
- `Link`: 有连接端点/双工/拓扑、带宽、固定延迟的物理/逻辑链路；双工 Link 可供双向遍历，full duplex 的两个方向各有自己的容量账本，half duplex 双向共享；一个跨机消息映射到路径，不是仅“网络带宽”一个数。
- `ContentionDomain`: 如 PCIe Root、NUMA Host I/O、内部交换机、NIC 上行或跨机 Fabric 的共享容量域；每个域自身有 `capacityBitsPerSecond`、`duplex`、`arbitration`，多个 Link 可归于一域。
- `Rank`: 单个进程/设备上的执行参与者；可带多个并行维度成员身份（TP、EP、DP、PCP、DCP、PP）。
- `EngineInstance`: 一个 Prefill、Decode 或 Mixed 引擎；含 Scheduler、KV Manager、Rank groups；DP replicas 可有独立调度器/缓存。
- `ModelProfile`: layer/tensor/attention/MoE/quantization/kv-layout 的描述，除已知值还含 provenance。
- `Workload`: 请求到达事件、ISL/OSL、Prefix Fingerprint、Agent conversation/turn、工具等待、生成规则。
- `Operation`: 计算、读写 HBM、CPU↔HBM copy、P→D transfer、all-to-all 等具有依赖和资源要求的操作。
- `Event`: 离散事件队列里发生的开始、完成、调度触发、分配/释放/命中、抢占等；Event 是真实状态改变的依据。

## 3. 硬件抽象（容量 ≠ 带宽 ≠ 可用率）

1. 显存和内存使用字节（`bytes`）表达，显示 KiB/MiB/GiB；网络标称速率使用 `bitsPerSecond`，计算前转换为 `bytesPerSecond` 并记录编码/协议有效率；不可混用 GB、GiB、Gbps。
2. 每个加速器必须有 HBM `totalBytes`、`reservedByOtherBytes`、`runtimeBytes`、`workspacePeakBytes`、`graphCaptureBytes`、`communicationBufferBytes`、`weightResidentBytes`、`kvReservedBytes`。
3. `gpu_memory_utilization` 是**框架对设备显存预算的参数**，不是“KV 占 HBM 的比例”。优先由显存预算扣除权重、运行时等得出可用 KV；若指定 `kv_cache_memory_bytes`，按兼容版本规则处理显式覆盖。
4. Host Memory：NUMA 归属、普通 DRAM 和可固定页内存预算、可用容量、Host Memory BW、PCIe/NPU 专用 DMA、页固定和复制缓冲区，不把所有内存都视为“同速池”。
5. 设备间 Link：同机内连（NVLink/NVSwitch/HCCS/PCIe）与跨机网（NIC + Switch + Fabric）分开表示，允许非全互连、多个连接共享上游出口。
6. 链路配置包括 `nominalBandwidth`, `efficiency`, `baseLatency`, `contentionDomainId`, `maxConcurrentOps`, `duplexMode`；**ContentionDomain 另有共享总容量**。每个传输同时占据自身 Link 与所属共享域，不能将同一 NIC/交换机出口在多个 Link 中重复计算可用带宽。
7. Full-duplex Link 可以双向路径遍历，但须分别计正向/逆向限额；Half-duplex 两方向争用同一额度。对不同 NIC/RoCE 通道，真实端到端可达带宽由实际 Path + Domain 决定。
8. DMA 拷贝操作应同时占用数据源 HBM read/host read、目的地写带宽、对应链路和 DMA 引擎；避免双算和无限并发。
9. 可先实现 `serialized` 和 `processorSharing` 两种共享资源策略。M3 支持最小可行流体公平分享，时间步/事件队列重新估计剩余字节数（不能让已在飞行中的数据因带宽变化而“时间倒流”）。
10. 模拟采用资源 token/租约，而不是每个资源设置简单 `utilization=100%`；资源上限、队列、累计 busy time、等待原因必须可解释。
11. 模型计算使用独立资源能力描述，计算 FLOPs/s 与 HBM bandwidth 至少分开；缺少数据则用**明确标记的合成参数**或 `unavailable`。

## 4. 模型权重与显存预算

### 4.1 权重不能粗暴按 P/TP 一除

`weightBytes(rank)` 使用一个通用 `TensorPlacement` 列表（tensor name/layer/shape/dtype/quantizer/scales/partition rule/ranks），逐 Tensor 计算部署后每 Rank 驻留的 bytes：

- `replicate`: 每 Rank 完整副本；
- `shard(axis, group)`: 张量按 group/ranks 划分，允许 padding；
- `expertPartition(expertIds, replicaCount)`: Expert 和冗余 Expert 指定到 Rank；
- `pipelinePartition(layers)`: 层切分到 PP Rank；
- `opaque(measuredBytesPerRank)`: 当框架确切布局复杂时优先使用经测量的每卡驻留数据。

所有 Tensor 都允许附加 metadata/scale/alignment 与运行时 Buffers。未知时返回 `unavailable`，不伪造数值。运行时和通信 Buffer 不能全归给模型权重。

### 4.2 预算基本表达式

```
hbmBudget(rank)  = physicalHBM - otherProcesses - reservedHeadroom
hbmUsed(rank)    = residentWeights + graphRuntime + activationWorkspacePeak
                   + commBuffers + allocatedKVBlocks + activeTransferBuffers
hbmSlack(rank)   = hbmBudget(rank) - hbmUsed(rank)
```

实现时区分 `reservedBytes` 与 `resident/committedBytes`：KV 预留池可在 startup 预分配，而物理使用是另一个概念。**不得把 KV pool reservation 和 pool 中已分配块重复算为 HBM 占用**。建议两种视图：预算视图（预留）与占用视图（pool used/free）；在有 KV Pool 预留时 HBM used=weight+runtime+KV pool reserved，KV block used 是该 pool 的内部状态。

`max_model_len` 表示单序列长度约束（通常包含输入与生成），不等于可供任意数量请求使用的 KV 总池大小。

## 5. KV Cache 模型

### 5.1 统一注意力存储布局

- `MHA/GQA`: 理论单 Token 全模型 KV Bytes（未考虑分片/对齐）=`2 × L × H_kv × D_head × bytesPerElem`，前提每层一致、K/V 精度一致、无特殊窗口；分层差异必须求和。
- `MLA`: **不能使用上述 K/V Head 公式**。采用 per-layer `kvLatentDim`, `ropeDim`, `dtype`, `layout`, cache group，按实际存储张量构成计算；若缺少形状，则要求手工填写 `measuredBytesPerTokenPerRank` 并注明来源。不是所有 MLA Rank 之间 KV 一定复制，需用 layout policy/测量确认。
- `SFA/DSA/hybrid/window`: 按 Layer Cache Group/滑动窗口/稀疏策略分开。未知行为不得按照传统 MHA 拓展。
- 物理每卡 KV：**per rank/per group** 按本地存储的 Block 数 × 对齐后的 Block Bytes；DCP/PCP 的分片映射规则必须由对应 adapter 明确定义。
- KV Block 包括 `id`, `pool`, `capacityTokens`, `requestRefs`, `state`, `hash`, `lastUsed`, `location`, `generation`, `bytes`；生成数可用于防止释放后旧引用被复用。

### 5.2 KV 状态机

```
FREE → RESERVED → PARTIAL → COMPLETE
                          ↓
                   CACHED_ACTIVE ─┐
                          │       │ ref==0
                          ▼       ▼
                     REUSABLE → EVICTING → FREE
                          │         ↕
                          └→ OFFLOADING → HOST_RESIDENT
                                            │
                                            └→ LOADING → GPU_RESIDENT
```

说明：上图是**逻辑抽象**，具体 connector 的淘汰/拷贝时间与 GPU Block 是否同时保留由策略决定。真实代码中用 orthogonal 状态：`computeState`, `location`, `refs`, `transferStatus`，避免状态组合爆炸。

严格约束：

- 只有 hash 确认且内容完整的 Block 才能做 Prefix 命中；Prefix 必须从首块连续匹配，不能任意复用中间块。
- Request 的 KV Block 索引需要在所属 Cache Group 上有效；引用计数不能为负。
- GPU↔Host 传输未完成前，不可将目的 Block 标为 READY；重用/覆盖传输源必须遵守 Copy 生命周期。
- Offload 不代表每次 KV 用完就 Swap，Prefix Cache reuse、active KV、preemption/recompute 属不同策略。
- Active 请求缺少 KV 时，应根据策略进入等待、重算、或取消；不得凭空恢复。
- 支持 Block Size 16/32/64/128 等**不强制平台支持**，以 adapter 能力检查；分配粒度影响内部碎片及命中边界。
- Block Hash：`parentHash + blockTokenIds + extraIdentity`（模型版本、LoRA 等可能相关）构成完整前缀身份；为节省内存，仿真可用确定性 fingerprint，不必保存所有原始 Token。
- 淘汰策略需定义：无引用缓存块 LRU 简化版；可增加 vLLM 版对应 Hash/Free Queue/Usage 规则。每个策略带 `fidelity` 和官方对照。

## 6. 统一请求与调度

### 6.1 请求作为一个轮次

Agent 对话中每一轮模型调用是**独立 Request**。工具等待发生在前一轮完成和下一轮到达之间，不应无依据地一直占用 GPU KV。已完成的 Prefix Blocks 能否保留、被别人复用、或已卸载，由缓存策略决定。Prefix key 以真实的共享 token prefix fingerprint 表示，不能让所有随机请求共享同样完整上下文而虚构命中率。

### 6.2 Scheduler state（V1 子集）

```
ARRIVED -> WAITING -> RUNNING / WAITING_FOR_REMOTE_KV
                    -> PREEMPTED / RESUMING -> RUNNING
                    -> FINISHED / REJECTED / CANCELLED
```

`RUNNING` 请求不强制区分硬编码 PREFILL/DECODE 两条队列；根据 `numComputedTokens`、`numTokensWithSpec` 和当前被分配的 token 来判断执行工作类型。V1 调度以每轮 Token Budget 为主要约束，同时受最大序列数、KV 分配能力及策略影响。

定义 `max_num_batched_tokens` 为单调度迭代的 token 预算；`max_num_seqs` 为一次迭代最多处理的序列数（部分新版本另有 `max_num_active_seqs` 等更细分参数，应交由 adapter）。不要写成“全局并发连接数”。

简化的调度逻辑：

1. 对已在 RUNNING 队列中的请求，根据需要计算可调度 token，检查剩余 token/seq budget + KV block。
2. 预算足够时继续推进它们（通常优先满足 Decode）；KV 不足按配置化策略抢占（V1 默认 RECOMPUTE），回到 WAITING。
3. 再考虑等待中的请求，先做 Prefix KV 查询/恢复，按预算和 KV 容量 Chunked Prefill。
4. 生成每轮各 Request 的 `numScheduledTokens`；由可用的计算/内存/通信资源决定对应操作完成时间；下一轮触发事件。
5. 将采样/输出/状态推进写成单独的 `StepCompleted`，首 Token 的时间戳包含必要的执行与输出处理延迟。
6. `max_model_len`、OSL / ISL、动态扩展与超额情况必须显式处理（reject/truncate 配置化）。

**优先目标是 vLLM V1 的可解释子集，不是复制其全部调度代码。** 固定使用官方源码测试中简单样例作为参考 golden fixtures，并记录与真实行为的差异。

### 6.3 请求生成与负载

- `fixed`: N 请求同时到达；
- `poisson`: 固定 seed 的指数到达间隔，输入 QPS；
- `trace`: 显式 absolute arrivalTime, ISL/OSL, prefix IDs, conversation ID；
- `agent`: conversations × turns，每轮有 prompt diff、shared system prefix、history prefix、tool wait、cache affinity；可选择跨轮稳定指向同一 DP replica 或改变路由。

输出长度是模拟预设或从数据集得出，并不预测模型实际生成内容。统一记录 `logicalInputTokens`, `computedPrefillTokens`, `cachedInputTokens`, `generatedTokens`, `transferredKVBytes`，不能混为一谈。

## 7. 操作与资源成本模型

### 7.1 原子操作

```
ComputeOp(deviceIds, modelOp, flops, hbmBytesReadWrite, dependencies)
TransferOp(srcPool, dstPool, bytes, pathLinkIds, dmaEngineIds, deps)
CollectiveOp(groupRanks, type, messageBytesByEdge, path, deps)
AllocateOp(memoryPool, bytes, owner, deps)
CacheLookupOp(prefixHash, cacheGroup, deps)
CPUOp(cpuNode, workUnits, deps)
```

### 7.2 时间模型与精度级别

`T_compute` 可从已知 kernel curves 内插；没有曲线时用教学近似 `max(FLOPs/achievableCompute, HBMBytes/achievableBW) + launchOverhead`。此近似仅为操作下界/理想条件的启发，不得当作实测算子时延，且所有效率参数必须显式显示为假设。对于一些通信/访存与计算部分重叠的算子，需通过操作依赖/DAG 表示，不能统一做 `sum()` 或 `max()`。

`T_transfer` 至少包括 `fixedOverhead + bytes / effectiveBottleneckBandwidth`；竞争时依据仲裁器动态改变剩余传输时间。Collective 使用配置化的 ring/tree/all-to-all cost strategy，允许直接输入测得的分组规模 × 消息大小 → latency/bandwidth 曲线。跨机 P→D 至少经过 HBM→NIC→Fabric→NIC→HBM（若平台实际数据路径不同，以 profile 显式覆盖），不能默认数据都经过 CPU DRAM。

定义模拟分级：
- `L1/structural`: 正确资源拓扑和分片，但不产生时间预测。
- `L2/analytical`: 容量严格计算、传输量与理论下界、简化成本模型，数值标记“假设”。
- `L3/discrete_event`: 资源与调度竞争 + 关键路径，仍是模型估计。
- `L4/calibrated`: 从相同设备/内核/模型/配置区间测量曲线校准。超出区间时降级告警，不外推假装精确。

### 7.3 竞争和重叠

- 采用 `ResourceScheduler.acquire(resources)`，资源需求可为多维向量；操作必须同时满足依赖与资源可用才开始。
- GPU compute、HBM BW、DMA、collective、CPU、NIC、Fabric 在模拟中是独立维度；允许共享资源时发生竞争，是否重叠由策略表决定。
- M2 先实现阶段式资源租约，M3 再引入共享带宽/有界并发；禁止在同一版本里用不同计算方法对某种链路“默认无限带宽”。
- 跨机拓扑必须按 Link Path 识别 NIC/交换机上行拥塞，而非每条逻辑连接一份独享总带宽。

## 8. 事件引擎（纯函数 + 确定性）

事件包括 `REQUEST_ARRIVED`, `SCHEDULE_TICK`, `PREFIX_LOOKUP_DONE`, `KV_ALLOCATED`, `COMPUTE_STARTED`, `COMPUTE_DONE`, `TRANSFER_STARTED`, `TRANSFER_COMPLETED`, `TOKEN_EMITTED`, `BLOCK_CACHED`, `BLOCK_EVICTED`, `PREEMPTED`, `REQUEST_FINISHED`, `RESOURCE_UPDATED`。

规范：

- `timeUs: integer` 用微秒虚拟时钟；同 timestamp 用 `(timeUs, priority, sequenceId)` 稳定排序。
- 重放需要 deterministic seed + Scenario fingerprint + Engine version；禁止执行过程中使用 `Math.random()` 或真实墙钟时间。
- Worker commands: `VALIDATE`, `PLAN`, `RUN`, `PAUSE`, `SEEK`, `SET_PLAYBACK_SPEED`, `CANCEL`, `EXPORT`；`SEEK` 应利用 checkpoint（如每 1000 事件）从最近 checkpoint 回放，不逐次重算。
- 每个事件有 `causeEventIds`、`requestId?`、`deviceIds`、`resourceIds`、`provenanceId`。重放事件不可原地修改；UI 用只读快照。
- 防止重入与事件爆炸：最大事件数/最大虚拟时间/最大请求数，超出时友好终止并产生报告；大量 Token 按 Batch/Phase 聚合事件，并保留请求级 token emission timestamps 以计算 TPOT。
- 所有资源申请/释放通过账本 Ledger；回放必须保持守恒。Pending 资源等待需要有明确 `blockedBy`。
- 若模拟引擎将执行时间置为 `unavailable`，只允许结构预览或使用用户显式启用的假设值；不要悄悄用 1ms。

## 9. PD、KV Offload 与 Host↔HBM 传输策略

建议独立 `KVTransportStrategy`：

- `GPU_LOCAL`: 同一实例本地 KV；
- `CPU_OFFLOAD`: 完整块在满足策略时 offload 到 pinned/host tier，并可按 hash 命中 reload；
- `PD_PULL`: P 结束必要计算后 D 请求 KV，D 等待数据 ready；
- `PD_LAYERWISE_PUSH`: 层级生产/传输相互重叠，最终必须等所需全部 KV ready 才可 decode；
- `PD_HOST_STAGING`: P→D Host（DRAM）→D HBM，阶段可重叠但必须遵守容量及传输顺序。

每条策略要提供：触发条件、可搬运的对象、byte layout、源与目的物理 Rank Mapping、Transfer Op、何时释放源 Block、错误/超时状态和对 TTFT 关键路径的贡献。**不能把 Offload、KV Transfer 与抢占 Swap 混为一谈。**

## 10. 并行策略层：从“乘法”升级为显式 Group

- `TP`: 按 Tensor 分片与组内 collective；
- `DP`: 每副本的请求调度/权重驻留/KV；调度入口独立配置路由、可选 sticky affinity；
- `EP`: Token→Expert dispatch/combine 与专家放置，可能与 TP/DP 混合共享 Rank，绝不能直接 `world_size = TP × DP × EP`；
- `PP`: Layer 分区和跨阶段 Activation；作为后续插件；
- `SP`: 需要区分训练/推理的 Sequence Parallel（TP 相关 activation 分布）与 PCP/DCP 的上下文并行，命名与说明必须明确；
- `PCP`: Prefill 计算沿 Token 轴分片，可能增加物理 Rank，依框架策略；
- `DCP`: Decode 的 KV 沿上下文轴跨 Rank 分片，特定实现可复用 TP/PCP Rank；
- `DCP/PCP` 的 rank 增减、组合、KV layout 均由 `BackendFeatureAdapter` 决定。
- `P/D`: 两个可独立拓扑的引擎组；多个 P、多 D 的路由器与缓存亲和在 M4/M5 扩展。

## 11. 特性矩阵与版本

`FeatureRule` 至少由 `framework`, `version` or `commit`, `deviceFamily`, `modelAttention`, `attentionBackend`, `runner`, `graphMode`, `kvConnector`, `feature`, `withFeatures[]` 共同选择结果。返回 `supported`, `partial`, `unsupported`, `unknown`，附 `reason`, `source`, `verifiedAt`。

不允许用户将 `unknown` 一键视为官方支持。允许进入“教学假设模式”，但与真实部署可行性分开显示。每个 adapter 必须绑定文档/tag/commit，不能仅引用 mutable `latest` 作为固定规则来源。

## 12. 性能指标和根因解释

- `TTFT(client)` = first received token - client send，包含网络与 API 处理；`TTFT(server)` = first generated/emitted token - engine arrival；不能混为一谈。
- `ITL[i]` = token[i] - token[i-1]；`TPOT` 常用 `(last - first)/(N_output-1)`，输出 Token 数<=1 时 N/A；同时报告每 Token 耗时均值/P95。
- QPS/RPS、input TPM、actual computed prefill TPM、output TPM、output TPS、端到端延迟 P50/P95/P99、queue wait、KV hit/reload/evict、内存峰值、按链路传输字节与 busy time。
- `rootCause` 不由固定话术猜测：从 Request critical path 和资源等待事件生成证据链，如 `request→blockedBy HBMLoad → waiting for shared PCIe 32% of simulated TTFT`；若时序模型未校准，解释前缀必须注明“仿真假设下”。
- 解释分离“结构结果”“模型估计”“真实测量”；数值展示必须拥有 `confidence`/`provenance`。

## 13. 安全性、可维护性与性能边界

- 所有导入 JSON/CSV 都先 schema validate、文件限额、字符串长度限制、过滤危险 HTML；绝不执行导入脚本。
- 默认无外发；无需用户账号；不储存访问令牌；`localStorage` 只存偏好，IndexedDB 可存场景/实验。
- 仿真预算：单次最多 1e5 request events（可配置）；引擎检测事件循环中 zero-time livelock；超过预算有可读错误。
- 大规模显示：拓扑 Canvas 或 SVG 虚拟化，事件回放可抽样；内核计算与 DOM 完全解耦。
- 关键代码要有 API 接口、注释、单元/属性测试，禁止把模型规则散落在 React components 内。
