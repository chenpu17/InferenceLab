# 08 · 参数知识库与仿真映射（Agent 扩展指南）

> 原则：**参数名是框架/版本接口，模拟语义是独立规则**。表中的参数名均应在对应固定 release/commit 下核验；未核验的、`additional_config` 内部选项、后端特有选项不得作为“所有版本均支持”的通用 CLI。支持等级按 `implemented`、`documented-not-implemented`、`backend-dependent`、`unknown` 标记。

## 1. 参数元数据设计

```ts
interface ParameterInfo {
  key: string;
  cliFlag?: string;
  configPath: string;
  scope: 'model'|'hardware'|'engine'|'rank'|'cache'|'scheduler'|'transfer';
  valueType: 'integer'|'float'|'boolean'|'enum'|'json';
  units?: string;
  summary: string;
  updates: string[];                 // 被改变的核心资源/规则
  observables: string[];             // 可以观察的结果
  ruleId: string;                    // 不在 UI 中写 if-else
  rollout: 'M1'|'M2'|'M3'|'M4'|'M5';
  featurePredicates: string[];       // framework + version + model + backend + hardware
  validationRuleIds: string[];
  sources: Array<{url:string; version:string; verifiedAt:string}>;
  status: 'implemented'|'documented-not-implemented'|'backend-dependent'|'unknown';
}
```

页面点击参数名，不只是展示定义，还应有：**变量作用图、影响方向不确定性、相关资源、展示哪些指标会变、关联的兼容规则、可开启的实验场景**。

## 2. 硬件/拓扑参数

| 参数 | 直接改变 | 需要观察 | 阶段 |
|---|---|---|---|
| Device count / type | 可用卡、HBM 容量与计算资源 | 物理 Rank 占用、模型驻留可行性 | M1 |
| HBM capacity | 单卡资源预算 | weights/kv/runtime 峰值、OOM | M1 |
| HBM bandwidth | 访存服务速率 | Decode memory bottleneck、等待、可达下界 | M3 |
| Compute throughput by dtype | 算子计算资源 | Prefill/Expert kernel cost | M3/M5 |
| Host DRAM + NUMA | Host 可用容量、可达带宽 | Offload pool 与 Host 缓冲竞争 | M3 |
| PCIe / host interconnect | HBM↔Host 的传输路径 | H2D/D2H 时长和竞争 | M3 |
| NVLink/HCCS/peer path | 卡间 collective 路径 | TP / EP 通信资源与关键路径 | M3/M4 |
| NIC / switch / fabric | 跨机路径/共享链路 | P→D KV、EP A2A 的带宽竞争 | M3/M4 |
| DMA engines / copy concurrency | 同时搬运数/排队 | overlap、滞后等待 | M3 |

**约束**：硬件标称上限 ≠ 真实 achieved bandwidth。必须带有效率假设和测量来源；任何未知量不能隐式设为无限大。

## 3. 并行与部署参数

| 参数 / 概念 | 机制 | 需要重新计算 | 阶段 |
|---|---|---|---|
| `tensor_parallel_size` | TP 分片与 collective | Rank Group、Weights、KV layout、通信 | M1/M4 |
| `data_parallel_size` | 独立副本/调度/缓存 | 副本、分配卡、路由、每副本请求 | M1/M2 |
| `enable_expert_parallel` 及 EP group | Expert placement/dispatch | Expert 驻留、TopK A2A、热点 | M4 |
| `pipeline_parallel_size` | Layer 分段与 activation flow | PP stage、layer weights、pipeline bubbles | M4 |
| Sequence Parallel (SP) | 特定后端 Activation/Sequence 分片 | Activation/collective | M4 |
| `prefill_context_parallel_size` | PCP 分割长 Prefill | Rank 数/调度/通信/权重布局 | M4 |
| `decode_context_parallel_size` | DCP 分片 KV | per-rank KV、Q/Attention 合并通信 | M4 |
| `cp_kv_cache_interleave_size` | DCP KV 交织粒度 | Cache Layout/传输对齐 | M4 |
| Fine-grained TP options | 部分 module TP 不同 | 每个 module 权重和 collective | M4 |
| PD nodes / P:D ratio | P/D 侧资源池独立 | Prefill capacity、Decode capacity、KV Transfer | M3 |
| DP routing/affinity | Request→Replica | Cache 复用、队列均衡、DP 热点 | M2/M3 |

注意：以上是**可建模参数族**，并不是所有框架版本都存在上述完全相同的 CLI 名称。尤其 EP、SP、PCP/DCP 组合受 Attention Backend 和硬件限制。

## 4. KV / 内存参数

| 参数 | 直接改变 | 错误实现示例 | 阶段 |
|---|---|---|---|
| `gpu_memory_utilization` | 整体框架显存预算 | 把 0.9 当作“KV Cache=90% HBM” | M1 |
| `kv_cache_memory_bytes` | 显式每卡 KV Cache 预算（依版本支持） | 与 gpu_memory_utilization 强行叠加 | M1/M2 |
| `block_size` | KV Block 粒度/碎片/Hash 命中边界 | 仅画块大小变化却不改变分配 | M2 |
| `max_model_len` | 单请求长度验证 | 当作整个实例最大并发 Token 容量 | M2 |
| `kv_cache_dtype` | KV 单元 bytes、某些 Kernel 支持 | 默认“权重 dtype 就是 KV dtype” | M4 |
| Prefix Caching 开关 | Prefix hash/复用/refs | 所有请求均自动命中 | M2 |
| KV Offload connector | Host tier、load/store/eviction | 与 active swap 或 PD transfer 混淆 | M3 |
| `kv_offloading_size`, backend | Offload pool 与后端选择（需验证适用） | 不考虑 host pressure 和 transfer bandwidth | M3 |
| CPU weight offload | 模型权重分层驻留 | 混成 KV offload 的缓存空间 | M4 |
| KV transfer config | P/D 等 KV Connector 的路径/时机 | Transfer 尚未完成即 Decode | M3 |
| Graph/Workspace allocation | HBM 固定/峰值预算 | 忽略 CUDA/CANN 图捕获内存 | M1/M4 |

