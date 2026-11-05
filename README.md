# InferenceLab

InferenceLab 是一个**纯前端、无后端**的 LLM 推理机制实验台。它把「物理放置 → HBM/KV 容量 → V1 子集调度 → KV Block → PD 传输 → 指标」串成一条可回放的离散事件链，并明确标注每个数字的来源等级。

它不是性能预测器：合成成本模型用于比较机制，导入的校准曲线才会把匹配范围内的时序升级为 `CALIBRATED`。

## 快速开始

要求 Node.js >= 20，包管理器使用 pnpm（`packageManager: pnpm@12.5.1`）。

```bash
pnpm install
pnpm dev          # 打开 http://127.0.0.1:5173/#/lab
```

常用命令：

```bash
pnpm test         # core + adapters + profiles + web 单元测试（118 条）
pnpm lint         # ESLint（typescript-eslint flat config）
pnpm typecheck    # 所有 workspace 的 tsc --noEmit
pnpm build        # typecheck + Vite 生产构建（静态文件，无后端）
pnpm e2e          # Playwright：23 条 UI/性能/截图用例
pnpm audit --audit-level=moderate  # 依赖漏洞检查（CI 同样执行）
```

## 首个演示闭环（约 3 分钟）

1. 在 Header 选择 `4 GPU · TP4 基线`，中央 Canvas 显示 4 张物理卡与 TP4 组。
2. 点击 `▶ 运行实验`，Timeline 出现 Prefill / Decode / Wait 事件段；`pd-demo` 预设还会出现 KV Transfer。
3. 拖动 Timeline 游标或单步事件，观察 Scheduler 的 Waiting/Running/Preempted 与 Request Inspector 的 TTFT/TPOT、等待原因和证据。
4. 切换到 Memory Lens：外层 HBM 预算与内层 KV Pool 分开记账；点击设备查看权重、KV 预留与余量。
5. 打开 `参考` 页：导入 `docs/examples/calibration-curves.sample.json` 后运行，匹配范围内的时序升级为 `CALIBRATED`；导入 `standard-trace.sample.json` 会切换到「实测复盘」并显示 Observed 行。校准曲线本身不会切换回放模式。

全部 17 个预设：

| 预设 | 观察点 |
|---|---|
| `toy-4gpu-tp4-basic` | 4 卡 TP4 基线；4 请求同时到达，观察 Prefill/Decode 与 KV 池 |
| `toy-32gpu-tp16-dp2` | TP16 × DP2；观察副本间请求路由与每副本 KV 峰值 |
| `high-density-demo` | 48 请求 × 1000 输出 Token，Worker 仿真 + 检查点回放 |
| `budget-8-demo` | Token Budget=8 的 A6/B2 → B4 两轮调度 |
| `prefix-cache-demo` | 连续完整 Block 前缀命中，第三块不命中 |
| `agent-demo` | 两个会话各 3 轮；粘性路由、前缀随历史增长与缓存复用 |
| `pd-demo` | Prefill → KV 传输 → Decode；传输未完成 D 侧不 Decode |
| `offload-demo` | HBM KV 池收紧，共享前缀块淘汰到主机 DRAM 后重新加载 |
| `moe-redundant-demo` | 每 Rank 冗余专家增加 HBM；偏斜路由产生热点与 A2A 成本 |
| `cp-demo` | DCP 复用 TP Rank，PCP 显式增加 Rank；GQA 层为 head-sharded-tp，KV 不随 DCP 切分（Plan limitations 明示） |
| `moe-ep-demo` | EP2 下 64 专家分片，不增加 GPU 数 |
| `pp-sp-demo` | TP2 × PP2 的 Stage 层切分与 Bubble；SP2 复用 TP Rank、不新增设备 |
| `mla-dcp-demo` | MLA latent + RoPE KV 布局，DCP 上下文切分 |
| `sfa-dsa-demo` | SFA 窗口缓存 + DSA 压缩缓存的显式 KV 布局 |
| `speculative-mtp-demo` | MTP 4 Draft / 60% 接受率：Draft Token 计入预算，显示期望加速 |
| `speculative-dspark-demo` | DSpark 在教学适配器中保持 unknown：显示 Draft Token 预算，接受数/加速比/成本比显示 N/A |
| `ascend-a3-glm53-template` | 仅结构导入：算力/带宽/KV 布局均为 unknown，不伪造时间或容量结论 |

