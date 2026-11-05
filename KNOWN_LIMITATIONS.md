# Known Limitations

InferenceLab 的目标是解释推理机制，不是预测真实硬件性能。以下限制是刻意保留的产品边界，UI 中也以 `SYNTHETIC` / `UNKNOWN` / `N/A` / `OBSERVED` 或说明文字呈现，而不是隐藏。

## 仿真模型

- **不是性能预测器。** 未导入校准曲线时，Prefill/Decode/传输耗时来自标注过的合成成本模型，只适合比较机制与相对变化。
- **不模拟 GPU 内核级并行。** 没有 CUDA/Triton kernel、流水线重叠、CUDA Graph、Tensor Core 利用率或真实网络拥塞。
- **调度器是 vLLM V1 子集。** 只实现 Token Budget、max_num_seqs、max_model_len 准入、Running 优先、FCFS、Chunked Prefill、完整 Block Prefix Cache、recompute 抢占；`prompt + output > max_model_len` 的请求在到达时拒绝而不是截断。不覆盖优先级调度、多租户公平性、async scheduling 等。
- **KV 传输按逻辑 Block 聚合。** `PD_LAYERWISE_PUSH` 只按同一物理链路整段计时，不建模逐层 push 与计算重叠；`PD_HOST_STAGING` 建模两段串行传输，不做主机侧并发细节。
- **CPU Offload 只处理完整 Block。** 不做逐层 offload、预取窗口或 pinned-buffer 竞态细节。
- **共享链路采用保守排队。** 同一 contention domain 的同一方向按顺序占用容量；声明为 full-duplex 的域允许相反方向并行，half-duplex 域两个方向共用一条忙窗口。不模拟交换机内部并行或拥塞控制。
- **回放检查点占用内存。** 每 10,000 事件保存一份完整视图状态；极大事件量下内存随事件数线性增长（事件本身也保存在内存中）。

## MoE / EP / CP / PP / SP

- **专家路由是合成教学模型。** 偏斜路由由 seeded PRNG 生成，用于展示热点与 A2A 成本，不代表任何真实模型的 router 分布。
- **A2A 字节/耗时是估算。** 按 topK dispatch、跨 Rank 专家数与共享互联容量计算，不是实测集合通信。
- **EP 只影响专家权重驻留与路由成本。** 不改变 Attention/非专家权重的 TP 分片规则，也不模拟 expert parallel 的负载均衡算法。
- **CP 为 partial 支持。** DCP 只在“复用 TP Rank”的已知拓扑中建模；PCP 作为显式放置维度增加 Rank。只有声明 `context-sharded` / `contextSharded` 的层会按 DCP 切分 KV；`head-sharded-tp` / `replicated` 层保持 TP/复制，Plan limitations 会明示该组合下 DCP 不改变 KV。未覆盖所有 vLLM-Ascend 组合、KV layout 变化或 CP 通信细节。
- **PP 为 partial 支持。** 只按均匀层范围切分 Stage；microbatch 数取 `maxNumSeqs` 的理想值，Bubble 用 `(pp−1)/(microbatches+pp−1)` 估算；跨 Stage Activation 仅按结构字节/带宽合成成本计时，不模拟真实流水线调度、1F1B 交错或 Stage 间重叠。PP 与 PD 分离、PCP 的组合会被校验拒绝。
- **SP 为 partial 支持。** SP 复用 TP Rank，只切分 Activation；Workspace 不随之切分，并加一笔 `12·log2(sp)` µs 的合成集合通信成本；它不等于 PCP/DCP 的上下文 KV 切分，也不建模 All-Gather/Reduce-Scatter 的真实实现与重叠。

## MLA / SFA / DSA / 投机解码

- **MLA 为 partial 支持。** 只支持显式 `kvLatentDim + ropeDim` 的 latent KV 布局，可按 DCP 切分；不建模 absorbed weight、矩阵吸收后的计算路径或真实模型层间差异，也不套用 GQA/MHA 头公式。
- **SFA / DSA / HYBRID 为 partial 支持。** 必须由 Profile 显式声明 `sparseKV` 缓存组与 storage（`full | window | compressed`），并按 `kvLayout` 在 TP/DCP 间切分；缺失布局时 KV 指标为 `unavailable`，不猜数。不建模稀疏选择 kernel、索引/压缩开销或真实 attention mask。
- **MTP 为 partial 支持。** Draft Token 数、接受率与 draft 成本比都是场景显式假设；Draft Token 计入 Token Budget，按期望接受数推进输出。不建模 draft 模型权重/显存、真实采样校验或拒绝回滚细节。
- **DSpark 在教学适配器中为 `unknown`。** 即使场景给出假设参数，也只显示结构估算与 Draft Token 预算；接受数、加速比和 Draft 成本比显示 `N/A`，并给出 `FEATURE_UNKNOWN` 警告，不声称已验证或可预测。
- **投机收益是 workload-dependent 假设。** 接受率与成本比不来自实测曲线；不同任务、采样温度与 batch 下收益会变化，UI 不把它标为 EXACT/CALIBRATED。

