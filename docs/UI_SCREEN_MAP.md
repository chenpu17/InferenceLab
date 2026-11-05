# InferenceLab · UI Screen Map（Gate D0）

> 状态：D0 设计冻结基线。依据 `04-UX.md`、`10-UX-STORYBOARDS.md`、`11-UI-ACCEPTANCE.md`、`12-AGENT-UX-FIRST.md` 与 `prototype/inferencelab-ui-reference.html`。
>
> **参考原型中的文案与数值全部是 UI 演示值，不进入 Core，也不作为任何 Plan / Event / Metric 的结果。** 本文件中所有「数据来源」均指向 `@inferencelab/core` 的真实类型或事件。

## 1. 屏幕与路由

| 路由 | 职责 | 首要任务 |
|---|---|---|
| `/#/lab` | 唯一工作台。Header + Rail + Config + Canvas + Inspector + Timeline | 观察、调参、Plan、Run、回放、追因果 |
| `/#/experiments` | 实验画廊、Run History、A/B 摘要（M2 为切换摘要，M3 为并排） | 从「想理解的问题」进入场景，比较两次结果 |
| `/#/reference` | 参数百科、版本差异、质量等级说明 | 查参数含义与支持状态，不离开当前 Run |

`/#/lab` 的五个 Observation Lens 不是五个页面，切换只改变 Canvas 叠加层与 Inspector 重点，**不重置** ScenarioSnapshot、SelectedEntity、virtualTimeUs、viewport、事件过滤。

## 2. 区域职责（1440×900 基准）

