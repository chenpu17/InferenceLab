# 05 · AI Coding 分阶段执行与验收计划

> AI Coding Agent 严格按照里程碑实施；每阶段功能必须可以从浏览器真实操作，且 `pnpm test` / `pnpm build` 通过。

## 0. 开工纪律

- 首次开发不要把 02-ARCHITECTURE 全部做完；先完成垂直切片。
- 每个阶段都要更新 `CHANGELOG.md`、`KNOWN_LIMITATIONS.md`、`docs/DECISIONS.md`（关键取舍）。
- 未有官方可核实资料的硬件参数不可自行编造；使用 `toy` profile 演示，正式设备留待导入。
- 核心包与 UI 间不允许循环依赖；任何有语义的参数要有对应 validate/plan/run/metric/test 路径。
- 不写真实机器部署命令到产品主路径；若支持导出命令则加人工复核提示。

## D0 · WebUI 设计基线审核（M0 之前）

- 阅读 `04-UX`、`10-UX-STORYBOARDS`、`11-UI-ACCEPTANCE`、`12-AGENT-UX-FIRST` 和 `prototype/`。
- 输出 UI Screen Map、共享 selection/virtualTime 的状态图、1440×900 与 1280×800 两个视觉样稿；明确实体和事件如何渲染到像素。
- 评审通过才能进入 M0。注意本阶段是**视觉原型**而非引擎仿真；不从原型读取硬编码结果。

## M0 · 起步与契约（独立可交付）

### 工作项

- Vite React TS + pnpm workspaces；`apps/web`, `packages/core`, `packages/profiles`, `packages/adapters`。
- Tailwind + `04-UX` 统一设计 Token；统一 `/lab` 工作台布局、Observation Lens、共享选择/时间状态、暗色/浅色路由和主要空态。
- TS domain types、Zod/Ajv JSON validation、source/provenance / units helper、错误边界。
- 内置 `Toy 1node/4gpu`、`Toy 2node/32gpu` 合成 HardwareProfile 和 Toy Dense（至少一套能算权重和 KV 的完整 synthetic ModelProfile）。
- 编写导入/导出 Scenario JSON，默认场景持久化与 reset；通过固定样例回归校验。
- Vitest + Playwright + ESLint + TS strict + CI（GitHub Actions 可选）。

### 验收

- `pnpm install && pnpm dev` 可打开深色工作台，选择一个 Toy profile，导入/导出后场景完全一致。
- JSON Schema 错误、缺失 Profile、错误单位均显示明确信息而不是白屏。
- `pnpm test && pnpm typecheck && pnpm build` 全部通过；README 有运行方法；提交 UI 截图并通过 `11-UI-ACCEPTANCE` 的 D1 门禁。

## M1 · 拓扑 + 每卡显存（首个有价值的可视产品）

### 工作项

- PhysicalPlacement + group/replica/rank validator，确保映射不冲突。
- `TP × DP` **基本子集**：给定 N 张卡 + TP/DP，自动生成组；同时保留手动 Rank→Device mapping 的基础能力。
- TensorPlacement（replicate/shard/opaque），每 Rank 计算 weight bytes；KV GQA/MHA per rank（前提完整配置），静态 HBM 预算检查。
- 物理 Node、卡、Rank Group 画布；右侧 HBM Inspector；左侧 TP/DP 控制。
- 无法给出真实数据时显示 `unknown/assumption`，结构可看、具体显存评估禁用。

### 验收

- Toy 32 卡 TP16×DP2 ⇒ 2 组，每组 16 卡；TP8×DP4 ⇒ 4 组，每组 8 卡。Rank 不能重复映射同一个设备，除非声明共享设备规则。
- 一个缺少权重配置的 GLM 模板，UI 不得显示“显存足够”；一个超限的 Toy 配置必须准确指出 `deviceId` 和超限字节。
- HBM 视图清楚区分 `KV pool reserved` 与 `KV blocks used`，两者不会重复计入物理 HBM。
- 至少 12 个单元测试 + 2 个 E2E 测试；提交 S01/S02 的完整 UI 截图/演示并通过 D2 门禁。

## M2 · KV Block + V1 子集调度 + 事件回放（**MVP 结束点**）

### 工作项

- 确定性 virtual clock/event heap/seeded PRNG、WorkerBridge、可暂停/取消/回放的事件流。
- DP replica 独立 Scheduler/KV Manager；请求到达、Token Budget、Chunked Prefill、Decode、完整 Block 前缀共享、简单 LRU、refcount、preemption recompute。
- KV Block 组件：pool 状态、refs、连续命中、free blocks；失败时明确 `blockedBy`。
- Request/Batch 时间线及 Inspector；资源/调度指标（即使时间模型为合成值也标注）。
- Fixed、Trace、Agent 两轮负载（Agent 模式下共享前缀是真正按 token 指纹构造）。
- Checkpoint/replay、结果 JSON 导出、稳定 seed A/B 重放（先同一场景验证确定性）。

### 验收

