# Decisions

记录会影响后续实现的关键取舍。每条包含背景、决定与后果；与设计包冲突时以本文件为准并说明原因。

## D-01 · 纯前端静态应用，无后端

- **背景：** 设计包要求可部署为静态 HTML/CSS/JS，无遥测、无上传。
- **决定：** 所有 Profile、Scenario、仿真与回放都在浏览器内完成；生产构建是 `apps/web/dist/` 静态文件。
- **后果：** 无服务器成本与数据外流；大事件量受浏览器内存限制，刷新丢失当前 Run。

## D-02 · 整数 µs 虚拟时钟 + 稳定事件堆 + seeded PRNG

- **背景：** 需要同 seed 可重复、可回放、可单步。
- **决定：** 时间以整数微秒表示；事件按 `(timeUs, 稳定序号)` 排序；随机性全部来自 seeded PRNG。
- **后果：** 同场景同 seed 的事件日志与指标逐位一致；浮点只出现在成本估算与指标聚合中。

## D-03 · Draft / Plan / Run 严格分离

- **背景：** 编辑参数不应篡改已观察的结果。
- **决定：** Config 只修改 Draft；Worker 生成 Plan 预览；Run 冻结 Scenario 与 Profile 指纹后生成事件日志。
- **后果：** 修改 Draft 后旧 Run 仍可回放；需要 `draftRevision` 丢弃过期 Plan 响应。

## D-04 · 显式 Device → Rank → Group 放置

- **背景：** 避免“隐式 TP×DP 乘法”和看不见的卡。
- **决定：** 每个 Rank 显式映射到 `nodeId + deviceId`；TP/DP/EP/PCP/DCP/PD 组由 Rank 字段派生，不额外创建隐藏设备。
- **后果：** 放置冲突可校验；EP 叠加 TP/DP 不增加 GPU；DCP 复用 TP Rank，PCP 增加 Rank。

## D-05 · HBM 预算与 KV Pool 双层账本

- **背景：** 权重、运行时、Workspace、通信缓冲与 KV 预留属于外层预算；Block 分配只动内层。
- **决定：** 外层 `hbmBudgetBytes` 扣除固定项与 KV 预留；内层单独跟踪 KV used/free，两者不重复计入物理 HBM。
- **后果：** 需要两套不变量与测试；UI 能回答“预留了多少”和“实际用了多少”。

## D-06 · Worker 分块传输事件与回放检查点

- **背景：** 高密度场景约 18.8 万事件，一次性 `postMessage` 会阻塞主线程并造成长任务。
- **决定：** Worker 先发 header，再按块发送事件；每 10,000 事件附带一份完整视图状态检查点。
- **后果：** 主线程长任务 P95 约 114 ms；Seek 从最近检查点应用事件（约 251 ms），不重跑仿真。检查点增加内存占用。

## D-07 · 回放是事件投影，不是独立动画

- **背景：** 播放/暂停/Seek 必须与 Canvas、Inspector、Timeline 同步。
- **决定：** `ReplayIndex.stateAt(eventIndex)` 从空状态或检查点应用事件；UI 只渲染该状态。
- **后果：** 动画不改变因果；跨 Lens 共享 `eventIndex` / `virtualTimeUs`。

## D-08 · vLLM V1 子集，而非完整复刻

- **背景：** 需要可解释的调度机制，而不是兼容全部 vLLM 行为。
- **决定：** 只实现 Token Budget、maxNumSeqs、maxModelLen 准入、Running 优先、FCFS、Chunked Prefill、完整 Block Prefix Cache、recompute 抢占。
- **后果：** 机制可测试；优先级、公平性、async scheduling 等明确列为限制。`promptTokens + outputTokens > maxModelLen` 的请求在到达时以 `MAX_MODEL_LEN_EXCEEDED` 拒绝，而不是静默截断。

## D-09 · PD_LAYERWISE_PUSH 只按整段链路计时

- **背景：** 逐层 push 与计算重叠需要真实 kernel/通信时序数据。
- **决定：** 三种策略共享同一物理路径计算；`PD_HOST_STAGING` 额外拆成两段串行传输；`PD_LAYERWISE_PUSH` 不建模逐层重叠。
- **后果：** 不虚构无法验证的重叠收益；UI 明示该近似。

