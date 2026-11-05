# 00 · 给 AI Coding Agent 的开工指令

你将基于本设计包开发一个可用的静态 Web 应用：**InferenceLab**。先阅读根目录 README，再阅读 01 至 12；优先理解 v1.1 的 UX 设计合同。目标是实际代码、测试、可运行的 UI，不是重新写 PRD。

## 一、执行准则

1. 不要求向用户继续追问一般技术选型；按设计包默认决定：React + Vite + TypeScript、Zustand、React Flow/SVG（拓扑）、Canvas/PixiJS（大量动态流）、ECharts（曲线）、Web Worker（仿真）、Vitest + Playwright。
2. 只创建本地静态应用，`pnpm install` / `pnpm dev` / `pnpm build` / `pnpm test` 可运行；不需要后端、API key、真实 GPU 或在线服务。
3. 严格遵循 M0→M1→M2→M3→M4→M5；先做每阶段的**真正可交互垂直切片**。不要用 Mock TTFT、硬编码统计图、无事件驱动的装饰性动画冒充已实现功能。
4. 所有内核公式与数据必须可测试；模型结构、rank group、HBM/DRAM 账本、缓存生命周期、调度器、传输路径不能藏在 UI 中。
5. 如有真实 vLLM-Ascend 特性语义/版本不确定，查官方 release/tag/源码，记录来源，设为 `unknown/unsupported`，不凭猜测继续做数值预测。
6. 若某个阶段遇到超范围功能，写入 `KNOWN_LIMITATIONS.md`、安排后续任务，不要以临时 `if` 写入 20 种非通用特殊规则。
7. 不要采纳设计包中示例的“合成硬件数字”为任何真实 Ascend A3/H100/H200 性能；Toy Profile 明确标记 synthetic。
8. 项目完成每个 milestone 后提供：可运行功能清单、演示步骤、测试结果、未通过/未支持项目、关键文件与下一步；不声称没有做过的测试通过。

## 设计优先级与 D0 门禁（v1.1 新增）

若多个文档发生不一致：`02/03/06` 对物理与协议正确性优先；`04/10/11/12` 对 WebUI 与交互优先；`05` 对里程碑范围优先。**在 M0 之前先执行 docs/12 的 Gate D0**：完成 UI Screen Map、组件映射、视觉原型与两种屏幕规格的审核，确保产品不是普通 Dashboard。`prototype` 的任何示意数字不可用于生产核心计算。

## 二、按阶段第一个具体任务

**先完成 M0，再开发 M1，不要开始编写 M4 专项**：

- 初始化 Monorepo，落地 Schema、profile & Scenario 导入/导出。
- 按 04-UX 与视觉参考实现高质量统一主 UI Shell：Header + 观察层 Rail + 左侧 Config + 共享 Canvas + 右侧 Inspector + 底部 Timeline；重点保证中心图空间。
- 完成 Toy GPU/Node Profile、模型 profile、真实的参数校验（至少 TP/DP/最大长度/单位）。
- 写 Vitest，保证浏览器构建通过；通过 Playwright 检查启动页面/导入导出。
- 提交后概述项目结构与可执行命令，再实施 M1。

## 三、完成 M1 后的任务

- 以单卡真实账本/显式分组为内核，支持 TP/DP 交互映射。
- 实现带来源的每卡权重/KV 估算、内存预算、可行性检查。
- 拓扑/显存数据必须来自 core 的 plan 结果，而不是 React 自算。
- 以 32 卡 TP16×DP2/TP8×DP4 两场景证明逻辑正确。
- 对 GLM-5.3 A3 空模板，不提供虚假的模型 weight/HBM/TTFT 数值。

## 四、完成 M2 后的任务

- 实现 Worker 中的 DES、KV Block/Prefix、vLLM V1 子集调度。
- 加入 timeline + Scheduler 单步 + KV Block inspector，可暂停、重放、导出 trace。
- 实际跑通 48 请求/8K ISL/1K OSL 的合成场景；验证数值不是静态文案。
- M2 是首个完整发布点，发布后再加入多级内存、PD/网络。

## 五、代码规范建议

- TypeScript strict，核心 `packages/core` 不得 import `react`, `window`, `document`。
- 资源与 event ID 独立稳定，避免用数组下标作为持久 ID。
- 枚举 event/status，禁止分散 magic string。
- 结构/时间指标附 `provenance`，API 跨 Worker 可结构化 clone。
- 使用微秒虚拟时钟及稳定优先级队列；不可依赖 JS 真实计时器和 `Math.random()`。
- 采用可控快照机制，限制 EventLog 内存；算法单测严于 UI 视觉测试。
- 保持源代码/变量英文，UI/文档中文优先（预留 i18n）。

## 六、交付验收清单（Agent 自检）

- [ ] 新人克隆仓库后仅靠 README 能启动。
- [ ] 页面没有无动作的“占位按钮”。
- [ ] Toy Demo 和导入配置可以正常运行。
- [ ] 每卡内存预算对 KV pool 不重复计数。
- [ ] Rank Group 同时有合法性/Unknown 检查。
- [ ] Scheduler/KV Event 为日志驱动而非单独绘制的假动画。
- [ ] Trace 重放固定 seed 具有确定性。
- [ ] 任何性能数值都有单位与来源等级。
- [ ] 真实设备缺数据时停止无依据的数值预测。
- [ ] Vitest、Playwright、Build 全部有真实运行输出。

## 七、你必须首先向用户展示的内容

启动开发时先给出 1 页简明实施说明：M0/M1/M2 的垂直切片、目录、测试与当前里程碑，然后**立即写代码**，避免反复讨论方案或一开始搭建复杂服务。