## 功能范围

- **Draft / Plan / Run 分离**：编辑不篡改已冻结的 Run；Worker 生成 Plan 与事件日志。
- **显式放置**：Device → Rank → TP/DP/EP/PCP/DCP/PP/SP/PD 组，无隐式 TP×DP 乘法，不出现“看不见的卡”；SP 复用 TP Rank，PP 增加 Stage 与 Rank。
- **双层内存账本**：HBM 预算（权重/运行时/Workspace/通信缓冲/KV 预留）与 KV Pool used/free 不重复计算。
- **vLLM V1 子集调度**：Token Budget、maxNumSeqs、maxModelLen 准入（超限请求拒绝，不静默截断）、Running 优先、FCFS、Chunked Prefill、Prefix Cache、recompute 抢占。
- **确定性回放**：整数 µs 虚拟时钟、稳定优先队列、seeded PRNG；稀疏全状态检查点每 10,000 事件，Seek 不重跑仿真。
- **PD 分离与传输**：`PD_PULL` / `PD_LAYERWISE_PUSH` / `PD_HOST_STAGING`；共享 contention domain 串行排队；Host DRAM Offload 加载路径。
- **MoE / EP / CP / PP / SP**：ExpertPlacement、topK dispatch、A2A 字节/耗时估算、热点与冗余副本；EP 与 TP/DP 组叠加；DCP/PCP 受限支持；PP 均匀层切分、理想 Bubble 与跨 Stage Activation；SP 只切 Activation，Workspace 不随之切分，明确区别于上下文 KV 切分。
- **注意力与投机**：MLA 按 latent + RoPE 布局计 KV；SFA/DSA/HYBRID 要求显式 cache group/storage，缺失布局显示 `unavailable`；MTP/DSpark 以场景给出的 Draft 数、接受率与成本比估算，Draft Token 计入 Token Budget。
- **数据导入**：标准 JSON Trace（请求级到达/Token/显式 observed 指标）与校准曲线（严格 scope 匹配 + 区间插值；seqLen 按每条序列、batch 按调度步实际序列数匹配）。
- **五 Lens 单一工作台**：Topology / Memory / Scheduler / Transport / Metrics，共享选择与 virtualTime。

## 指标质量

| 等级 | 含义 |
|---|---|
| `EXACT` | 显式配置或事件计数，可精确复现 |
| `CALIBRATED` | 导入曲线在硬件/模型/框架/dtype/batch/seqLen 范围内匹配 |
| `SYNTHETIC` | 由标注过的合成成本模型推导，不代表真实性能 |
| `OBSERVED` | 导入 Trace 中的显式实测值，单独展示，不参与仿真拟合 |
| `N/A` | 缺少可计算样本；UI 不显示猜测值 |

Trace 中显式提供的 `observed.ttftUs/tpotUs` 会在 Metrics Lens 的 `OBSERVED` 条带和 Inspector 的 Observed 行展示；即使 Trace 缺少事件细节，Prefill/Decode 阶段时序仍标为仿真推断。仅有 observed 值不会把整次运行升级为 `MEASURED`。

## 仓库结构

```
apps/web                 React 19 + Vite + Zustand + Web Worker UI
packages/core            领域类型、校验、放置/内存规划、事件引擎、回放视图
packages/profiles        Toy 硬件/模型/框架 Profile 与场景预设
packages/adapters        Trace 适配器与校准曲线 bundle 解析
docs/                    设计包、截图、性能报告、决策与限制
docs/examples/           可直接导入的校准曲线与标准 Trace 样例
```

## 文档

- [CHANGELOG.md](CHANGELOG.md) · 里程碑与变更
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) · 已知限制与不承诺项
- [docs/DECISIONS.md](docs/DECISIONS.md) · 关键取舍与理由
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) · 性能测试方法与结果
- [docs/UX_REVIEW.md](docs/UX_REVIEW.md) · UI 门禁审核脚本与自测记录
- [docs/UI_SCREEN_MAP.md](docs/UI_SCREEN_MAP.md) · D0 屏幕/状态映射
- [docs/InferenceLab_Design_v1.1/](docs/InferenceLab_Design_v1.1/) · 原始设计包

## 部署

`pnpm build` 输出 `apps/web/dist/` 静态文件，可部署到任意静态托管；不需要服务端、数据库或遥测。所有数据只存在于当前浏览器会话。
