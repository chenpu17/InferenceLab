# 06 · 测试策略、真实性与风险控制

## 1. 正确性优先于漂亮的数字

项目必须能回答“这个数字是如何得来的”。模拟的内存和资源守恒是硬约束；真实运行速度只能在相应数据与模型证据齐备时估计。任何场景要有 `accuracyTier` 和每个 Metric 独立的 `quality`。

| 规则等级 | 示例 | 必须满足的验证 |
|---|---|---|
| 数学/结构精确 | TP/DP Rank 分组、Block rounding、GB/GiB、Byte/bit 换算 | 单元测试 + 性质测试 |
| 简化机制子集 | vLLM V1 Chunked Prefill、Cache 连续 Hash、Recompute | Golden step fixtures + 源码差异文档 |
| 仿真假设 | Kernel rate、HBM achieved BW、Link effective bandwidth | 假设被显示，可修改，敏感性测试 |
| 实测校准 | 固定模型/硬件/版本/Batch 的 latency curve | 数据来源、采样区间、误差校验 |

## 2. 核心不变量（必须在开发模式启用断言）

- `sum(unique physical allocations on rank) <= capacity budget`，永不负数；KV pool 内部 `free + used = reserved`，不得与外层 HBM 重复相加。
- `refCount >= 0`；FREE block 不能被任何 Active Request 引用；Block generation/owner 与 request table 一致。
- Prefix 命中从开头连续匹配且只使用**已完成块**；Block Size 与 token position 对齐。
- GPU/Host/SSD 传输中：source ready、target reserved、完成后 target ready；若目标不可达不得启动，异常能回滚/中止。
- D 请求的 decode step 所需 KV 已在其 Attention Layout 中 ready。
- Token 计数守恒：`requestedCompute = completedCompute + scheduledOutstanding + queuedRemaining` 按适用状态细分；完成 Token 不因重放重复累计。
- `max_num_seqs` 和 `max_num_batched_tokens` 的单 step 限额不能超限（按选定 adapter 的准确规则），特殊 spec tokens 明确入预算。
- 每个 Rank 只能指向存在的设备；每个 transfer 的 path 包含有效链接；流量峰值同时受 Link 和 `ContentionDomain` 上限限制，full/half duplex 的方向资源互不混淆。
- `timeUs` 不倒退；对同时间事件排序稳定；相同 seed + same snapshot produces identical output。
- 未知硬件带宽、量化布局、MLA KV 表达式时，指标必须 `unavailable`，不能默认为 0 或 1。
- `TPOT` 当 `outputTokens <= 1` 时必须是 null/N/A。
- 工具等待期内不存在延续上个请求的 RUNNING slot，除非专门实现且显示有依据的“会话保持策略”。

## 3. 单元/性质测试建议

### Units
- 100 Gbit/s = 12.5e9 bytes/s（未扣协议开销）。
- 1 GiB = 2^30 bytes，1 GB = 10^9 bytes。
- 浮点百分比容量输入不产生负数或 NaN；大值避免 `Number.MAX_SAFE_INTEGER` 溢出。

### Rank/Topology
- TP16 DP2 on 32 devices：2 个 Replica，每组 16；TP8 DP4：4 个 Replica，每组 8。
- 重复设备 / 缺失设备 / 重叠 Rank invalid（除显式共享策略）。
- `EP` 不默认 `TP×DP×EP` 乘法扩容；需要显式 ExpertPlacement。
- PCP/DCP rules 以版本/后端条件测试；unknown 必须展示 unknown。

### Memory/KV
- 在 Toy MHA（2 layers, 2 KV heads, head dim 4, FP16 K/V）中，理论每 Token 全模型 KV = `2 layers × 2(K,V) × 2 heads × 4 × 2 bytes=64 bytes`。
- BlockSize16 ⇒ 单 Block 原始 KV 1024 bytes（未考虑 align/分片）；该值仅用 toy 公式。
- 2 个 Request 共享前 2 个完整块，第三块不同：只能命中 2 块。
- 先分配后完成传输，目标不提前可读；淘汰 LRU 不破坏被引用块。
- 小 KV 池触发 WAITING/PREEMPT，HBM 使用不超额。

### Scheduler
- 两个 6 token prompts、budget=8、seqs>=2、Chunked Prefill 开启、无 decode 和 cache hits，Step1 6+2，Step2 剩余4。
- 开关 Chunked Prefill 导致策略差别；不能将多轮 Agent 的工具等待当作运行中 decode。
- 执行 `run()`, `pause()`, `seek()`, `resume()` 后 terminal state 与直接 `run()` 相等。
- 有序请求随机 seed 固定输出一致；超额序列按 policy 进入 WAITING。

### Communication/Resources
- 两个传输共享单 10 GB/s 资源，持续时间/吞吐受该域容量约束；无共享时允许并行。
- Host HBM Offload 分配在 Host 和 GPU 两侧的空间按生命周期检查；每次 Load 正确计算带宽与资源占用。
- Layerwise Push 的 Decode 不能早于所有必需 KV Layers Ready；允许 Transfer 与 Prefill 执行部分重叠。
- 100 Gbps→12.5 GB/s，无混淆 Gigabit vs GigaByte。

