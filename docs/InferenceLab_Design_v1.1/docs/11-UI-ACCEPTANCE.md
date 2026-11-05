# 11 · UI 质量门禁、测试与评审清单（v1.1）

> UI 体验在本项目中与仿真正确性**同等重要**。单测通过不代表 UI 合格。设计原型 `prototype/inferencelab-ui-reference.html` 只定义布局/层次/风格，不是 simulation source of truth。

## 0. 三道独立门禁

1. **机制门禁：** 单位、资源守恒、缓存状态、调度事件、版本能力、来源准确。
2. **交互门禁：** 操作真的改变 Plan 或 Run；一个实体的选择/焦点/时间能够跨 Lens 保留；错误能恢复。
3. **视觉门禁：** 画布主次分明、可读、有高信息密度但不拥挤、动画不抢焦点、视觉语言统一。

任何一关不合格，阶段不能判 `done`。

## 1. 建议的页面截图检查（每个 PR 至少覆盖相关项）

- `1440x900/desktop`：主工作台默认、TP8 后结构预览、选中 NPU Inspector、Scheduler 有事件、KV Block 详情、非法配置状态。
- `1280x800/laptop`：Inspector 折叠时仍可见主画布/Run/Timeline；没有横向滚动或遮挡。
- `1920x1080/wide`：主画布能舒展，避免小图居中浪费空间；字体不过小。
- `390x844/mobile`：明确降级模式，仍可查看设置和错误，不必支持完整拖拽。
- 深色/浅色各至少一个截图；Reduced Motion 模式下关键状态能读懂。

初期不要用「像素完全一致」作为唯一验收；更看重信息层次和关联动作，但应存储版本化 screenshot baseline，后续变更需说明原因。

## 2. 八个可观测 UX 指标

| ID | 通过标准 | 失败示例 |
|---|---|---|
| U01 | 5 秒内能看到「当前场景、卡数、TP/DP、数据证据等级、下一步行动」 | 默认一整屏只有空表单 |
| U02 | 中央 Canvas 是视觉主角，节点/卡/连接可辨认 | 左侧是参数海，右侧看不清卡 |
| U03 | TP16→TP8 后，不用重选场景就可看到 Replica 2→4 并解释差异 | 只更新 Select 的数字 |
| U04 | 选中 NPU 后另一个 Lens 仍知道当前 Entity/时间 | 切换就丢焦点 |
| U05 | 点击被阻塞的 Request 可以追踪到具体 KV Pool/Link | 只有「资源不足」Toast |
| U06 | 初学者完成 3 分钟引导实验，不需要记住所有参数词汇 | 页面只有术语与工具提示 |
| U07 | Unknown/synthetic/measured 不混淆，不显示虚假 KPI | 页面显示 TTFT=17.3s 无来源 |
| U08 | 播放/暂停/Seek 后 Canvas、Inspector、Timeline 同步 | 粒子还在动而状态不变 |

## 3. Playwright E2E 用例（必须产生截图与断言）

- `E2E-01`: 进入 Playground → 打开 Toy32 → Verify Node0/1 每16卡、TP16/DP2 → 修改 TP8 → 断言 Group=4、设备总数不变 → Save/Reload 草稿。
- `E2E-02`: 选 NPU 3 → 验证 Inspector deviceId → Memory Lens → entity/time retained → 点 budget 数值显示单位和来源。
- `E2E-03`: 配置无效 → Run disabled 或明确降级选择 → 错误指出路径与修正建议 → 修复后可 Run。
- `E2E-04`: M2 回放 → Run/Pause/Seek/Step → 断言前后 Event ID、virtualTime 和 snapshot 一致；跳 Lens 后时间不变。
- `E2E-05`: Prefix Cache hit/miss 分镜 → 两块命中、第三块不命中 → 关联到 Request → Inspector 证据解释。
- `E2E-06`: 1280×800 截图 → sidebar collapses/overlay → 主要控件仍可操作；键盘 Tab 可到 Run 和 Inspector。
- `E2E-07`: Reduced Motion → 无持续运动粒子，事件与说明仍完整。
- `E2E-08`: M3 Transfer → 传输未完成前 D 不 Decode；点选 Link Inspector 查看共享 contention domain 与本次占用。

## 4. 性能与视觉密度

- 48 Request × 1K output Token 合成场景中交互保持响应，Worker 不阻塞主线程；建议在目标开发机上 95 分位交互响应 < 150ms（**性能目标，不是保证硬件无关**），播放帧率尽量稳定 30fps 以上。
- 不能创建每 Token × 每 Layer × 每 Rank 的 DOM 节点；只有当前可见层需要渲染，聚合批次后保留事件追踪。
- 画面静止时默认没有无关动画，Hover 高亮不打乱布局；动画数量与统计无隐含比例关系。
- 关键字号 >= 13px，密集辅助标签可 11–12px；重要文本对比度建议达到 WCAG AA 4.5:1；图形/交互边界 3:1；不能只用颜色标记状态。

## 5. 人工评审任务（每个 UI 里程碑必须录屏）

找一位没有读过设计文档的人执行：
1. 说出当前有多少卡与多少个副本；
2. 把 TP16→TP8 并描述哪里变了；
3. 选一个 NPU，查看 HBM 包含什么；
4. 在 M2 之后追踪一条 Request 的 KV 命中或等待原因；
5. 指出至少一个数值是合成/假设而不是实测。

推荐 5 人（没有条件最少 1 人）进行 15 分钟可用性试验，记录任务成功率、卡住位置和误解来源，形成 `UX_REVIEW.md`。Agent 自测不能代替真实用户试验，但没有真人时也应给出可操作的审核脚本。

## 6. Stop-ship 阻断项

- 存在“Run/Pause/Step/Apply”假按钮；
- Demo 图上数值与 Core Plan/Event 不一致；
- 一条 Link 被错误地当成无限可用/两个方向容量叠加；
- GPU/NPU 物理映射与 Group 颜色不一致；
- Copy/Transfer 未 Ready UI 已显示可读取；
- Unknown 性能指标显示精确数字且无来源；
- 同一请求在跨 Lens 中失去上下文；
- 主画布被固定面板挤到不足以识别单卡；
- 不打开日志无法知道错误；
- 整个 UI 与唯一提供的设计基线严重背离且无经过确认的设计决策。

## 7. Agent 提交 UI PR 的模板

```md
### UI change
- 用户任务/入口：
- 受影响 Lens / Entity：
- Draft/Plan/Run/Event 数据来源：
- 完成的 storyboard 帧：
- 截图：1440x900、1280x800（提供路径）
- 录屏/GIF：至少一条完整操作（提供路径）
- Playwright：运行命令及真实结果
- 无障碍/reduced-motion 检查：
- 已知缺口和明确下一个修复项：
```