```
┌──────────── 56px Header：品牌 / 场景 / 模式 / 证据等级 | Draft 状态 | Run ───────────┐
│ 56px Rail │ 292px Config │ Canvas（>=500px，自适应） │ 308px Inspector │
│ 5 Lens    │ 分组参数     │ KPI ≤4 / 主视图 / Why bar │ What/State/Why/Related │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 190–230px Docked Timeline：虚拟时间 / 4 类事件轨道 / Play-Pause-Step-Seek / 事件详情 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

| 区域 | 职责 | 不做什么 |
|---|---|---|
| Header | 当前场景、模式（Explore / Experiment / Replay）、证据等级、Draft 状态、Run 入口 | 不放一级页面标签堆叠；Replay 未导入 Trace 时仍可进入，但横幅明示阶段时序为推断 |
| Tool Rail | 5 个 Lens 切换 + Help | 不在切换时重置选择或时间 |
| Config | 模型/硬件、并行拓扑、内存、调度、负载；一次只展开一组；显示 Support/Quality；Apply/Restore | 不把参数表单铺满首屏；不支持的功能不放假开关 |
| Canvas | 单一主视觉：拓扑 / 双层内存账本 / 调度队列 / 链路 / 指标关键路径；KPI ≤4；Breadcrumb、Fit、Legend | 不出现装饰性假动画；不按每 Token×Layer×Rank 建 DOM |
| Inspector | 四区：What / State at time T / Why / Related；证据与来源 | 点击实体只弹 JSON；无数据时显示 `N/A · 缺少校准数据` |
| Timeline | 虚拟时间、事件轨道（Prefill / KV·Transfer / Decode / Wait·Blocked）、播放游标、事件详情 | 播放/Seek 不重新仿真，不改变事件因果 |

## 3. 共享状态合同

单一 Zustand store，所有区域只读同一份状态。

| 状态 | 类型 | 写入者 | 读取者 | 规则 |
|---|---|---|---|---|
| `activeLens` | `'topology'\|'memory'\|'scheduler'\|'transport'\|'metrics'` | Rail | Canvas / Inspector / Timeline | 切换保留其他全部状态 |
| `selectedEntity` | `{kind, id, parentId?}` | Canvas / Inspector / Timeline / Experiments | 全部 | 同一实体跨 Lens 保留；实体不存在时降级到父级 |
| `focusPath` | `SelectedEntity[]` | 「查看原因 / Focus Cause」 | Breadcrumb / Canvas | 形成 `Request → KV Pool → Block` 链 |
| `draftScenario` | `Scenario` | Config / 预设 / 导入 | Plan / Run | 编辑只改 Draft，不改 activeRun |
| `draftRevision` | `number` | Config | Header / Plan | 每次编辑 +1；用于丢弃过期 Plan 响应 |
| `planPreview` | `PlanResult \| null` | Worker `PLAN` | Canvas / Inspector / Header | `unknown` 是独立状态，不等于 valid |
| `planStatus` | `idle\|planning\|ready\|invalid\|unknown` | Worker 响应 | Header / Run 按钮 | `invalid` 时 Run disabled 或显式降级 |
| `activeRun` | `SimulationResult \| null` | Worker `RUN` / History 切换 | 全部 | Run 时冻结 Scenario + ProfilesFingerprint |
| `runHistory` | `ExperimentResult[]` | Run 完成 / 保存 | Experiments / A/B | 只追加，不覆盖旧 Run |
| `virtualTimeUs` | `number` | Timeline / 事件 Step | 全部 Lens / Inspector | 所有视图同一时刻 |
| `eventIndex` | `number` | Timeline / Step | 全部 | 动画是事件投影，不是独立时钟 |
| `playbackSpeed` | `0.25\|1\|4\|16` | Timeline | Timeline | 只改变屏幕时间映射，不重跑 |
| `playing` | `boolean` | Timeline | Timeline / Canvas | `prefers-reduced-motion` 时禁用连续动画 |
| `qualityTier` | `'synthetic'\|'measured'\|'unknown'` | 由 Scenario/Plan 派生 | Header / KPI / Inspector | 任何精确指标必须显示来源等级 |
| `theme` | `'dark'\|'light'` | Header | 全部 | 浅色独立定义对比度，不反转暗色 |
| `mode` | `'explore'\|'experiment'\|'replay'` | Header | Config / Canvas | M5 起 Replay 可用；导入标准 Trace 后显示「实测复盘」，阶段时序仍标推断 |
| `onboarding` | `{step, dismissed, completed}` | 引导卡 | Canvas | 引导卡停靠画布周围，不遮挡核心图 |

状态机：`idle → editing → planning → ready | invalid | unknown → running → completed → replaying`。
`unknown` 不是合法可运行状态；需要用户显式选择「仅结构查看」或「使用已标注合成参数模拟」。

## 4. 组件树与复用边界

```
<App>
  <HashRouter>
    <AppShell>                      // Header + 当前页面 + 全局抽屉
      <Header/>                     // ScenarioPicker / ModeSwitch / QualityBadge / DraftBadge / RunButton
      <LabPage>
        <ToolRail/>                 // Lens 导航，唯一写 activeLens
        <ConfigPanel/>              // SectionGroup / ParameterRow / Segmented / PlanIssues
        <CanvasPanel>               // CanvasHeader / KpiStrip / LensSwitch(渲染) / WhyBar / OnboardingDock
          <TopologyLens/>           // NodeCard / DeviceGrid / GroupBoundary / LinkLayer
          <MemoryLens/>             // HbmLedger / KvPoolBar / BlockStrip / BlockDetailPopover
          <SchedulerLens/>          // QueueColumn / RunningColumn / PreemptedColumn / BudgetRibbon
          <TransportLens/>          // PathOverlay / LinkTable / TransferInspector
          <MetricsLens/>            // MetricCards / Waterfall / EvidenceTable
        </CanvasPanel>
        <Inspector/>                // EntityHeader / What / StateAtT / Why / Related
        <Timeline/>                 // Timecode / TransportControls / EventTracks / EventDetail
      </LabPage>
      <ExperimentsPage/>            // Gallery / RunHistory / AbCompare
      <ReferencePage/>              // ParameterTable / QualityLegend
    </AppShell>
  </HashRouter>