- Scheduler budget=8，两个 6-token prompts 的单 Replica 场景：如果没有其他运行请求，第一轮调度 A6/B2、第二轮 B4。
- 先前 KV Block 内容一致 ⇒ 连续 Prefix hit；第三块不同 ⇒ 从第三块开始后续不得命中，即使更后面的 hash 碰巧一致。
- KV 不足 ⇒ 按选定策略预期的 WAITING/PREEMPT/RECOMPUTE，不能超额分配或负 refs。
- 同 seed 连续运行两次 EventLog 和 Metrics 完全一致；暂停-回放最终状态等于一次直接执行。
- 在浏览器对 48 条请求 × 1000 输出 Token 的合成场景可完成仿真，UI 不冻结；超大事件量可聚合。
- M2 发布一个静态 HTML/CSS/JS 构建目录（无后端）；用户可以完成 README 中的首个演示闭环。支持多次 Run 保存/切换与差异摘要，不要求完整 Side-by-side A/B 画布（M3）；通过 D3 UX 门禁。

## M3 · 多级存储 + PD 分离 + 网络（MVP 之后的第二重点）

### 工作项

- MemoryPool 层次与占用账本，Host DRAM、Pinned Budget、HBM DMA 及至少一条同机和跨机 Link Path。
- 资源可竞争与有限并发，transfer DAG 与关键路径；显示 HBM→DRAM→HBM、P→D 路径。
- CPU KV Offload（用于已完成缓存的写回和命中后的加载），不与活跃请求抢占互相偷换。
- PD_PULL / PD_LAYERWISE_PUSH / PD_HOST_STAGING 三个策略；不同版本/硬件组合需 Feature Rule。
- Request Waterfall、Link Inspector、完整 A/B Split 对比；链路争用例中的 Transfer 完成顺序/时长合理；通过 D4 UX 门禁。

### 验收

- 传输未完成，D 侧禁止进入 Decode；Transfer 中目标缓冲和源的生命周期符合约束。
- 100Gbps 链路在理想效率=1 时大文件传输理论吞吐上限为 12.5 GB/s；不能错成 100 GB/s。
- 两个 Transfer 共享同一 Fabric 容量，其总有效带宽不能超过容量；提升带宽后可能将瓶颈迁移到 HBM/Compute，解释器提供证据。
- CPU Offload 增加 Host DRAM 使用、可释放 GPU 缓存空间，但下一次 Host Hit 必须触发 Load 与资源竞争。
- P/D 换拓扑可保持已显式列出的物理 Rank 正确映射，任何重复计算驻留被测试识别。

## M4 · MoE + EP + CP 等进阶功能

### 工作项（**拆小 PR，不要一口气做完**）

1. MoE：ExpertPlacement、Token dispatch/topK、A2A 成本、专家热点与冗余副本。
2. EP 与 TP/DP 的 Group overlap、不同 rank 下专家和 non-expert 权重驻留。
3. PCP/DCP：依据 pinned vLLM-Ascend backend 的文档和源码建 adapter；要求支持组合受限时返回 partial/unsupported/unknown。
4. PP/SP：分层执行与 activation pipeline，明确定义 SP 与 Context Parallel 的区别。
5. MLA/SFA/DSA：Layer KV layout 和真实模型适配；MTP/DSpark，只有明确算法和数据时才引入耗时预测。

### 验收

- 选 EP 并不会神奇增加 GPU 总数；冗余专家增加 HBM 占用；热点使特定 Expert 负载高于均衡分布。
- DCP 在**已知支持且复用 TP rank 的特定拓扑**中不会错误创建额外设备；PCP 在其适用配置下可能增加 Rank 数。
- 版本不兼容/未知的功能在 UI 不出现“已验证可用”。

## M5 · 真实数据与性能校准

### 工作项

- Profile 中允许导入结构化 Benchmark 曲线：`kernel/op + hardware + batch + seqLen + dtype + framework version → time / achievedBW`。
- Trace 适配器接口；首先支持项目自己的标准 JSON Trace，外部 vLLM/Ascend 日志解析作为插件。
- 因果对照和可解释性：明确 TTFT/TPOT server/client 口径，导出指标及影响路径。
- 只在 calibration scope 内进行 interpolation，超范围降级标记；输出误差/置信信息。

### 验收

- 同一场景在导入校准数据前后，显示来源标识变化；禁止无数据时伪造 observed 曲线。
- 导入真实 Trace 若缺少事件细节，不得将推断阶段显示为“真实测量”。
- 模型、设备、量化、框架不匹配的曲线会被拒绝或醒目提示不适用。

## 交付节奏（按结果，不承诺固定工期）

- Agent 每完成一小段，记录：更改文件、通过的测试、演示入口、已知限制、下一步。
- 审核点：M0、M1、M2、M3、M4 子模块完成时；任何不通过的验收项必须修复，不允许以“未来优化”掩盖。
- 不设置无依据的“X 天完成”时限；由测试覆盖率/用户可操作性决定阶段完成。

## 关键依赖顺序

1. 无 Profile+Schema，不做配置控制台高级参数；
2. 无 Placement+Memory Ledger，不做 KV/通信画面；
3. 无 Event Engine，不做独立的“时间动画”；
4. 无请求/Block 机制，不做 Offload/PD 性能曲线；
5. 无 Feature Matrix，不把 PCP/DCP 等作为通用开关；
6. 无校准数据，不显示“真实预期 TTFT/TPOT”。
