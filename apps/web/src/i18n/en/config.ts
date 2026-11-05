/**
 * English copy for the configuration panel and UI-generated scenario/import
 * messages. Keys are Chinese source strings; placeholders use {name}.
 */
export const config = {
  '控制面板': 'Control panel',
  '开': 'ON',
  '关': 'OFF',
  '实验配置': 'Experiment configuration',
  '改变参数，观察系统如何重新组织。编辑只更新 Draft，不篡改已冻结的 Run。':
    'Change parameters and observe how the system reorganizes. Edits only update the Draft and never alter a frozen Run.',

  '模型与硬件': 'Model & hardware',
  '模型画像': 'Model profile',
  '模型 Profile 决定权重、KV 布局与专家结构。':
    'The model profile determines weights, KV layout, and expert structure.',
  '硬件拓扑': 'Hardware topology',
  '硬件 Profile 决定节点、加速卡、HBM 容量与链路。':
    'The hardware profile determines nodes, accelerators, HBM capacity, and links.',
  '节点': 'Nodes',
  'Attention 层': 'Attention layers',
  '该硬件只提供结构模板；算力/带宽未知，Run 需要显式选择合成参数。':
    'This hardware only provides a structural template; compute and bandwidth are unknown, so a Run requires explicitly choosing synthetic parameters.',
  '未知 Profile': 'Unknown Profile',

  '并行拓扑': 'Parallel topology',
  '张量并行（TP）': 'Tensor Parallel (TP)',
  '数据并行（DP）': 'Data Parallel (DP)',
  'TP 组': 'TP group',
  '副本': 'Replicas',
  '总卡数': 'Total cards',
  'TP 组内协作处理同一批 Token；改变 TP 会重新生成显式 Device→Rank 放置。':
    'TP groups cooperate on the same batch of tokens; changing TP regenerates the explicit Device→Rank placement.',
  'TP 大小': 'TP size',
  '每个 DP 副本有独立 Engine 与 KV Pool；总卡数不变时 TP 与 DP 互相调整。':
    'Each DP replica has its own Engine and KV pool; with a fixed card count, TP and DP adjust against each other.',
  '保持物理卡总数不变，TP 调整会改变组边界与副本数；不能仅凭副本更多就断定吞吐增加。':
    'With the total physical card count fixed, changing TP changes group boundaries and replica counts; more replicas alone do not imply higher throughput.',
  'KV Transfer 策略': 'KV transfer strategy',
  'PD_PULL 由 Decode 拉取；LAYERWISE 为同一物理路径的分层推送（当前只按整段计时）；HOST_STAGING 经本地 Host 两段传输。':
    'PD_PULL pulls from the Decode side; LAYERWISE pushes layer by layer over the same physical path (currently timed as one segment); HOST_STAGING transfers in two legs through local host memory.',
  'PD 分离：Prefill Engine 完成后通过共享 Fabric 将 KV 传给 Decode Engine。策略：':
    'PD disaggregation: after the Prefill Engine finishes, KV is sent to the Decode Engine over the shared Fabric. Strategy:',
  ' · 传输完成前 Decode 侧不会进入 Decode。':
    ' · The Decode side does not enter Decode until the transfer completes.',
  'EP 需要 MoE 模型；DCP 复用 TP Rank，PCP 在显式放置中增加 Rank。':
    'EP requires a MoE model; DCP reuses TP ranks, while PCP adds ranks in the explicit placement.',
  '每 Rank 驻留 {perRank} 个基础专家 + {redundant} 个冗余副本；Topology 显示 EP/PCP/DCP 叠加，Memory 显示专家权重与负载。':
    'Each rank hosts {perRank} base experts; redundant replicas per rank: {redundant}. Topology shows the EP/PCP/DCP overlay, and Memory shows expert weights and load.',
  '当前模型为 Dense；EP/CP 结构仅对 MoE 或显式 CP Preset 生效。':
    'The current model is Dense; EP/CP structures only apply to MoE models or explicit CP presets.',
  '{count} 个专家 · top-{topK}': '{count} experts · top-{topK}',

  '内存与 KV': 'Memory & KV',
  '显式 KV 预算': 'Explicit KV budget',
  '留空表示使用 HBM 预算扣除固定占用后的全部余量。':
    'Leave empty to use the full HBM budget remaining after fixed overheads.',
  '自动': 'Auto',
  'GPU 显存利用率': 'GPU memory utilization',
  'HBM 预算 = 容量 × 利用率 − 外部预留。':
    'HBM budget = capacity × utilization − external reservation.',
  'KV Block 大小': 'KV block size',
  '影响 KV 池块数与 Prefix 匹配粒度。':
    'Affects the number of KV pool blocks and prefix match granularity.',
  '前缀缓存': 'Prefix Caching',
  '分块 Prefill': 'Chunked Prefill',
  'CPU 卸载': 'CPU Offload',
  '{value} 个 Token': '{value} tokens',
  '保留完整块的哈希；只做连续前缀匹配。':
    'Hashes whole blocks; only contiguous prefix matches are used.',
  '允许长 Prompt 跨多个调度迭代分块计算。':
    'Allows long prompts to be computed in chunks across multiple scheduling iterations.',
  'M3：完整 Block 的主机驻留/回迁；不做逐层流水。':
    'M3: whole-block host residency and migration; no per-layer pipelining.',
  '主机侧 KV 缓存容量上界。': 'Upper bound on host-side KV cache capacity.',
  '每卡 KV 池预留': 'KV pool reserved per card',

  '调度参数': 'Scheduling parameters',
  '一次调度迭代可处理的 Prefill + Decode Token 上限。':
    'Upper bound on Prefill + Decode tokens processed in one scheduling iteration.',
  '一次迭代可同时调度的序列数上限；不是 TCP 连接数。':
    'Upper bound on sequences scheduled concurrently in one iteration; not a TCP connection count.',
  '抢占策略': 'Preemption policy',
  'recompute 会释放受害者 KV 并重算；none 表示 KV 不足时等待/拒绝。':
    'recompute releases the victim KV and recomputes; none means wait/reject when KV is insufficient.',
  'backend-specific（未建模）': 'backend-specific (not modelled)',
  '这是 vLLM V1 的机制子集，并非逐行复刻源码；调度顺序与预算扣减可由事件日志复核。':
    'This is a mechanism subset of vLLM V1, not a line-by-line reproduction of the source; scheduling order and budget deductions can be audited from the event log.',

  '负载': 'Workload',
  '请求数': 'Request count',
  '输入 Token 数': 'Prompt tokens',
  '输出 Token 数': 'Output tokens',
  '同时到达的固定负载请求数。': 'Number of fixed-workload requests arriving simultaneously.',
  '每个请求的输入长度。': 'Input length per request.',
  '每个请求的输出长度；≤1 时 TPOT 为 N/A。':
    'Output length per request; TPOT is N/A when ≤1.',
  '请求数 × 长度': 'Requests × length',
  '当前负载来自 Preset 的显式 Trace / Agent 配置。M2 通过 JSON 导入修改；表单编辑将在后续里程碑开放。':
    'The current workload comes from an explicit Trace / Agent configuration in a preset. M2 changes it via JSON import; form editing will open in a later milestone.',

  '校验与证据': 'Validation & evidence',
  '可行': 'Feasible',
  '未知': 'Unknown',
  '无效': 'Invalid',
  '规划中': 'Planning',
  '{count} 个错误': '{count} errors',
  '{count} 个警告': '{count} warnings',
  '{count} 条信息': '{count} info',
  'Plan 状态': 'Plan status',
  '导入失败：{message}': 'Import failed: {message}',
  '结构不合法': 'Invalid structure',
  '用当前 Run 的冻结 Scenario 覆盖 Draft':
    'Overwrite the Draft with the frozen Scenario of the current Run',
  '尚无 Run': 'No Run yet',
  '↺ 回到 Run': '↺ Back to Run',
  '↧ 导出': '↧ Export',
  '↥ 导入': '↥ Import',
  '数据来源：{model} Model / {hardware} Hardware':
    'Data source: {model} Model / {hardware} Hardware',
  '合成': 'Synthetic',
  '不用于真实 TTFT、TPOT 或吞吐预测。':
    'Not for real TTFT, TPOT, or throughput prediction.',

  // UI-generated ValidationIssue copy from lib/scenario.ts.
  '降低并行度，或选择拥有更多加速卡的硬件 Profile。':
    'Reduce parallelism, or choose a hardware profile with more accelerators.',
  '重新选择该并行维度，或使用对应的预设模板。':
    'Reselect that parallel dimension, or use the corresponding preset template.',
  'TP/DP 调整后每个 Engine 的 Rank 数不能整除 EP={ep}；已关闭 EP，避免逻辑参数与放置不一致。':
    "After the TP/DP change, each Engine's rank count is not divisible by EP={ep}; EP has been disabled to keep logical parameters consistent with placement.",
  'PD 分离场景请调整 Prefill/Decode 并行度，而不是混合 TP。':
    'For a PD-disaggregated scenario, adjust Prefill/Decode parallelism instead of mixed TP.',
  'PD 分离场景请调整 Prefill/Decode 并行度，而不是混合 DP。':
    'For a PD-disaggregated scenario, adjust Prefill/Decode parallelism instead of mixed DP.',
  '硬件 Profile 不存在。': 'The hardware profile does not exist.',
  'TP={tp} 与当前 PP/PCP={unit} 需要 {required} 张卡，但硬件只有 {deviceCount} 张。':
    'TP={tp} with the current PP/PCP={unit} requires {required} cards, but the hardware only has {deviceCount}.',

  // workloadSummary() templates from lib/scenario.ts.
  'Trace · {count} 请求': 'Trace · {count} requests',
  '固定 · {count} × ({prompt}+{output})': 'Fixed · {count} × ({prompt}+{output})',
  'Poisson · {count} 请求 @ {rate}/s': 'Poisson · {count} requests @ {rate}/s',
  'Agent · {conversations} 会话 × {turns} 轮':
    'Agent · {conversations} conversations × {turns} turns',

  // File-size guard from lib/import.ts.
  '文件 {name} 为 {sizeMb} MB，超过 {limit} MB 导入上限。':
    'File {name} is {sizeMb} MB, exceeding the {limit} MB import limit.',
} as const;