</App>
```

复用边界：

- `EntityRef` 是唯一选择协议，Lens 只渲染自己关心的实体，不各自维护选择。
- `PlanResult` 只经 `planPreview` 进入 UI；`SimulationResult` 只经 `activeRun` 进入 UI。
- `MetricValue` 统一处理 `value === null`、`quality`、`reason`，禁止各卡片自行格式化精确值。
- `EventTrack` 统一把 `SimEvent` 映射成时间段；任何 Lens 不自行编造动画时间。
- `WhyCard` 统一「约束 / 原因 / 证据 / 下一步」，供 Inspector 与 WhyBar 复用。

## 5. 技术数据 → 像素映射

| Core 数据 | 像素对象 | 规则 |
|---|---|---|
| `PlanResult.resolvedRanks[]` | `DeviceCell` | 一个 Rank 一个可点击设备；位置由 `nodeId` + 卡序决定，TP 改变时位置不漂移 |
| `PlanResult.groups[kind=TP/DP/EP/PP/SP/PCP/DCP/PD]` | `GroupBoundary` | 半透明边框 + 文字 `Replica n · TP16` + 实/虚线；同卡可属多组，不涂互斥色块 |
| `RankPlan.hbmBudgetBytes / hbmCommittedBytes / kvPoolReservedBytes / hbmSlackBytes` | `HbmLedger` | 外层 HBM 预算条；KV Pool 是其中已预留段，不在外层重复叠加 |
| `RankPlan.kvPoolUsedBytes` + `EngineView.kvBlocksUsed/Free` | `KvPoolBar` | 内层 used/free；Block 增长只动内层 |
| `KvBlockView.state/location/refCount/hash/parentHash` | `BlockCell` | 颜色 + 图标/文字双编码；`READY` 才可读，`LOADING` 不提前变绿 |
| `SimEvent.type` | `EventTrackSegment` | `COMPUTE_* → Prefill/Decode`；`TRANSFER_* → KV/Transfer`；`REQUEST_QUEUED/PREEMPTED → Wait/Blocked` |
| `SimEvent.timeUs` + `durationUs/endUs` | `Timeline x 坐标` | 线性映射到 `[0, endedAtUs]`；长 idle 段可折叠并显式提示 |
| `EngineView.waiting/running/preempted` | `QueueColumn` | 同一 virtualTime 的三列；预算 ribbon 来自 `lastBudgetUsed/Total` |
| `RequestView.waitingReason` / `preemptions` | `RequestChip` 状态 + Inspector Why | 可点击 `Focus Cause` 定位 KV Pool / Link |
| `RequestTrace.ttftUs/tpotUs` | `MetricCard` | `tpotUs === null` 显示 `N/A · 输出 ≤1 token`；合成时间标 `assumption` |
| `Metric.quality/evidenceIds` | `QualityBadge` + `EvidenceTable` | `unavailable`（N/A）绝不显示精确数字；导入 Trace 的 observed 指标单独标 `OBSERVED` |
| `SimulationResult.requests` | `WaterfallRow` | 每请求 arrival→first token→finish；缺失区间留空并标注原因 |
| `findTransferPath()` / `ScheduledTransfer` | `PathOverlay` | 只画真实 link path；共享 contention domain 高亮；无路径则显示不可达 |
| `activeRun.limitations/assumptionsUsed` | `LimitationsPanel` | 首屏可见 Synthetic/Unknown 提示，不藏在 Help 里 |

## 6. 首屏必须回答的五个问题

1. 当前场景是什么、有多少卡、TP/DP 各多少？（Header + KPI + Topology）
2. 当前数据是实测、合成还是未知？（Header QualityBadge + 每个 KPI 的来源）
3. 下一步能做什么？（Run / Plan 状态 / 引导卡）
4. 选中的实体是什么、属于哪个组？（Inspector What）
5. 它为什么处于当前状态？（Inspector Why + Timeline 当前事件）

## 7. 响应式降级

| 宽度 | 布局 |
|---|---|
| ≥1440 | 三栏 + 完整 Timeline |
| 1281–1439 | 三栏保留；模式切换隐藏，Metrics 网格固定 4 列 |
| 768–1280 | Config / Inspector 均为 overlay drawer；Timeline 保留可滚动事件轨 |
| <768 | 只保证场景概览、参数说明、错误与静态结果；明确「建议桌面使用」，Run 不被遮挡；保留 QualityBadge，隐藏字标与一级导航 |

## 8. 静态截图（D0）

- `docs/screenshots/d0-1440x900-reference.png`：1440×900 参考布局，三栏 + Timeline。
- `docs/screenshots/d0-1280x800-reference.png`：1280×800 参考布局，Inspector 折叠。

> 以上两张来自设计包参考原型，仅证明布局/层次基线，不是本实现的运行截图。实现后的 1440/1280 截图已追加到 `docs/screenshots/`。

## 9. D0 决策与后续实现状态

- **保留**原型的信息层次：Header 轻量、Canvas 为主、Inspector 解释、Timeline 固定。
- **修正**原型中的演示值：全部替换为 Core Plan/Event/Metric；原型 `NPU 03 / TP16 / 32 NPUs` 只作为初始预设 `toy-32gpu-tp16-dp2` 的展示。
- **修正**原型把 HBM/KV 画成单层条：实现使用外层 HBM 预算 + 内层 KV Pool 双层账本。
- **已实装**：M3 PD/Offload 与 Transport Lens、M4 MoE/EP/CP/PP/SP 结构视图、MLA/SFA/DSA KV 布局、MTP/DSpark 投机假设、M5 Trace/校准曲线导入与实测复盘。Replay 不再 disabled。
- **仍为受限支持**：PP/SP、MLA/SFA/DSA、MTP/DSpark 均为 partial/unknown 支持（均匀层切分、理想 Bubble、显式布局假设、场景接受率），CP 为 partial 支持；这些是能力边界，不是缺失视图。详见 `KNOWN_LIMITATIONS.md`。
- **已补充**：`docs/UX_REVIEW.md`、Playwright 截图 baseline 与 `docs/PERFORMANCE.md`。
