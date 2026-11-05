# Changelog

本项目按设计包 `docs/InferenceLab_Design_v1.1` 的 D0 → M0 → M1 → M2 → M3 → M4 → M5 里程碑推进。日期为开发记录日期。

## [Unreleased] · 2026-11-05

### M5 · 真实数据与性能校准

- 新增 `packages/core/src/validation/calibration.ts`：校准 bundle Zod 校验、重复 ID 提示、错误路径。
- 新增 `packages/adapters/src/trace.ts`：标准 JSON Trace 适配器（`schemaVersion=1.0`、到达/Token/prefixBlocks/observed），外部日志解析留作插件。
- 仿真器按 `op + hardware + model + framework + dtype + batch + seqLen` 严格匹配曲线，仅在范围内插值；`timeUs` 解释为曲线 scope 中点的整步实测时长，成本按每序列平均工作量缩放（Prefill 用当前 chunk Token，Decode 用上下文 Token），batch 只参与 scope 匹配，避免把 batch 维度二次放大；seqLen 按每条序列（Prefill 平均原始 Prompt、Decode 最大上下文）、batch 按调度步实际序列数匹配；超范围降级并记录 `outOfScope`。
- 匹配成功的 Prefill/Decode 时序指标升级为 `CALIBRATED`；TTFT/TPOT 等仍逐项显示质量与原因。
- Request Inspector 新增 `Observed TTFT/TPOT` 行，只在 Trace 显式提供时出现，并注明与仿真推断不混用。
- 参考页新增校准曲线/Trace 文件导入、曲线列表、问题列表与 Trace 状态；工作台新增「实测复盘」与「校准曲线」横幅。
- 新增 `docs/examples/calibration-curves.sample.json`、`docs/examples/standard-trace.sample.json`。
- 未知 Plan 的 Run 改为显式同意对话框：只能选择“仅结构查看”，或在存在可用 KV Block 时使用已标注合成参数；GLM 模板因 KV 布局未知而禁用合成运行。
- 新增 `E2E-17` 验证未知模板的同意流程与禁用状态。

### 审核修复 · 正确性与依赖安全

- 校准：Decode 不再把整步聚合上下文当作单序列工作量；Chunked Prefill 用原始 Prompt 长度选曲线、用当前 chunk 缩放成本；KV-transfer 曲线只在声明的 batch/seqLen scope 内生效，越界显式记录。
- Run/Draft 契约：Run 完成时若 Draft 已被编辑，不再用冻结 Run 的 Plan 覆盖较新 Draft 的预览与 dirty 状态。
- Host/KV：Host Cache 容量统一由 `runtime.hostCacheBytes ?? deployment.kvTransfer.hostCacheBytes` 解析；`OFFLOADING` Block 在传输完成前即占用主机容量，避免并发批次重复预订；回放 reducer 从 `KV_ALLOCATED` 事件恢复 prefix-hit Block 的 `CACHED_ACTIVE`、`refCount` 与 `requestId`。
- MoE 路由在请求所属 Engine/DP 副本内解析专家归属，不再被其他副本的同名 expertId 覆盖；Agent 仅在 `sticky` 路由下保存会话亲和，`round-robin` 每轮重新选择。
- 拓扑编辑保留 PP/SP/CP 维度；EP 在 Rank 布局可整除时按 Engine 重新分组，否则显式关闭并给出 `TOPOLOGY_ADVANCED_RESET`；切换硬件时 PD Engine 与 `kvTransfer`（含 hostCacheBytes）保留。
- Trace 导入增加请求数、单请求事件数与 prefixBlocks 上限；场景/校准/Trace 导入增加 8 MB 文件大小上限，超限给出明确错误而不是冻结页面。
- 依赖升级：`zod 4.6.7`、`vitest 4.1.12`（移除存在 critical 漏洞的 tinypool 路径），用 pnpm override 将 `minimatch` 固定到 `11.0.1`；CI 新增 `pnpm audit --audit-level=moderate`。

### M4 · MoE / EP / CP / PP / SP / 注意力与投机