## 数据与 Profile

- **仅内置 Toy Profile。** 当前 UI 不提供 Profile 导入；真实设备/模型参数需要扩展 `packages/profiles` 后重新构建。GLM 模板缺少权重配置时保持 `unknown`，不会显示“显存足够”。
- **校准曲线必须严格匹配。** 硬件、模型、框架版本、dtype、batch 与 seqLen 任一不匹配即拒绝或标记不适用；不做跨设备外推。seqLen 按每条序列匹配（Prefill 用该调度步的平均原始 Prompt 长度，Decode 用最大上下文长度），batch 按该调度步实际序列数匹配；曲线的 `timeUs` 是 scope 中点的整步实测时长，成本按每序列平均工作量缩放，曲线本身仍不是逐请求二维查表。
- **校准插值只在声明范围内。** 超出 `batchMin/Max`、`seqLenMin/Max` 时降级为 `SYNTHETIC` 并记录 `outOfScope`。
- **误差是曲线自报值。** `uncertaintyPct` 来自导入文件；不是本项目计算的统计置信区间，也不做多曲线误差传播。
- **标准 Trace 只覆盖请求级信息。** 项目标准 JSON 可携带到达时间、Token 数、prefixBlocks 与显式 observed 指标；外部 vLLM/Ascend 日志解析器尚未内置，需要先转换为标准格式。导入上限为 10,000 条请求、每请求 10,000 条事件与 100,000 个 prefixBlocks，超出会截断并给出警告。
- **Trace 的 `events` 字段只被检测，不被解析。** 当前适配器会在状态中提示“检测到 events 字段，但当前不用于阶段时序”；阶段时序仍来自仿真推断。
- **Trace 缺少事件细节时，阶段时序仍是推断。** 即使请求级 TTFT/TPOT 是实测，Prefill/Decode 事件段也不会标为“真实测量”。
- **Observed 指标不参与仿真校准。** Trace 中的 observed 值只用于对照展示，不会反向拟合成本模型。
- **单次 Run 有硬上限。** 仿真器最多产生 250,000 个事件；达到上限会截断并以警告结束，不保证所有请求完成。
- **快照与检查点是稀疏的。** UI 状态快照默认每 500 事件一份，回放检查点默认每 10,000 事件一份；两者都不是逐事件持久化。
- **缺少 in-flight 前缀去重。** 共享前缀的并发请求可能各自缓存相同 hash 的 Block；不变量只要求 hash 映射指向有效且 hash 相同的 Block，不保证全局单份。

## UI / 工程

- **本地化只覆盖 UI chrome。** 默认中文、可切换 English；技术标识符（TP/DP/KV/HBM 等）、质量标签、公式、硬件/模型/场景 ID 与领域枚举保持英文。英文文案为人工维护，未接入机器翻译，也未提供中英文以外的语言。
- **移动端只保证降级查看。** <768px 不提供完整拖拽/编辑体验；建议桌面使用。
- **性能数字与机器相关。** Playwright 性能门禁在本机 Chromium 单 worker 下运行；CI/不同机器可能得到不同数值，文档中的阈值是目标而非硬件无关保证。
- **没有真人可用性试验。** `docs/UX_REVIEW.md` 提供审核脚本与 Agent 自测记录，但不能替代 5 人（最少 1 人）的 15 分钟真实用户试验。
- **E2E 本地用 Vite dev server，CI 用生产预览。** Playwright `webServer` 在本地启动 `pnpm dev`；CI 设置 `PLAYWRIGHT_PREVIEW=1` 后启动 `pnpm preview`，以覆盖生产构建。`pnpm build` 仍单独验证静态产物。
- **无后端、无持久化。** 刷新会丢失当前 Run；仅草稿与偏好写入 `localStorage`。
