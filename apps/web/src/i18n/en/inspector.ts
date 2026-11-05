/** English copy for the resource / evidence inspector. Keys are Chinese source strings. */
export const inspector = {
  // Panel labels and shared section titles
  '资源检查器': 'Resource inspector',
  '证据检查器': 'Evidence inspector',
  'T 时刻状态': 'State at T',
  'T 时刻状态 · HBM / KV': 'State at T · HBM / KV',
  '相关事件': 'Related Events',
  '为什么': 'Why',
  '关联': 'Related',
  'T 时刻不存在': 'NOT PRESENT AT T',
  '{count} 个 Rank': '{count} ranks',
  '{count} 个 Rank 成员': '{count} ranks',
  '{count} 个事件': '{count} events',

  // Overview
  '当前系统': 'What · Current system',
  '如何阅读': 'Why · How to read this',
  '后续操作': 'Related · Next steps',
  '硬件': 'Hardware',
  '模型': 'Model',
  '节点 / 副本': 'Nodes / replicas',
  'KV 池总量': 'Total KV pool',
  '尚未运行': 'Not run yet',
  '选择画布中的设备、请求、KV Block 或链路，这里会解释它是什么、在 T 时刻处于什么状态、为什么，以及关联到哪些实体与事件。切换 Lens 不会丢失选择。':
    'Select a device, request, KV block, or link on the canvas; this panel explains what it is, its state at time T and why, and which entities and events it is connected to. Switching lenses does not clear the selection.',
  '↗ 拓扑': '↗ Topology',
  '↗ 调度': '↗ Scheduler',
  '↗ 指标': '↗ Metrics',

  // Shared section titles
  '是什么': 'What · What it is',
  '约束与来源': 'Why · Constraints and sources',
  '关联实体': 'Related · Linked entities',
  '追因果': 'Related · Trace causality',
  '状态含义': 'Why · What the state means',
  '约束': 'Why · Constraints',
  '来源与限制': 'Why · Sources and limits',

  // Device
  '厂商 / 系列': 'Vendor / Family',
  '引擎': 'Engine',
  'EP 组': 'EP Groups',
  '权重': 'Weights',
  '运行时 / 工作区': 'Runtime / Workspace',
  '余量': 'Slack',
  '运行中 / 等待': 'Running / Waiting',
  '权重 {tag}': 'Weights {tag}',
  'KV {tag}': 'kv {tag}',
  'HBM 带宽 {value}': 'HBM BW {value}',
  '↗ TP 组': '↗ TP Group',
  '↗ 引擎': '↗ Engine',
  '↗ HBM / KV': '↗ HBM / KV Lens',
  '↗ 调度 Lens': '↗ Scheduler Lens',
  'HBM 预算': 'HBM budget',
  'KV Pool 预留': 'KV pool reserved',
  'KV 使用': 'KV used',
  'Block 使用': 'Blocks used',
  'HBM 预算 = 容量 × 利用率 − 外部预留；权重来自 Tensor Inventory，KV 池是预算扣除固定占用后的预留段。KV 使用增长不会重复增加外层 HBM 承诺。':
    'HBM budget = capacity × utilization − external reserve; weights come from the tensor inventory, and the KV pool is the reserved segment left after fixed overhead. Growth in KV usage does not double-count against the outer HBM commitment.',
  '缺少 HBM 带宽：不产生时间预测。': 'HBM bandwidth is missing: no timing prediction is produced.',

  // Node
  '{count} 个 CPU 核 · DRAM 池 {pool}': '{count} CPU cores · DRAM pool {pool}',
  '节点 ID': 'Node ID',
  '引擎列表': 'Engines',
  'HBM 总容量': 'Total HBM capacity',
  '已用 KV': 'KV used',
  '节点只是物理容器；调度与 KV 池按 Engine / Rank 计算。TP 组可能跨节点，跨节点通信会经过共享 Fabric，其竞争在 Transport Lens 中显示。':
    'A node is only a physical container; scheduling and KV pools are computed per engine and rank. TP groups may span nodes, and cross-node traffic goes through the shared fabric; that contention is shown in the Transport lens.',

  // Engine
  'Prefill': 'PREFILL',
  'Decode': 'DECODE',
  '混合': 'MIXED',
  '角色': 'Role',
  'Rank 列表': 'Rank list',
  '每 Block KV 字节': 'KV bytes / block',
  '每 Rank 最大 Block 数': 'Max blocks / rank',
  '运行中': 'Running',
  '等待中': 'Waiting',
  '被抢占': 'Preempted',
  'KV Block 数': 'KV blocks',
  '预算': 'Budget',
  '↗ KV 池': '↗ KV Pool',
  'Engine 拥有独立的 KV Pool 与调度队列。DP 副本之间不共享 KV；PD 分离时 Prefill 与 Decode 是不同 Engine，KV 通过 Transfer 事件交接。':
    'Each engine owns its own KV pool and scheduling queue. DP replicas do not share KV; with PD disaggregation, prefill and decode are separate engines and KV is handed off through transfer events.',

  // Group
  '{kind} 组': '{kind} Group',
  '类型': 'Kind',
  '成员数': 'Members',
  '副本 ID': 'Replica',
  'HBM 预算合计': 'Total HBM budget',
  'KV 池预留合计': 'Total KV pool reserved',
  'TP 组内的 Rank 协作计算同一批 Token；权重按 TP 分片，KV 头也按 TP 分片。':
    'Ranks in a TP group compute the same tokens together; weights are sharded across TP, and KV heads are sharded the same way.',
  'DP 副本是独立 Engine，拥有独立 KV Pool；副本数增加不等于单请求更快。':
    'A DP replica is an independent engine with its own KV pool; more replicas do not make a single request faster.',
  'EP 按专家分片权重；当前只做结构与容量视图，不模拟 All-to-All 延迟细节。':
    'EP shards weights by expert; this is currently a structure and capacity view only and does not simulate All-to-All latency details.',
  'PD 组是角色分组：Prefill 与 Decode 使用不同 Engine，KV 通过显式传输交接。':
    'A PD group is a role grouping: prefill and decode use different engines, and KV is handed off through explicit transfers.',
  '该组由显式放置生成；不在 UI 里用乘法推断。':
    'This group comes from explicit placement; the UI does not infer it by multiplication.',

  // Request
  '输入 / 输出 Token 数': 'Prompt / Output',
  '{input} / {output} Token': '{input} / {output} tokens',
  '到达时刻': 'Arrival',
  '会话': 'Conversation',
  '{id} · 第 {turn} 轮': '{id} · turn {turn}',
  '状态': 'Status',
  'Prefill 已计算': 'Prefill computed',
  '已生成': 'Generated',
  '缓存前缀': 'Cached prefix',
  '{count} 个 Token': '{count} tokens',
  '实测 TTFT': 'Observed TTFT',
  '实测 TPOT': 'Observed TPOT',
  '等待原因': 'Waiting reason',
  '↗ 请求': '↗ Request',
  '运行完成后计算': 'Computed after the run',
  'N/A · 输出 ≤1 token': 'N/A · output ≤1 token',
  '实测': 'measured',
  '等待原因：{code}。': 'Waiting reason: {code}.',
  '请求已完成；KV Block 按保留策略可能仍可复用，后续请求可命中连续前缀。':
    'The request has finished; its KV blocks may still be reusable under the retention policy, so later requests can hit the contiguous prefix.',
  '请求已获得 Token Budget，正在 Prefill / Decode。':
    'The request has token budget and is in prefill / decode.',
  '请求已到达，等待调度准入。': 'The request has arrived and is waiting for admission.',
  '发生 {count} 次抢占；重算 Token 会反映在 Prefill 计算量中。':
    '{count} preemptions occurred; recomputed tokens are reflected in the prefill work.',
  'Prefix Cache 命中 {count} tokens，来自连续完整 Block。':
    'Prefix cache hit for {count} tokens from contiguous complete blocks.',
  'Observed 行来自导入 Trace 的显式字段；仿真 TTFT / TPOT 仍由事件日志推断，不混用观测值。':
    'Observed rows come from explicit fields in the imported trace; simulated TTFT / TPOT are still inferred from the event log and are never mixed with observed values.',
  '↗ 首个 KV Block': '↗ First KV block',
  '↗ 回到队列': '↗ Back to queue',
  '↗ KV 传输链路': '↗ KV transfer link',
  '↗ 查看 KV Pool': '↗ View KV pool',

  // Request waiting reasons (domain prose)
  '抢占后等待 KV': 'WAITING_FOR_KV_AFTER_PREEMPTION',
  '等待远端 KV': 'WAITING_FOR_REMOTE_KV',
  '主机 KV 加载中': 'HOST_KV_LOADING',
  '远端 KV 就绪': 'REMOTE_KV_READY',
  '缺少 PD 引擎': 'PD_ENGINE_MISSING',
  '抢占后重算': 'PREEMPTED_RECOMPUTE',
  '预算不足以 Prefill': 'BUDGET_TOO_SMALL_FOR_PREFILL',
  '预算不足以 Decode': 'BUDGET_TOO_SMALL_FOR_DECODE',
  'KV 分配阻塞': 'KV_ALLOC_BLOCKED',
  '调度停滞': 'SCHEDULER_STALLED',
  '已拒绝': 'REJECTED',
  'KV Pool 无足够 Block：需要等待释放、淘汰或抢占。':
    'The KV pool has no free blocks: waiting for release, eviction, or preemption.',
  '请求已被抢占并释放 KV，等待重新获得空间后重算。':
    'The request was preempted and its KV released; waiting to regain space before recomputing.',
  'Decode 端尚未收到完整 KV 传输；传输完成前不会进入 Decode。':
    'The decode side has not received the full KV transfer; decode does not start until the transfer completes.',
  '命中主机 DRAM 中的 KV Block，正在经 PCIe 加载回 HBM；加载完成前不能命中或计算。':
    'Matched a KV block in host DRAM and is loading it back to HBM over PCIe; it cannot be hit or computed until loading completes.',
  'KV 传输已完成，请求已进入 Decode Engine 队列，等待 Token Budget。':
    'The KV transfer has completed; the request is queued on the decode engine, waiting for token budget.',
  '场景缺少请求所需的 Prefill 或 Decode Engine，无法完成 PD 交接。':
    'The scenario lacks the prefill or decode engine this request needs, so the PD handoff cannot complete.',
  'KV 不足触发 recompute 抢占；已计算 Token 作废，需重算。':
    'Insufficient KV triggered a recompute preemption; already-computed tokens are discarded and must be recomputed.',
  'Token Budget 小于单个未缓存 Token 的 Prefill 需求。':
    'The token budget is smaller than the prefill cost of a single uncached token.',
  'Token Budget 小于单个未缓存 Token 的 Decode 需求。':
    'The token budget is smaller than the decode cost of a single uncached token.',
  'KV Block 分配被阻塞；等待释放、淘汰或抢占。':
    'KV block allocation is blocked; waiting for release, eviction, or preemption.',
  '调度器连续无进展，请求被拒绝。':
    'The scheduler made no progress across consecutive steps; the request was rejected.',
  '请求被拒绝；查看事件原因。': 'The request was rejected; check the event for the reason.',

  // Block
  '池 / 引擎': 'Pool / Engine',
  'Block 索引': 'Block index',
  '哈希': 'Hash',
  '父哈希': 'Parent hash',
  '字节数': 'Bytes',
  'Block 状态': 'Block state',
  '位置': 'Location',
  '引用计数': 'Ref count',
  '代次': 'Generation',
  '最近使用': 'Last used',
  '未占用': 'FREE',
  '已预留': 'RESERVED',
  '部分写入': 'PARTIAL',
  '计算完成': 'COMPLETE',
  '缓存活跃': 'CACHED_ACTIVE',
  '待复用': 'REUSABLE',
  '淘汰中': 'EVICTING',
  '写回中': 'OFFLOADING',
  '主机驻留': 'HOST_RESIDENT',
  '主机加载中': 'LOADING',
  '↗ 显存 Lens': '↗ Memory Lens',
  '该 Block 在当前虚拟时间不存在（已释放、淘汰或尚未分配）。向前/向后 Step 可查看生命周期。':
    'This block does not exist at the current virtual time (released, evicted, or not yet allocated). Step forward or back to see its lifecycle.',
  '状态由 KV Cache 事件更新。': 'The state is updated by KV cache events.',
  'LOADING 不是 READY：UI 不会提前把它显示为可读。':
    'LOADING is not READY: the UI will not show it as readable early.',
  'refCount > 1 表示多个请求共享该缓存 Block。':
    'refCount > 1 means multiple requests share this cached block.',
  'Block 已预留但尚未完成计算，不能作为 Prefix 命中。':
    'The block is reserved but not yet computed; it cannot be a prefix hit.',
  'Block 只写入了部分 Token；完整后才能进入哈希链。':
    'The block holds only some tokens; it joins the hash chain once complete.',
  'Block 已完成计算，等待或已经缓存。':
    'The block is computed and either pending caching or already cached.',
  'Block 在 HBM 中且哈希有效，可被连续前缀命中。':
    'The block is in HBM with a valid hash and can be hit as part of a contiguous prefix.',
  'Block 已无引用但保留哈希，等待 LRU 淘汰或复用。':
    'The block is unreferenced but keeps its hash, awaiting LRU eviction or reuse.',
  'Block 位于主机 DRAM；读取前需要 Load 回 HBM。':
    'The block resides in host DRAM; it must be loaded back to HBM before it can be read.',
  'Block 正在从主机加载；完成前不能 Read/Decode。':
    'The block is loading from the host; it cannot be read or decoded until loading completes.',
  'Block 正在写回主机；目标未 Ready。':
    'The block is being written back to the host; the target is not ready.',
  'Block 正被淘汰。': 'The block is being evicted.',
  'Block 空闲。': 'The block is free.',

  // Link
  '{kind} 链路': '{kind} Link',
  '起点 → 终点': 'From → To',
  '双工': 'Duplex',
  '标称带宽': 'Nominal',
  '有效比例': 'Effective ratio',
  '延迟': 'Latency',
  '有效带宽': 'Effective bandwidth',
  '竞争域容量': 'Domain capacity',
  '传输次数（运行）': 'Transfers (run)',
  'T 时刻活跃': 'Active at T',
  '共享链路': 'Shared with',
  '↗ 传输 Lens': '↗ Transport Lens',
  '同一竞争域内的传输串行排队，不把双向容量相加。有效带宽 = nominal × effective ratio；没有物理路径时不会画连线。':
    'Transfers in the same contention domain queue serially; the two directions are not added together. Effective bandwidth = nominal × effective ratio; no line is drawn when there is no physical path.',
  '当前域声明为 serialized。': 'This domain is declared serialized.',
  '↗ 使用该链路的请求': '↗ Requests using this link',

  // Metric
  '单位': 'Unit',
  '分组': 'Group',
  '数值': 'Value',
  '请求组': 'requests',
  '延迟组': 'latency',
  '吞吐组': 'throughput',
  '缓存组': 'cache',
  '调度组': 'scheduler',
  '传输组': 'transport',
  'MoE 组': 'moe',
  '观测组': 'observed',
  '证据：{ids}': 'evidence: {ids}',
  '↗ 指标 Lens': '↗ Metrics Lens',
  '该值来自导入 Trace 的显式实测字段；不参与仿真成本模型拟合，也不代表未观测请求。':
    'This value comes from an explicit measured field in the imported trace; it is not used to fit the simulated cost model and does not represent unobserved requests.',
  '该值由合成成本模型推导；只能用于机制比较，不能当作真实硬件 TTFT/TPOT。':
    'This value is derived from a synthetic cost model; use it only to compare mechanisms, not as real-hardware TTFT/TPOT.',
  '该值来自导入的校准曲线；仅当硬件、模型、框架、dtype 与 batch/seqLen 范围全部匹配时生效。':
    'This value comes from an imported calibration curve; it applies only when hardware, model, framework, dtype, and batch/seqLen range all match.',
  '该值来自事件计数或显式配置，可复现。':
    'This value comes from event counts or explicit configuration and is reproducible.',
  '缺少可计算样本，UI 不显示猜测值。':
    'No computable samples; the UI does not show guessed values.',
  '影响路径：到达 → 排队 → Prefill → [PD KV 传输] → 首 Token。可在 Request Waterfall 与 Inspector 中逐段核对。':
    'Affected path: arrival → queueing → prefill → [PD KV transfer] → first token. Verify each stage in the request waterfall and inspector.',
  '影响路径：首个 Token → 逐 Token Decode → finish；输出 ≤1 Token 时为 N/A。':
    'Affected path: first token → per-token decode → finish; N/A when output ≤1 token.',

  // Event history
  '运行后可查看与该实体关联的事件。':
    'Run the simulation to see events linked to this entity.',
  '截至 T 尚无关联事件。': 'No related events up to T.',
  '跳到事件 #{index}': 'Jump to event #{index}',

  // Missing entity and footer
  '实体不存在': 'Entity not found',
  // Singular entity-kind label; '指标' alone resolves to the plural lens title "Metrics".
  '指标实体': 'Metric',
  '当前 Plan / 虚拟时间下找不到该实体。可能已被释放、淘汰，或 Draft 已更改但 Run 仍冻结在旧 Scenario。':
    'This entity cannot be found under the current plan and virtual time. It may have been released or evicted, or the draft changed while the run remains frozen on the old scenario.',
  '↺ 回到全局': '↺ Back to global view',
  '数据：Plan / Event · 非实测': 'Data: plan / events · not measured',
} as const;
