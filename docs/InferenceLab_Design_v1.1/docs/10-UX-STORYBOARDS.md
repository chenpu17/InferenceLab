# 10 · 交互分镜与视觉叙事（v1.1）

> 此文定义「用户动作 → Core state → UI 变化 → 解释文案 → 下一步」五元组；属于可执行交互规范而非素材建议。所有数值均以 Core 返回为准；示例只说明结构。

## S01 · 首次打开：3 分钟理解 TP / DP（M1）

**目标心智模型：** 物理卡数不变，TP 的协同范围和 DP 的独立副本数发生变化；相关约束必须重新计算。

| 帧 | 用户动作 | 画布变化 | 旁白/Inspector | 检查点 |
|---|---|---|---|---|
| 0 | 选择 `32 GPU · Toy Dense` | 两台服务器，各 16 卡，当前 TP16/DP2 组外框 | `32 张卡，2 个数据副本` | 布局真实自 placement |
| 1 | Hover `TP16` | 只高亮一组的 16 卡和其通信边 | `一个 TP 组由 16 卡协作` | Hover 不更新 Scenario |
| 2 | 点击 `TP8` | 设备位置保持，组边框重组，4 个 DP 组；标题 `2→4 replicas` | 每卡 Budget 字节差异；unknown 则显示 N/A | `PLAN` 后更新 Preview |
| 3 | 点击设备 `NPU 03` | 设备高亮，右侧展示 weights/kv/runtime/slack | 显示对应 Replica、TP Group | Inspector 同步 selected ID |
| 4 | 点击 `查看原因` | 同一画布定位变化 group，关联卡亮起 | 解释容量/通信/请求路由变化是模型决定还是假设 | 文案不得“必然更快” |
| 5 | 点击 `运行实验` (M2) | Draft 冻结，进入运行 | 标注当前数据等级 | 旧 Run 不被覆盖 |

交互约束：0.15–0.35s 的 Group 边界过渡、物理卡不漂移；降低动态效果时直接切换布局。组颜色之外每组保留文字、虚实线区别。

## S02 · HBM 与 KV Pool（M1 → M2）

用户选择 NPU → 打开 Memory Lens。画布进入双层分解：上层 `HBM 物理预算`（weights/runtime/graph/comm/KV reservation/slack），下层 `KV Pool 预留空间`（used/free blocks）。按请求进度新增 KV Block 后，下层的 used 增长、free 减少；**若 KV pool 已预留，不应再叠加增加外层 HBM 预算占用**。点击分段显示 `字节数 / 单位 / 来源 / 是否来自实测`。KV 超预算时显示 `为什么不能再分配` 和阻塞 Request，而不只是数字飘红。

## S03 · Prefix Cache Block 命中（M2）

场景：Request A/B 共享前两个完整 Block，第三个不同；B 的第四块内容即使文本相同也不能绕过第三块继续按前缀命中。先选 Request B → 点击 `Step`：

1. 第一块在 Hash chain 上高亮绿色，并显示 `HIT · prefix block 0`；
2. 第二块同上；
3. 第三块显示 `MISS · hash changed`，从此后面的块置灰、显示 `not eligible for contiguous prefix hit`；
4. Inspector 显示 2 complete blocks saved / computed prompt tokens，除以明确的分母；
5. 用户点击第三块，看到 `parentHash`、`blockTokensFingerprint`、`fullBlock`、`refCount`。

要求：每一次高亮来自事件与 cache manager 的真实计算结果，不能通过事先写死 `if blockIndex==2` 操作 UI。

## S04 · Scheduler Token Budget 8（M2）

顶部是 `Per-iteration budget [########] 8/8`。左侧 WAITING（A6/B6），中间 RUNNING，右侧小字说明本轮调度 policy。按 `Step Scheduler` 第一步：A 得 6、B 得 2，Budget 柱显示两段带文字 A:6 B:2；第二步：B 得 4，剩余预算是否利用取决于策略和其他请求。用户调整 `max_num_seqs` 后显示这限制的是当前 step 可同时调度的 sequences，不是客户端 TCP 连接数；Invalid 时禁用 Run。

如果系统使用近似 V1 子集策略，旁白必须说 `这是 vLLM V1 的机制子集，并非逐行复刻源码`。

## S05 · HBM ↔ Host DRAM KV Offload（M3）

Memory Lens 显示 NPU HBM 与 CPU NUMA DRAM；Transport Lens 在同一物理拓扑上叠加 PCIe/互联通道；Bottom Timeline 有 `HBM read`, `DMA`, `Host write`, `Block Ready` 四种事件轨道。按 Step：

1. Block 显示 `GPU_RESIDENT/READY`；
2. Offload 启动，Host target RESERVED，Transfer Path 橙色流动；
3. Transfer pending 时 Host Block 仍非 READY；HBM 源有 pin/ref（策略决定是否保留）；
4. Transfer complete，Host block READY，GPU 源按策略释放或保留；
5. 下一轮请求 Host hit，发起 Load，完成前目标不能 Read/Decode；
6. 比较 Offload/No Offload 的 KV capacity 与 transfer bytes（存在时间模型才显示耗时估算）。

要求画布左上角始终有 `Synthetic` 或 `Measured` 证据提示，任何 UI 控件不得隐式改变模型。

## S06 · PD 分离与网络争用（M3）

展示 P 与 D 分属不同 Engine，顶层由两台 Node 和 NIC/Fabric 构成；点击 Request 后，底部出现 P-compute、P-DMA、Fabric、D-DMA、D-wait、D-decode 六轨。选中第一条 KV Transfer 依次高亮 `P HBM → P NIC → Fabric → D NIC → D HBM`（依配置真实 Path，可以不同）。同时第二条传输占相同 contention domain 时显示拥塞与带宽分享；更改网络速率仅影响新的实验结果。

Inspector 对每条传输必须提供：bytes、source/dest、link path、共享域、start/done、waiting cause、所处 critical path。没有 calibrate 数据时显示 `理论下界/假设仿真` 而不是“当前真实耗时”。

## S07 · 在一次交互中理解三个问题（跨 Lens）

选 `Request 17` → Scheduler 等待原因 `KV_ALLOC_BLOCKED` → 点击 Why → 转到 Memory Lens 聚焦对应 KV Pool → 点击占满池的 cached blocks → 检查 refs 与淘汰状态 → 选择 `S01` / `S05` 操作进行实验。全过程 Selected Request 与 virtualTime 保留，面包屑显示 `Request 17 → KV pool 2 → Block 0x12`。

**重要：** 不得在不同页面之间把上下文重置，否则用户不会理解因果链条。

## S08 · Snapshot / A/B（M2 简版，M3 完整）

M2：两次 Run 保存为 `Experiment A/B`，右上 Run History 下拉切换结果，展示 delta 的文字版（例如副本数、已调度 Token、KV 使用峰值），**不要求**并排同步动画；M3：两个 Scenario 并列、共用 workload + seed，有独立 virtualTime 和时间匹配策略；对照结果需显示每项来源等级与不可比字段。

## S09 · 引导内容模板（可直接成为 UI 文案）

- `观察`：当前 32 张卡被划分成 2 个独立调度副本，每个副本内 16 卡协作。
- `操作`：把 TP 调成 8，观察物理卡不动，但组的边界和副本数变化。
- `解释`：每个副本需要放得下本模型；不能只因副本更多就断定吞吐增加。
- `继续`：选择一张卡，看看权重和 KV 分别占了多少 HBM。
- `验证`：尝试增加请求的上下文长度，看看哪些约束先出现。

每个引导卡在画布周围停靠，不遮挡核心图；支持 Skip/Back/Resume。