## D-10 · MoE 路由与 A2A 为合成教学模型

- **背景：** 没有真实 router 分布与集合通信 trace。
- **决定：** 用 seeded PRNG 生成偏斜路由，按 topK dispatch 与跨 Rank 专家数估算 A2A 字节/耗时；所有 MoE 指标标为 `assumption`。
- **后果：** 可稳定复现热点与冗余成本；不能用于真实模型性能结论。

## D-11 · CP 采用 partial 支持

- **背景：** PCP/DCP 在不同后端/版本组合下行为不同，设计包要求受限时返回 partial/unsupported/unknown。
- **决定：** DCP 只在复用 TP Rank 的已知拓扑中建模；PCP 作为显式放置维度可能增加 Rank；能力矩阵标为 `partial`。
- **后果：** 不宣称覆盖全部组合；未支持组合在 UI 不显示“已验证”。

## D-12 · 校准曲线严格 scope 匹配，区间内插值

- **背景：** 跨硬件/模型/框架外推会产生虚假精度；若把整步聚合 Token 直接乘到曲线上，batch 维度会被放大两次。
- **决定：** 曲线必须匹配 `op + hardware + model + frameworkVersion + dtype`，且 batch/seqLen 落在声明范围；范围内线性插值，超范围降级并记录 `outOfScope`。`timeUs` 是曲线 scope 中点的整步实测时长，成本按每序列平均工作量缩放：Prefill 用当前 chunk Token（scope 用原始 Prompt 平均长度），Decode 用每序列上下文 Token；batch 只参与 scope 匹配。曲线可选声明 `uncertaintyPct`，Run 汇总取已应用曲线的最大声明误差并写入指标原因。
- **后果：** 只有同时匹配 Prefill 与 Decode 且无越界时，时序指标才升级为 `CALIBRATED`；其余保持 `SYNTHETIC`。声明误差是来源自报值，不是统计置信区间。

## D-13 · Trace 的 Observed 与仿真推断分离

- **背景：** 请求级 TTFT/TPOT 实测不代表 Prefill/Decode 阶段时序也实测。
- **决定：** 只有 Trace 显式字段进入 `RequestTrace.observed` 并在 Inspector 标“实测”；阶段事件始终由仿真生成，缺少事件细节时横幅明示“阶段时序仍为推断”。
- **后果：** 不会把推断阶段伪装成真实测量；observed 值不参与成本模型拟合。Metrics Lens 把聚合 observed 指标单独放入 `OBSERVED` 条带，与仿真 TTFT/TPOT 分开展示。

## D-14 · 样式使用手写 CSS + 设计 Token，而非 Tailwind

- **背景：** M0 工作项提到 Tailwind；设计原型提供的是完整视觉语言与 CSS 变量。
- **决定：** 使用 `global.css` + CSS 自定义属性实现统一 Token、暗/浅色与响应式，不引入 Tailwind 构建链。
- **后果：** 依赖更少、构建更小；样式约定靠文件结构与评审维持，偏离设计包中的工具选择但保留视觉/交互合同。

## D-15 · ESLint flat config + GitHub Actions

- **背景：** M0 要求 ESLint、TS strict 与 CI。
- **决定：** 根目录 `eslint.config.js` 使用 `typescript-eslint` recommended；CI 依次运行 install、`pnpm audit --audit-level=moderate`、lint、test、typecheck、build、Playwright。
- **后果：** 7 个既有未使用符号已清理；CI 需要下载 Chromium，首次运行较慢；依赖漏洞会在 lint 之前阻断合并。

## D-16 · Run 结束时执行核心不变量断言

- **背景：** 设计包 06-TESTING 要求开发模式断言资源守恒、引用计数、时间单调与 Token 计数等不变量；仅靠用例无法覆盖所有预设组合。
- **决定：** `KvCacheManager.assertInvariants()` 检查 free list 唯一性、FREE/占用状态、refCount、hash 映射、Host Block 与加载预留；`Simulator` 在 Run 结束、构建结果前统一检查 KV、事件时间单调、请求 Token 计数与完成状态。违反时抛出带 `CORE_INVARIANT_VIOLATION` issues 的 `SimulationError`。
- **后果：** 断言只跑一次 Run，开销可忽略；浏览器 Worker 与单元测试都会触发。共享前缀的并发请求可能各自缓存相同 hash 的 Block（缺少 in-flight 去重），因此断言允许同 hash 多 Block，只要求 hash 映射指向一个有效且 hash 相同的 Block。