### Metrics
- TTFT(server)/TTFT(client) 不应混淆；输出1 token 的 TPOT = N/A。
- P95 计算方法统一写在代码文档中，测试 1/2/5/100 个样本且确定性。
- 8K 逻辑输入 + 6K 缓存命中，模型实际处理 prefill 部分不应被统计为全部 8K。

## 4. Golden Fixtures（测试参考结果）

- `fixture-topology-32tp16dp2.json`；`fixture-topology-32tp8dp4.json`。
- `fixture-sched-budget8.json`，断言每 step scheduledTokens。
- `fixture-prefix-two-blocks.json`，断言命中、分配、Ref Count、末态。
- `fixture-kv-insufficient-recompute.json`，断言前后队列及被抢占 token 状态。
- `fixture-offload-hbm-dram.json`，断言内存水位和 Transfer DAG。
- `fixture-pd-pull-wait.json`，断言 D 侧无 KV 前不能 decode。
- `fixture-agent-two-turns.json`，断言两次独立 Request、工具等待、共享 Prefix。

以上为推荐由 Coding Agent 实际创建的 fixture 文件，不假称设计包已生成 golden outputs。对于真实 vLLM 版本的 Golden 验证，应先使用一份固定官方源码/测试用例，标注 `subset` 的偏差。

## 5. 测量与校准

- 收集至少：硬件型号、驱动/CANN/CUDA、vLLM tag+commit、模型权重 revision、quant scheme、Attention backend、graph mode、P/D topology、load shape、warm/cold、prefix hit、TTFT/ITL/TPOT/throughput。
- 带宽/BW 测量须区分单流 vs 多流、同机/跨机、Host staging；将理论上界与实际观察值分层存储。
- 不用设备名匹配校准曲线；必须同时匹配执行模式/模型形状、库版本/量化等。
- 插值优先单调分段或最近邻并标注区间；不允许跨多个数量级盲目外推。
- 建议用相同 workload seed 的 A/B 差异评估，不依赖绝对值，仍需要说明瓶颈模型可能不完整。

## UI 三门禁（v1.1 补充）

在每个里程碑执行 `docs/11-UI-ACCEPTANCE.md`：机制正确性 + 可实际操作性 + 视觉可理解性三者必须同时达标。Playwright 需要保存 1440×900/1280×800 截图，M1/M2 均提供可回放录屏；用户可从一次请求等待回溯到具体 KV Pool 或 Link，而不是只有表格和警告。

## 6. 全栈质量门禁

| 门禁 | 标准 |
|---|---|
| Type check | TS strict 无错误 |
| Unit/property | 核心不变量全部通过，重要缺陷必须有回归用例 |
| Browser E2E | 导入场景→编辑→Run→Pause→Inspect→Export 全流程可用 |
| Reproducibility | 相同配置/版本/seed 输出一致 |
| Explainability | Metric 具有单位、来源与边界；等待可追溯到 Resource |
| Static deployment | `vite build` 输出可直接部署，刷新 Hash routes 可用 |
| Graceful unknown | 未知硬件/模型数据不显示虚假准确结果 |
| Performance | 48 req × 1K OSL 不冻结 UI；事件流具备限制与聚合机制 |
| Accessibility | 主要控件能键盘操作；动画能关闭/减速 |

## 7. 风险与应对

| 风险 | 应对 |
|---|---|
| vLLM 版本变化快 | Adapter 绑定版本/commit、Feature Rule 和证据日期；禁用无依据推断 |
| 复杂并行布局推断错误 | M1 只做简单 TP/DP；MLA/EP/PCP/DCP 引入独立映射与 Golden 测试 |
| 虚构硬件性能 | `unavailable` 或合成 Profile；显示假设；实测后才提升等级 |
| 动画性能慢 | Worker、checkpoint、事件抽样、Canvas 批绘制、E2E 负载测试 |
| CPU 内存/HBM 双计数 | 外层 Pool reserve + 内层 Block usage 两层账本，统一 Unit Tests |
| Agent 扩散需求 | 严格 milestone、每个 PR 单一机制、功能门禁、已知限制文档 |
| 多轮 Prefix 虚假复用 | 前缀 fingerprint 连续匹配；基准请求具备真实变更/分支/工具等待 |
| 模拟时间偏差 | 关键路径 DAG 与来源标签；区分模拟/真实；校准范围受限 |

## 8. 项目完成的定义

M2 完成后可以称“机制级 MVP”：在静态网页上看 TP/DP/显存/调度/KV 的真实事件变化；**不能宣传为准确的 GLM-5.3 + Ascend A3 性能优化预测器**。M3 以上才可以研究 Host↔HBM 和 PD 关键路径；M5 校准通过才讨论真实平台的性能数值参考。
