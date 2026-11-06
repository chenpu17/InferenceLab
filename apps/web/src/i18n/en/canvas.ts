/** Canvas panel and timeline copy. Keys are Chinese source strings. */
export const canvas = {
  // Lens headers
  '物理拓扑 · 并行部署': 'Physical topology · parallel deployment',
  'HBM 与 KV · 双层账本': 'HBM and KV · two-tier ledger',
  '请求队列 · Token Budget': 'Request queue · Token Budget',
  '链路 · 传输 · 竞争域': 'Links · transfers · contention domains',
  '关键路径 · 证据与质量': 'Critical path · evidence and quality',

  // Lens explanations
  '设备位置来自 Plan.resolvedRanks，TP 改变只重组组边界与 DP 副本，不移动物理卡。':
    'Device placement comes from Plan.resolvedRanks; changing TP only regroups group boundaries and DP replicas — physical cards do not move.',
  'KV Pool 是 HBM 预算中的已预留段；Block 增长只改变内层 used/free，不重复增加外层 HBM 承诺。':
    'The KV pool is a reserved segment of the HBM budget; block growth only changes the inner used/free, never double-counting the outer HBM commitment.',
  '预算按 max_num_batched_tokens 扣减；这是 vLLM V1 的机制子集，并非逐行复刻源码。':
    'The budget is decremented by max_num_batched_tokens; this is a mechanism subset of vLLM V1, not a line-by-line port of the source.',
  '传输时长与共享竞争域来自 TransferScheduler；没有物理路径时不会凭空画连线。':
    'Transfer durations and shared contention domains come from TransferScheduler; no link is drawn without a physical path.',
  '时间指标使用标注过的合成成本模型；输出 ≤1 token 时 TPOT 显示 N/A，不猜数字。':
    'Timing metrics use a labelled synthetic cost model; TPOT shows N/A when output is ≤1 token — no guessed numbers.',

  // Engine roles rendered through lt()
  prefill: 'Prefill',
  decode: 'Decode',

  // KPI names
  '加速卡总数': 'Total accelerators',
  'TP 组规模': 'TP Group Size',
  'DP 副本': 'DP Replicas',
  'PP Stage 数': 'PP stages',
  'SP 规模': 'SP size',
  '模型适配状态': 'Model fit status',
  '运行中': 'Running',
  '等待中': 'Waiting',
  '每卡 HBM 预算': 'HBM budget per card',
  '每卡 KV 预留': 'KV reservation per card',
  'KV 当前占用': 'Current KV usage',
  'KV 峰值': 'Peak KV',
  '{method} 期望加速': '{method} expected speedup',
  '抢占次数': 'Preemptions',
  '已放置 Rank': 'Placed ranks',
  '传输事件': 'Transfer events',
  '竞争域': 'Contention domains',
  '传输字节': 'Transferred bytes',
  '完成 / 总数': 'Finished / total',
  '输出吞吐': 'Output throughput',

  // KPI values and units
  '卡': 'cards',
  '序列': 'seqs',
  '次': 'transfers',

  // KPI captions
  'Plan 未生成': 'Plan not generated',
  'Plan 解析后的 Rank': 'Plan.resolvedRanks',
  '{count} 节点 · Plan': '{count} nodes · Plan',
  'Rank / 组': 'Rank / group',
  '独立引擎': 'Independent engines',
  '气泡 {bubble}% · 假设': 'bubble {bubble}% · assumption',
  '复用 TP Rank · 不新增设备': 'reuses TP ranks · no extra devices',
  '需真实 Profile 校准': 'Requires real profile calibration',
  'Plan 结构结论': 'Plan structural conclusion',
  '容量 × 利用率 − 外部预留': 'Capacity × utilization − external reservation',
  'unknown · KV 布局不可计算': 'unknown · KV layout not computable',
  'unknown · 容量不可计算': 'unknown · capacity not computable',
  '{count} blocks · 显式 KV 预算（容量未验证）': '{count} blocks · explicit KV budget (capacity unverified)',
  '{count} 个 Block · block={size}': '{count} blocks · block={size}',
  '事件回放 @ T': 'Event replay @ T',
  '运行后按事件更新': 'Updated per event after a run',
  '需要 Run': 'Requires a run',
  'unknown · 适配器未声明支持': 'unknown · adapter declares no support',
  'unsupported · 适配器明确不支持': 'unsupported · adapter explicitly does not support it',
  'assumption · 接受率决定收益': 'assumption · acceptance rate drives the gain',
  '当前调度迭代': 'Current scheduling iteration',
  'FCFS 等待队列': 'FCFS wait queue',
  'recompute 策略': 'recompute policy',
  '来自事件日志': 'From the event log',
  '当前 Run 无 KV 传输': 'No KV transfers in this run',
  '共享域串行调度': 'Serialized scheduling in shared domains',
  'exact · 请求累计': 'exact · accumulated per request',
  'assumption · 合成成本模型': 'assumption · synthetic cost model',
  '输出 ≤1 token 时为 N/A': 'N/A when output is ≤1 token',
  'assumption · 仿真窗口': 'assumption · simulation window',

  // Canvas chrome
  '主观察画布': 'Main observation canvas',
  '清除选择并回到全局视图': 'Clear selection and return to the global view',
  '图例': 'Legend',
  '焦点路径': 'Focus path',
  '全部': 'ALL',
  '计算 / Prefill': 'Compute / Prefill',
  'KV / Decode / 就绪': 'KV / Decode / Ready',
  '传输 / DMA / P→D': 'Transfer / DMA / P→D',
  '排队 / 等待': 'Queued / Wait',
  'OOM / 阻塞 / 无效': 'OOM / Blocked / Invalid',
  '未知 / 未校准': 'Unknown / Uncalibrated',
  '建议桌面使用：窄屏只保证场景概览、参数说明与静态结果，编辑与回放体验不完整。':
    'Desktop recommended: on narrow screens only the scenario overview, parameter descriptions, and static results are guaranteed; editing and replay are incomplete.',
  '机制解释': 'Mechanism',
  '观察提示': 'Observation hint',
  '查看原因 →': 'See why →',
  '颜色图例': 'Colour legend',
  '颜色永远辅以文字或图标；不单凭颜色编码状态。':
    'Colour is always paired with text or an icon; state is never encoded by colour alone.',
  '当前是结构预览，未运行仿真。': 'This is a structural preview; no simulation has run.',
  '回到拓扑': 'Back to topology',
  '所有动画都来自冻结的事件日志': 'All animation comes from the frozen event log',
  '回放 · {count} 事件 · {time} 虚拟': 'Replay · {count} events · {time} virtual',

  // Topology lens chrome
  '副本 {replica}': 'Replica {replica}',
  ' · PP Stage {stage}': ' · PP Stage {stage}',
  '规划中…': 'planning…',
  '{nodes} 节点 / {accelerators} 加速卡': '{nodes} NODES / {accelerators} ACCELERATORS',
  'EP 组 {count}': 'EP groups {count}',
  'PP Stage {count}': 'PP stages {count}',
  'SP 组 {count}': 'SP groups {count}',
  'PCP 组 {count}': 'PCP groups {count}',
  'DCP 组 {count}': 'DCP groups {count}',
  '物理布局 · 非等比': 'PHYSICAL LAYOUT · NOT TO SCALE',
  '{count} ranks · 物理': '{count} ranks · physical',
  'TP 组 {id} · {count} ranks': 'TP Group {id} · {count} ranks',
  '{count} 个 Rank': '{count} ranks',
  '⟷ Fabric / 链路 · {links} 链路 · {domains} 竞争域':
    '⟷ Fabric / Link · {links} links · {domains} domains',

  // Trace / run banners
  '实测复盘': 'Replay',
  '来源 {source} · {count} 请求 · 观测值 {observed} 条':
    'Source {source} · {count} requests · {observed} observed',
  '检测到 events 字段，但当前不用于阶段时序': 'events field detected but not used for stage timing',
  '仅请求级观测，阶段时序仍为推断': 'request-level observations only; stage timing remains inferred',
  '未导入 Trace · 当前为仿真事件回放，不是实测数据':
    'No trace imported · replaying simulated events, not measured data',
  '无法运行': 'Cannot run',
  '关闭': 'Close',
  '校准曲线': 'Calibration curves',
  '{count} 条已导入；仅匹配硬件/模型/框架/dtype/范围的指标会升级为 CALIBRATED。':
    '{count} imported; only metrics matching hardware/model/framework/dtype/range are upgraded to CALIBRATED.',

  // Timeline
  '展开 Timeline': 'Expand Timeline',
  '收起 Timeline': 'Collapse Timeline',
  '时间线': 'Timeline',
  '事件日志': 'Event log',
  '事件日志回放': 'Event log replay',
  '事件 {current} / {total}': 'event {current} / {total}',
  '结束 {time}': 'end {time}',
  '+{count} 条泳道': '+{count} lanes',
  'Prefill 计算': 'Prefill compute',
  'KV / 传输': 'KV / Transfer',
  '等待 / 阻塞': 'Wait / blocked',
  '阻塞 / 拒绝': 'blocked / rejected',
  '等待': 'waiting',
  '结束时仍在等待': 'waiting at end',
  'Prefill 计算 · {engineId}': 'Prefill compute · {engineId}',
  'Decode · {engineId}': 'Decode · {engineId}',
  '混合 · {engineId}': 'Mixed · {engineId}',
  '运行后可播放': 'Available after a run',
  '运行后可单步': 'Step through after a run',
  '点击 Header 的“运行实验”后，这里按事件日志播放 Prefill、Decode、Transfer 与等待区间；动画只来自事件，不伪造进度。':
    'After clicking “Run experiment” in the Header, Prefill, Decode, Transfer, and wait intervals play from the event log here; animation comes only from events and never fakes progress.',
  '回到起点': 'Back to start',
  '已开启减少动态：仍可手动单步': 'Reduced motion is on: manual stepping still works',
  '暂停': 'Pause',
  '播放': 'Play',
  '单步事件': 'Step one event',
  '跳到下一个调度迭代': 'Jump to the next scheduling iteration',
  '下一个调度迭代': 'Next scheduling iteration',
  '播放速度': 'Playback speed',
  '虚拟时间游标': 'Virtual time cursor',
  '时间刻度': 'Time scale',
  'Space 播放/暂停 · ←/→ 单事件 · Shift+←/→ 10 事件 · 1–5 切换 Lens':
    'Space play/pause · ←/→ one event · Shift+←/→ ten events · 1–5 switch Lens',
  '{label} 轨道；方向键按 1% 步进，Home/End 跳到首尾':
    '{label} track; arrow keys step by 1%, Home/End jump to start/end',
  '点击或拖拽轨道跳转时间，点击区间跳到该区间内的时刻；回放由 ReplayIndex 重建，不修改已冻结的 Run。':
    'Click or drag a track to seek time, or select a segment to jump to a moment inside it; replay is rebuilt from ReplayIndex and never modifies the frozen run.',
  'exact · 事件统计': 'exact · event counts',
} as const;