- MoE ExpertPlacement：EP 组叠加 TP/DP，不增加 GPU；每 Rank 基础专家 + 冗余副本；冗余增加 HBM、不增加逻辑专家数。
- topK token dispatch、偏斜路由、专家热点比、A2A 字节与耗时估算；Memory Lens 新增 MoE 专家驻留卡片与 Top-8 负载。
- PCP/DCP 显式放置：DCP 复用 TP Rank；PCP 增加 Rank；只有 `context-sharded`/`contextSharded` 层按 DCP 切分 KV，其他布局在 Plan limitations 中明示不随 DCP 变化；校验 `EP_REQUIRES_MOE`、`EP_EXCEEDS_RANKS`、`DCP_EXCEEDS_TP`、`PCP_INSUFFICIENT_DEVICES`。
- PP：`logicalParallelism.pp` 生成 Stage 组与连续层范围；Plan 输出 `PipelinePlan`（Stage 层区间、理想 Bubble `(pp−1)/(microbatches+pp−1)`、跨 Stage Activation 字节）；新增 Rank 与 `ppStageIndex`；校验 `PP_STAGE_COUNT`、`PP_STAGE_SIZE`、`PP_STAGE_UNUSED`、`PP_PD_COMBINATION_UNSUPPORTED`、`PP_PCP_COMBINATION_UNSUPPORTED`。
- SP：`runtime.spSize` 复用 TP Rank，只切分 Activation（Workspace 不随之切分），不新增设备；Plan 输出 `SequenceParallelPlan`（group、shard factor、`12·log2(sp)` µs 集合通信成本）；明确区别于 PCP/DCP 的上下文 KV 切分；校验 `SP_EXCEEDS_TP`、`SP_GROUPS_MISSING`、`SP_GROUP_SIZE`、`SP_GROUP_CROSSES_TP`。
- MLA：按 `(kvLatentDim + ropeDim) × dtypeBytes` 计算 latent KV，可选 DCP 上下文切分；不使用 GQA 头公式。
- SFA / DSA / HYBRID：必须声明 `sparseKV` 缓存组（`full | window | compressed`）；按显式形状计算 KV，缺失布局时返回 `unavailable`，不猜数。
- MTP / DSpark：`runtime.speculative` 显式声明 draft 数、接受率与可选 draft 成本比（默认 0.15）；Draft Token 计入 Token Budget，每步按期望接受数推进输出；整数 Token 通过跨步小数进位保持长期均值等于 `1 + draft × acceptance`，不再逐步向下取整。Plan 输出 `SpeculativePlan` 与 workload-dependent 加速比假设。适配器未声明支持或明确不支持时，接受数/加速比/成本比在 UI 显示 `N/A`，指标为 `unavailable`。
- 新增 `pp-sp-demo`、`mla-dcp-demo`、`sfa-dsa-demo`、`speculative-mtp-demo`、`speculative-dspark-demo` 预设；框架能力矩阵补充 `pipeline_parallel`/`sequence_parallel`/`speculative_decoding`/`mtp`/`mla`/`sparse_attention` 为 `partial`，`dspark` 为 `unknown`。
- Topology/Memory Lens 显示 PP Stage、SP 组、Bubble、Activation 分片、KV 布局质量与投机加速假设；新增 E2E-09…E2E-16。

### M3 · 多级存储 + PD + 网络

- Host DRAM KV Offload：完整 Block 写回/命中加载，经 PCIe 路径并参与资源竞争。
- `PD_PULL` / `PD_LAYERWISE_PUSH` / `PD_HOST_STAGING` 三种策略；Host Staging 两段传输。
- 链路 contention domain 串行排队；100 Gbps 在理想效率下按 12.5 GB/s 计算；共享 Fabric 不叠加容量。
- 新增 Transport Lens、Link Inspector、Transfer DAG 与 PD 预设；传输未完成前 Decode 端保持 `WAITING_FOR_REMOTE_KV`。
- 新增 `E2E-08` 验证 PD 传输顺序与竞争域。

### M2 · 事件回放 MVP

- 整数 µs 虚拟时钟、稳定优先队列、seeded PRNG；Worker 生成事件并分块回传。
- vLLM V1 子集调度：Token Budget、maxNumSeqs、Chunked Prefill、Prefix Cache、recompute 抢占。
- 稀疏全状态回放检查点（默认每 10,000 事件）流式传输；Seek 从最近检查点应用事件，不重跑仿真。
- Timeline 播放/暂停/单步/Seek、Request Waterfall、五 Lens 共享 selection/virtualTime。
- 多次 Run 历史与实验页摘要；固定 seed 可重复回放。
- Run 结束时执行核心不变量断言：KV free/used/refCount/hash 映射、事件时间单调、Token 计数与完成状态；违反时抛出 `SimulationError` 而不是输出可疑指标。

### M1 · 拓扑与每卡显存

- Device → Rank 显式放置、TP/DP 组生成、Rank→Device 映射校验。
- 权重分片（replicate/shard/opaque）、KV GQA/MHA per-rank 字节、HBM 预算与 KV Pool 双层账本。
- 超限时指出具体 `deviceId` 与超限字节；缺失权重配置的 GLM 模板保持 `unknown`，不显示“显存足够”。

### M0 · 契约与工作台

- pnpm workspace：`apps/web`、`packages/core`、`packages/profiles`、`packages/adapters`。
- TS strict、Zod 场景校验、Profile provenance/units、错误边界、草稿持久化与导入/导出。
- Toy 4 GPU / 32 GPU 硬件与 Dense/MoE 模型 Profile；统一 `/lab` 工作台与五个 Observation Lens。
- Vitest + Playwright + ESLint flat config + GitHub Actions CI。

### D0 · UI 设计基线

- 解压并审核设计包；输出 `docs/UI_SCREEN_MAP.md`、1440×900 与 1280×800 参考截图。

## 验证记录

- `pnpm lint`：通过。
- `pnpm test`：core 80 + adapters 6 + profiles 27 + web 5 = 118 条单元测试通过。
- `pnpm typecheck`：4 个 workspace 全部通过。
- `pnpm build`：Vite 生产构建通过。
- `pnpm audit --audit-level=moderate`：0 个已知漏洞。
- `pnpm e2e`：23 条 Playwright 用例通过（含 M4/M5、性能与截图基线）。

性能数字随机器变化，最新一次结果见 `docs/performance-report.json` 与 `docs/PERFORMANCE.md`。
