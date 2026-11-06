# UX Review

> 本文件记录 Agent 自测与可执行的人工审核脚本。**Agent 自测不能替代真实用户试验**；当前没有 5 人（或至少 1 人）的 15 分钟可用性试验数据，已在 `KNOWN_LIMITATIONS.md` 中声明。

## 1. 审核材料

- 截图基线（`docs/screenshots/`，2026-11-06 由 `apps/web/e2e/screenshots.spec.ts` 生成）：
  - `1440x900-default.png`、`1440x900-tp8.png`、`1440x900-inspector-npu.png`、`1440x900-invalid.png`
  - `1440x900-scheduler-events.png`、`1440x900-kv-block.png`
  - `1280x800-default.png`、`1280x800-drawer.png`
  - `1920x1080-default.png`
  - `390x844-mobile.png`、`390x844-config.png`
  - `1440x900-light.png`、`1440x900-reduced-motion.png`
- Playwright：33 条用例，覆盖 E2E-01…E2E-22、性能与截图；2026-11-06 仪器化重构与 Ascend Profile 加入后全部通过。
- 性能：`docs/performance-report.json` / `docs/PERFORMANCE.md`。

## 2. 三个门禁的自测结论

| 门禁 | 结论 | 证据 |
|---|---|---|
| 机制 | 通过 | 153 条单元测试；同 seed 确定性、KV 不超额、Prefix Cache 连续命中、PD 传输完成前不 Decode、PP/SP 组结构、MLA/SFA/DSA KV 公式、MTP 接受数、检查点回放等价、校准 scope 与 batch 缩放、Host 在途容量、MoE 副本归属、Agent 路由、拓扑编辑保留/重置、未知容量不伪造、unsupported 投机方法拒绝、共享标签与 Timeline 刻度/快捷键映射、Ascend 384/64 卡 Plan 与 UB 竞争域 |
| 交互 | 通过 | E2E-01/02/04/06/08/09/10/11/12/13/14/15/16/17：操作改变 Plan/Run，选择与时间跨 Lens 保留，PP/SP 与投机卡片随预设更新，未知 Plan 需显式同意，错误可恢复；E2E-19/20 覆盖拖拽、快捷键原生控件隔离与 Escape；E2E-21/22 覆盖 910C 384 卡 Plan 与 950DT PD 传输 |
| 视觉 | 通过（Agent 自测） | 1440/1280/1920/390 截图；暗/浅色与 Reduced Motion；主画布为视觉主角，颜色均有文字/图标双编码 |

## 3. U01–U08 逐项

| ID | 自测结果 | 说明 |
|---|---|---|
| U01 | 通过 | 首屏 Header + KPI + Topology 在 5 秒内给出场景、卡数、TP/DP、质量等级与 Run 入口 |
| U02 | 通过 | 中央 Canvas 自适应 ≥500px；Config/Inspector 在窄屏变抽屉 |
| U03 | 通过 | TP16→TP8 后 Replica 2→4、Group 边界与 Inspector 同步；E2E-01 断言 |
| U04 | 通过 | 选中 `node-0-gpu-3` 切 Memory Lens 后 Inspector 仍保留实体与时间；E2E-02 |
| U05 | 通过 | Request Inspector 的 Waiting reason 与 Focus Cause 可定位 KV/链路；E2E-08 覆盖 PD 等待 |
| U06 | 通过（待真人验证） | 首屏引导卡提供 3 分钟路径；仍需真实初学者试验确认术语负担 |
| U07 | 通过 | 每个 MetricCard 带 EXACT/CALIBRATED/SYNTHETIC/N/A；导入 Trace 的聚合实测值单独标 OBSERVED；无数据时显示 N/A，不伪造精确值 |
| U08 | 通过 | Play/Pause/Step/Seek 由同一 `eventIndex`/`virtualTimeUs` 驱动；E2E-04 断言跨 Lens 时间不变，E2E-19 覆盖拖拽与 Space/方向键/数字快捷键 |

## 4. Gate D1–D4

| Gate | 状态 | 证据 |
|---|---|---|
| D1 / M0 外壳与交互语义 | 通过 | Header/Rail/Config/Canvas/Inspector/Timeline、主题、导入导出、错误边界、E2E-06 键盘可达 |
| D2 / M1 首个主画布 | 通过 | 显式放置、TP 组边界、HBM/KV 双层账本、NPU Inspector、E2E-01/02/03 |
| D3 / M2 核心动态叙事 | 通过 | 事件回放、Scheduler/Memory 同步、Prefix Cache 证据、E2E-04/05/07 |
| D4 / M3 通信/Offload/PD/A-B | 通过 | Transport Lens、竞争域、PD 等待、Host Offload、E2E-08、性能报告；A/B 并排为摘要级而非完整画布 |
| D5 / M4–M5 并行扩展与真实数据 | 通过 | PP/SP、MLA/SFA/DSA/HYBRID、MTP/DSpark 边界、校准/Trace 导入、未知模板同意流程、Ascend 910C/950DT Profile；E2E-09…E2E-17、E2E-21/22 |

### 2026-11-06 仪器化重构自测

- 实际检查 1920×1080、1440×900、1280×800、390×844 截图；覆盖配置/检查器抽屉、Header 更多菜单、浅色主题与 Reduced Motion。
- 英文工作台及实验/参考页无横向溢出；修复了英文长文案下场景 select 与一级导航重叠的问题，E2E-18 新增几何断言。
- Timeline 通道标签改为单行布局，过密末端刻度自动去重；拖拽仍按事件语义吸附到不晚于目标时间的最近事件，不伪造中间状态。
- 高密度性能门禁通过，最新数字与上一基线对比见 `docs/PERFORMANCE.md`。

## 5. 人工可用性试验脚本（15 分钟）

邀请一位未读设计文档的同事，在 1440×900 浏览器中完成：

1. **（1 min）** 说出当前场景有多少张卡、TP/DP 各多少、数据是实测还是合成。
2. **（3 min）** 把 TP16 改为 TP8，描述 Group 与 Inspector 发生了什么变化。
3. **（2 min）** 选中一张卡，查看 HBM 预算包含哪些项；区分 KV Pool 预留与 KV Block 使用。
4. **（3 min）** 运行 `prefix-cache-demo`，追踪一条请求的 Prefix Cache 命中或等待原因。
5. **（2 min）** 运行 `pd-demo`，解释为什么 Decode 在传输完成前没有开始。
6. **（2 min）** 指出至少一个 `SYNTHETIC` 或 `N/A` 数值，并说明为什么不能当作实测。
7. **（2 min）** 导入 `docs/examples/standard-trace.sample.json`，说明 Observed 与仿真推断的区别。

记录：任务成功率、卡住位置、误解来源、原话引用。若任一项失败，登记为下一个 UI 修复项；不得用 Agent 自测替代。

## 6. 当前已知 UX 缺口

- 移动端仅降级查看，不提供完整参数编辑；Timeline 支持触摸拖拽，但密集回放仍建议桌面使用。
- A/B 对比在实验页为摘要并排，不是完整双画布。
- 专家负载 Top-8 与 A2A 为合成估算，卡片已标注，但初学者仍可能误读为真实测量。
- 校准/Trace 导入入口在参考页，首次使用者可能先在工作台寻找；引导卡尚未指向该入口。