## 5. 调度参数

| 参数 | 关键意义 | 需要观察 | 阶段 |
|---|---|---|---|
| `max_num_batched_tokens` | 每 step Token Budget | Chunked Prefill 分块、Decode/P 延迟竞争 | M2 |
| `max_num_seqs` | 每 step 执行序列上限 | Scheduled vs Waiting，图容量相关性 | M2 |
| `max_num_active_seqs` | 部分新版本额外 RUNNING Admission 上限 | 调度 Admission 与 Runner Capacity 差异 | M4 |
| `max_num_scheduled_tokens` | 部分新版本的调度实际 Token 限额 | Spec/采样附加 token 时的差异 | M4 |
| `enable_chunked_prefill` | Prefill 可拆多轮 | Prefill/Decode 混合与排队 | M2 |
| `scheduling_policy` | FCFS / priority 等 | Preemption 与队列选择 | M2/M4 |
| Prefill interval / threshold | 长 Prefill fairness / throttling | Decode 抢占与尾延迟 | M4 |
| Inflight KV load limit | async 预读KV 的控制 | KV load 候选数/内存预留/延迟 | M4 |
| Queue limits | 入口队列/过载拒绝 | Rejection、Backpressure、P95 | M4 |
| Worker/CPU resources | CPU tokenization/调度 | CPU 排队及 GPU 空转 | M3/M5 |

## 6. 算子/执行优化参数（M4/M5）

这类配置通常对硬件/模型/后端组合高度敏感。第一版不把它们做成“一键增加 20%”之类的滑杆。

- Graph Mode / Eager / Model Runner：变更 Host launch overhead、Graph capture 约束、峰值内存；需要 Profile 测量。
- MTP / Speculative Decoding / DSpark：增加 draft/verify 计算，改变每轮接受的 token 数；接受率是工作负载相关变量而不是固定收益。
- Attention Backend / Fused Kernels / Fused MC2：改变单算子计算/通信成本、是否支持 overlap；需要校准数据。
- MoE EPLB / expert redundancy：变更 expert 布局与利用率、显存/通信成本；热点与副本数量必须同时表现。
- Quantization W4A8/W4A4/W8A8/KV dtype：更改 per-tensor bytes 与 Kernel 计算效率，权重显存节省不代表计算按相同比例加速。
- Sparse Attention / MLA / DSA/SFA：改变 Attention 计算量、KV 结构、通信；不可用传统 GQA 公式概括。
- vLLM-Ascend `additional_config`：如 fine-grained TP、特定 rejection sampler、KVPP 等，先锁定版本、逐项源码/测试，再为每个配置编写对应的 `ParameterInfo` 和 `RuleId`。

## 7. 参数之间的因果关系图（首批）

### A. TP 变更

`TP ↑ → 权重 sharding 变化 → 每卡模型驻留变化 → KV 预算可能变化 → 抢占概率变化`；同时 `TP ↑ → collective group/message 布局变化 → 通信路径与延迟可能变化`。两条路径必须同时展示，不能只显示其中一条。

### B. DP 变更

`DP ↑ → 每副本加速器资源可能减少 → 模型驻留约束变化`；`DP ↑ → 独立 Scheduler/KVPool 增多 → 单副本排队可能减少`，但 `跨副本 Prefix 不天然共享 → cache hit 可能下降`。

### C. Offload

`Host cache capacity ↑ → 可容纳已计算缓存 ↑ → GPU KV eviction/recompute 压力可能下降`，但 `CPU Host hit → H2D transfer + buffer + DMA/bandwidth → latency / TTFT 增加风险`。系统需要通过事件判断哪条路径进入关键路径。

### D. PD 分离

`独立 P/D resources → 不同 TP/DP/Batch 配置 → Prefill/Decode 分工效率变化`，同时 `P→D KV bytes + NIC/PCIe contention + D-side KV waiting`；如果网络带宽升高却不影响 critical path，应显示增益边际减弱。

### E. Chunked Prefill

`batch budget 小 → 每轮 Prefill chunks 小 → Decode step 插入更频繁；但长 Prefill 轮数/等待可能增加`，需结合真实 workload 和 cost model，不能一概说“调大必然降低 TTFT”。

## 8. 加入新参数的验收步骤

1. Pin 上游 release/commit，并确认 parameter default / allowed values / preconditions。
2. 写 `ParameterInfo`、Feature Rule、Validator、Core transition 和单元测试。
3. 说明资源/状态受影响的具体机制；若只支持教学结构，不输出性能预测。
4. UI 展示 Tooltip、来源、支持范围、前后差异。
5. 用新旧版本数据复核变更，再更新本参数知识库。
