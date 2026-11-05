# 12 · AI Coding 的 UX-First 实施协议（v1.1）

> 目标：避免 Agent 直接开工做「表单+图表 Dashboard」且后期被迫重写。UI、模拟器并行但不可脱钩；每个里程碑 UI 都必须对应可验证的 Core 状态。

## 任务执行序列（不得跳过设计审核）

### Gate D0：设计冻结（**代码前必须完成**）
1. 阅读 `README.md`、`04-UX.md`、`10-UX-STORYBOARDS.md`、`11-UI-ACCEPTANCE.md` 和 `prototype/inferencelab-ui-reference.html`。
2. 基于参考原型输出 `docs/UI_SCREEN_MAP.md`：各区域职责、选择/时间/镜头等共享状态、可复用组件边界，以及 1440×900、1280×800 两张静态截图。
3. Agent 必须列出「技术数据怎样映射到像素」：例如 `TPGroup -> GroupBoundary`、`Plan.allocatedKV -> MemoryRibbon`、`SimEvent -> TimelineSegment`。
4. 判断原型中的文案与数据全是 UI 演示值；**不得复制原型里任何数值成为 Core 结果**。所有真实数值只能来自 Profile/Plan/Event。
5. Gate D0 产物审核通过后才能继续 M0。视觉效果不满意时在 D0 修改原型，不把坏布局留到 M2。

### Gate D1 / M0：外壳和交互语义
- 落地 Header、Rail、Config、Canvas、Inspector、Timeline 的真实布局与响应式降级；暗色与浅色主题、tokens。
- 建立应用状态 `activeLens`, `selectedEntity`, `focusPath`, `draftScenario`, `planPreview`, `activeRun`, `virtualTimeUs`, `playbackSpeed`, `qualityTier`。
- 原型链接、导航、折叠、Help 与导入导出可操作；未实装功能 `disabled + Why`，不用空按钮。
- 提交截图和 Playwright 对 Shell、Keyboard 的测试；**人工确认首屏是否像实验室，而不是后台管理系统**。

### Gate D2 / M1：首个可用主画布
- 真实 Placements→节点与组边界；Plan→HBM 外部容量占用与 KV 内部预留视图；点击 NPU 的 Inspector。
- 完成 Storyboard S01/S02 前半；演示无实际性能值时的 graceful unknown。
- 截图/录屏演示 TP16→TP8 改变 Group 边界和 Inspector；完成 E2E-01/02/03。

### Gate D3 / M2：核心动态叙事
- 完成 S03/S04，按虚拟时间同步 Timeline、Scheduler、Memory，Play/Pause/Seek/Step 真动作。
- 单个 Request 可 `Focus Cause` 追踪 KV Block；直接从 Memory Lens 回 Scheduler Lens 选择仍在。
- A/B 在 M2 仅保存两次 Run 并切换查看摘要，完整并排对照在 M3。
- 每个分镜必须用 fixtures/事件断言证明动画没有脱离仿真。完成 E2E-04/05/07。

### Gate D4 / M3：通信/Offload/PD 和 A/B
- 完成 S05/S06/S08，Transport Lens 共享拓扑和时间。可追踪 Source→Path→Destination，竞争域、等待和时间因果。
- A/B side-by-side 仅在独立 ExperimentResult 已可重放时开放。
- 提交 E2E-08 与高密度负载的主线程性能报告。

## 标准化 Agent 起步 Prompt

> 你负责实现 InferenceLab v1.1。先完成 Gate D0：阅读 04/10/11/12 和 prototype，提出不超过一页的 UI Screen Map、状态映射、组件树、首屏/1280px 两个截图。切勿直接从 M2 核心开始写代码。遵守 UX 三项硬条件：一个共享主画布、跨 Lens 保留实体选择和 virtualTime、所有动画来自 Core Events。参考 HTML 是交互风格原型，不是仿真输出。D0 通过后按 M0/M1/M2 顺序实现；每阶段提交 Playwright 测试与截图/录屏，无数据时保持 Synthetic/Unknown 标签。不准用硬编码统计值模拟真实推理性能。

## Reviewer 质询（Agent 必须逐项回答）

1. 改 TP 之后，是更新了 Core Plan 还是仅更新了画布颜色？
2. 选中 NPU 后切到 KV，entity 与 virtualTime 是否丢失？
3. KV 未 ready 时，为何没有开始 decode？能否在事件日志定位依赖？
4. 这个 TTFT 值是测量、假设还是 N/A？与哪个框架/模型/profile 绑定？
5. 用户 5 秒内能指出「当前配置/下一步操作」吗？
6. 为什么当前动画使用这些颜色、粗细和节奏，是否对应真实 Event 类型？
7. 如果只有 1280px 宽，画布如何优先保留空间？
8. 并行模型和内存账本是否与屏幕显示的一致？

> **最终判定：** 只有同时满足 `core correctness`、`UX flow`、`visual quality` 三个 Gate，才能声称阶段完成。