## D-17 · PP 均匀层切分 + 理想 Bubble，SP 复用 TP Rank

- **背景：** 设计包要求区分 PP/SP 与 CP，但真实流水线调度需要 kernel 级时序与 micro-batch 配置。
- **决定：** PP 按 `floor(numLayers × stage / pp)` 均匀切分连续层范围，microbatch 数取 `maxNumSeqs`，Bubble 用 `(pp−1)/(microbatches+pp−1)`；跨 Stage Activation 只按 `hiddenSize × dtype × tokens` 的结构字节与合成带宽计时。SP 复用 TP Rank，把 Activation 按 `spSize` 切分（Workspace 不随之切分），并加一笔 `12·log2(sp)` µs 的集合通信成本；不新增设备。PP 与 PD/PCP 的组合直接校验拒绝。
- **后果：** 能解释 Stage 划分、Bubble 与 SP/CP 的区别；不声称覆盖 1F1B 交错、Stage 重叠或真实 All-Gather 实现。所有 PP/SP 指标标为 `assumption`。

## D-18 · MLA / SFA / DSA 必须显式声明 KV 布局

- **背景：** MLA 的 latent KV 与 SFA/DSA 的窗口/压缩缓存无法从 GQA 头参数推导；猜布局会给出错误容量。
- **决定：** MLA 按 `(kvLatentDim + ropeDim) × dtypeBytes` 计算，可选 `contextSharded`/DCP 切分；SFA/DSA/HYBRID 必须提供 `sparseKV`（`cacheGroup + storage`，按 storage 读取 `nKVHeads/headDim` 或 `kvLatentDim`），并按 `kvLayout` 声明的 `head-sharded-tp`/`context-sharded`/`replicated` 决定 TP/DCP 切分，不能默认按整模型每 Rank 复制；只有 `context-sharded`/`contextSharded` 层会按 DCP 缩小每 Rank KV，`head-sharded-tp`/`replicated` 层不因 DCP 声明而改变 KV，Plan limitations 明示该组合。缺失布局时 `computeKvBytesPerToken` 返回 `null`，Plan 标 `unavailable`。框架能力矩阵中 `mla`/`sparse_attention` 为 `partial`。
- **后果：** 容量数字可追溯到 Profile 字段；未声明布局的模型不会显示猜测容量，也不使用 GQA 公式近似 MLA。

## D-19 · 投机解码以场景假设驱动，DSpark 保持 unknown

- **背景：** MTP/DSpark 的真实收益依赖 draft 模型、接受率与任务分布，设计包要求“只有明确算法和数据时才引入耗时预测”。
- **决定：** `runtime.speculative` 显式给出 `method + draftTokens + acceptanceRate`，`draftCostRatio` 可选，省略时默认 0.15；每步 Decode 消耗 `1 + draftTokens` 个 Token Budget，按期望值 `1 + draftTokens × acceptanceRate` 推进输出；时间线提交整数 Token，用跨步小数进位保持长期均值，而不是每步向下取整。Plan 输出 `expectedAcceptedTokensPerStep` 与 `expectedDecodeSpeedup`，支持时标为 `assumption`。教学适配器中 `dspark` 为 `unknown`，触发 `FEATURE_UNKNOWN` 警告；此时接受数、加速比与 Draft 成本比在 UI 显示 `N/A`，指标标为 `unavailable`，但仍显示 Draft Token 预算的结构占用。
- **后果：** 不引入无数据支撑的默认加速；接受率变化会直接改变 Token 吞吐与调度轮数。Draft 模型显存与真实采样校验不在建模范围内。`unsupported` 与 `unknown` 一样不产生可宣称收益：UI 显示 `N/A`，指标为 `unavailable`；区别是前者同时产生 `FEATURE_UNSUPPORTED` 校验错误、Plan 不可运行。
