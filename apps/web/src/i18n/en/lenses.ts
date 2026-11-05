/** Lens labels, hints, and lens-specific copy. */
export const lenses = {
  '拓扑': 'Topology',
  '显存': 'Memory',
  '调度': 'Scheduler',
  '传输': 'Transport',
  '指标': 'Metrics',
  '物理拓扑 / TP·DP·EP 组': 'Physical topology / TP·DP·EP groups',
  'HBM 预算 / KV Pool / Block': 'HBM budget / KV pool / blocks',
  'Waiting / Running / Token Budget': 'Waiting / running / token budget',
  '链路 / 传输 / 竞争域': 'Links / transfers / contention domains',
  '关键路径 / 证据 / 质量': 'Critical path / evidence / quality',
  '观察层': 'Observation lenses',
  '3 分钟引导 / 帮助': '3-minute guide / help',

  // Topology lens
  '尚未生成结构预览': 'No structural preview yet',
  '修改配置后会自动 Plan；或检查右侧的校验错误。':
    'The plan regenerates automatically after configuration changes; or check the validation errors on the right.',
  '已选择 {label}；切换 Lens 会保留该设备与虚拟时间。':
    'Selected {label}; switching lenses keeps this device and virtual time.',
  '已选择 {label}；{kind} 组内设备共享该维度通信域，但每张卡仍有独立 HBM 预算。':
    'Selected {label}; devices in the {kind} group share this communication domain, but each accelerator keeps its own HBM budget.',
  ' DCP 复用 TP Rank，不新增设备。': ' DCP reuses TP ranks and adds no devices.',
  ' PCP 是显式放置维度，可能增加 Rank 数。':
    ' PCP is an explicit placement dimension and may increase the rank count.',
  ' PP Stage 持有连续层范围，Activation 在 Stage 间传递。':
    ' A PP stage holds a contiguous layer range; activations pass between stages.',
  ' SP 复用 TP Rank，只沿序列维切分 Activation，不新增设备。':
    ' SP reuses TP ranks and shards activations along the sequence dimension only; it adds no devices.',
  'EP 分组与 TP/DP 叠加显示；同一张卡可以同时属于 TP、DP 与 EP 组。专家权重按 EP 分片，而不是再乘一次 TP。':
    'EP groups are overlaid with TP/DP; one accelerator can belong to TP, DP, and EP groups at once. Expert weights are sharded by EP rather than multiplied by TP again.',
  'PP{ppSize}：{stages} 个 Stage 各持有连续层范围；理想 Bubble {bubble}%，跨 Stage Activation 仅按结构成本估算。':
    'PP{ppSize}: {stages} stages each hold a contiguous layer range; ideal bubble {bubble}%, and cross-stage activation is estimated from structural cost only.',
  'SP{spSize} 复用 TP Rank，把 Activation 沿序列维切分；Workspace 不随之切分。它不是 PCP/DCP 的上下文 KV 切分，也不新增设备。':
    'SP{spSize} reuses TP ranks and shards activations along the sequence dimension; workspace is not sharded with it. It is not PCP/DCP context KV sharding and adds no devices.',
  '查看该设备的 HBM / KV →': "View this device's HBM / KV →",

  // Memory lens
  '权重': 'Weights',
  '运行时 / 工作区': 'Runtime / Workspace',
  '余量': 'Slack',
  'KV Pool 预留': 'KV Pool reserved',
  'HBM 预算不可计算（容量或利用率未知）。':
    'HBM budget cannot be computed (capacity or utilization unknown).',
  'HBM 预算组成': 'HBM budget composition',
  'HBM 预算': 'HBM budget',
  'HBM · 外层账本': 'HBM · EXTERNAL LEDGER',
  'KV 池 · 内层账本': 'KV POOL · INTERNAL LEDGER',
  '尚无内存账本': 'No memory ledger yet',
  '需要可计算的权重与 KV 布局；Unknown 模板不会显示猜测容量。':
    'Requires computable weight and KV layouts; Unknown templates never show guessed capacity.',
  '所选实体不在当前 Plan，已显示 Rank 0；切换回 Topology 可重新选择。':
    'The selected entity is not in the current plan; showing Rank 0. Switch back to Topology to reselect.',
  'Rank 列表': 'Rank list',
  'Rank 列表 · {count}': 'RANKS · {count}',
  '{accelerator} · {engine} · KV {used}/{total} Block':
    '{accelerator} · {engine} · KV {used}/{total} blocks',
  '权重为 Unknown，HBM 总构成不可验证；KV 预留 {bytes} 来自显式 kv_cache_memory_bytes，仅用于合成运行。':
    'Weights are Unknown, so the total HBM composition cannot be verified; the {bytes} KV reservation comes from explicit kv_cache_memory_bytes and is used only for synthetic runs.',
  '权重或 KV 布局为 Unknown，HBM 构成与 KV 预留不可计算；不显示猜测容量。':
    'Weight or KV layout is Unknown, so HBM composition and KV reservation cannot be computed; no guessed capacity is shown.',
  'KV Pool 是 HBM 预算中的已预留段；请求新增 Block 只增加下层 used，不会重复增加外层 HBM 承诺。':
    'The KV pool is a reserved segment of the HBM budget; new request blocks only increase lower-level used bytes and never double-count the outer HBM commitment.',
  'KV Cache · {count} 块': 'KV Cache · {count} blocks',
  'KV 布局 Unknown': 'KV layout Unknown',
  'KV 布局为 Unknown，无法计算 Block 数、每 Token 字节与池容量。':
    'KV layout is Unknown; block count, bytes per token, and pool capacity cannot be computed.',
  'KV Pool 使用率': 'KV pool utilization',
  '已用': 'Used',
  '空闲': 'Free',
  '块数': 'Blocks',
  '每 Token 字节': 'Bytes / token',
  '峰值（运行）': 'Peak (run)',
  'KV Block 状态': 'KV block states',
  'Block {index}，状态 {state}，位置 {location}，引用 {refs}':
    'Block {index}, state {state}, location {location}, refs {refs}',
  '{count} 个空闲 Block': '{count} free blocks',
  '预留': 'reserved',
  '已完成': 'complete',
  '已缓存': 'cached',
  '可复用': 'reusable',
  '主机': 'host',
  '加载中': 'loading',
  'KV 池为空：block_size 或显式预算不足以容纳一个 Block。':
    'The KV pool is empty: block_size or the explicit budget cannot hold a single block.',
  '本 Rank 属于 Stage {stage}：层 {layers}': 'This rank belongs to stage {stage}: layers {layers}',
  '按连续层范围切分；Activation 在 Stage 间传递。':
    'Split into contiguous layer ranges; activations pass between stages.',
  'PP · 流水线 Stage': 'PP · PIPELINE STAGES',
  'PP{size} · {count} 个 Stage': 'PP{size} · {count} stages',
  'M4 · 假设': 'M4 · assumption',
  '气泡': 'Bubble',
  'Activation / Token': 'Activation / token',
  'Stage 层数': 'Layers / stage',
  '本 Rank 分片': "This rank's shard",
  '复用 TP Rank，只沿序列维切分 Activation；Workspace 不随之切分，与 PCP/DCP 的上下文 KV 切分不同。':
    'Reuses TP ranks and shards activations along the sequence dimension only; workspace is not sharded with it, unlike PCP/DCP context KV sharding.',
  'SP · Activation 分片': 'SP · ACTIVATION SHARD',
  'SP{size} · {count} 个组': 'SP{size} · {count} groups',
  '分片系数': 'Shard factor',
  '每步 Collective': 'Collective / step',
  '本 Rank Activation': 'This rank activation',
  '设备增量': 'Device delta',
  '投机解码 · {method}': 'SPECULATIVE · {method}',
  '{count} 个 Draft · 接受率 {rate}': '{count} draft · accept {rate}',
  '不支持': 'UNSUPPORTED',
  '适配器未声明支持该方法；接受率仍是场景输入，但不能作为已验证收益。':
    'The adapter does not declare support for this method; the acceptance rate remains a scenario input and cannot be treated as verified gain.',
  '适配器明确不支持该方法；场景输入仅用于结构展示，不产生可运行收益。':
    'The adapter explicitly does not support this method; scenario inputs are for structural display only and yield no runnable gain.',
  '接受率是场景假设；收益随任务与采样参数变化，不是固定加速比。':
    'The acceptance rate is a scenario assumption; gains vary with workload and sampling parameters and are not a fixed speedup.',
  '期望接受 / 步': 'Expected accepts / step',
  '期望加速比': 'Expected speedup',
  'Draft 成本比': 'Draft cost ratio',
  'MoE · 专家驻留': 'MoE · EXPERT RESIDENCY',
  'EP{size} · {count} 个专家 · top-{topK}': 'EP{size} · {count} experts · top-{topK}',
  '每 Rank 基础 {base} 个 + 冗余 {redundant} 个； 冗余副本增加 HBM，不增加逻辑专家数。':
    'Per rank: {base} base + {redundant} redundant; redundant replicas add HBM but not logical experts.',
  '本 Rank 专家': 'Experts on this rank',
  '专家权重': 'Expert weights',
  '总专家权重': 'Total expert weights',
  '热点比': 'Hotspot ratio',
  '运行后更新': 'Updated after run',
  '专家负载 Top 8': 'Top 8 expert loads',
  '运行后可观察 topK 路由后的专家负载与 All-to-All 估算。':
    'After a run, expert loads after topK routing and the All-to-All estimate appear here.',
  '专家路由为带偏斜的合成教学模型；A2A 字节/耗时按共享互联容量估算，不是实测。':
    'Expert routing is a synthetic teaching model with skew; A2A bytes and time are estimated from shared interconnect capacity, not measured.',
  '主机 · DRAM 层': 'HOST · DRAM TIER',
  'CPU Offload 缓存': 'CPU Offload cache',
  'M3 · 部分': 'M3 · partial',
  '仅建模完整 Block 的主机驻留/回迁；不做逐层流水。':
    'Models host residency and migration of complete blocks only; no layer-wise pipelining.',
  '主机已用': 'Host Used',
  '主机缓存': 'Host Cache',
  '主机 Block 数': 'Host Blocks',
  '卸载 / 加载': 'Offload / Load',

  // Scheduler lens
  '空': 'Empty',
  '+{count} 条': '+{count} more',
  '尚无调度结构': 'No scheduling structure yet',
  '配置可用后，这里会显示等待 / 运行 / 被抢占与 Token Budget。':
    'Once the configuration is valid, Waiting / Running / Preempted and the token budget appear here.',
  'Engine 选择': 'Engine selection',
  '每轮预算': 'Per-iteration budget',
  '{used} / {total} Token': '{used} / {total} tokens',
  'Token Budget 使用': 'Token budget usage',
  '迭代 {n}': 'iteration {n}',
  '运行后按 FCFS 显示等待队列。': 'The waiting queue appears in FCFS order after a run.',
  '尚无事件': 'No events yet',
  '调度迭代会更新运行状态与预算扣减。':
    'Each scheduling iteration updates the running state and budget usage.',
  'KV 不足时 recompute 抢占会进入此列。':
    'Requests preempted for recompute when KV is insufficient appear here.',
  'FCFS 等待；预算或 KV 不足时停留。':
    'FCFS waiting; stays here while budget or KV is insufficient.',
  '本迭代已获预算的序列。': 'Sequences granted budget in this iteration.',
  '被释放 KV 后等待重算的请求。':
    'Requests waiting to recompute after their KV was released.',
  '已缓存 {cached} tok · 已计算 {computed}/{prompt}':
    'cached {cached} tok · computed {computed}/{prompt}',
  '已生成 {generated}/{output}': 'generated {generated}/{output}',
  '抢占 {count}': 'preemptions {count}',
  '这是 vLLM V1 的机制子集：Token Budget、max_num_seqs、运行优先与 FCFS 等待准入。不是逐行复刻源码， 也不代表真实后端的所有策略。选择请求后可在 Inspector 查看等待原因并追踪 KV / 链路。':
    'This is a mechanism subset of vLLM V1: token budget, max_num_seqs, Running priority, and FCFS Waiting admission. It is not a line-by-line copy of the source and does not represent every policy of a real backend. After selecting a request, use the Inspector to inspect wait reasons and trace KV / links.',

  // Transport lens
  '物理链路': 'PHYSICAL LINKS',
  '本次运行的传输': 'TRANSFERS IN RUN',
  '策略': 'STRATEGY',
  '虚拟时刻': 'AT VIRTUAL TIME',
  '尚无硬件链路': 'No hardware links yet',
  '选择硬件 Profile 后显示物理 Link 与竞争域。':
    'Select a hardware profile to see physical links and contention domains.',
  'KV 传输 · 事件驱动': 'KV TRANSFERS · EVENT-DRIVEN',
  '当前 Run 没有 KV 传输事件': 'This run has no KV transfer events',
  '只有 PD 分离或 CPU Offload 场景会产生 Transfer。UI 不会在没有物理路径时凭空画流； 选择 `pd-demo` 或 `offload-demo` 预设并运行后查看。':
    'Only PD disaggregation or CPU offload scenarios produce transfers. The UI never draws flows without a physical path; choose the `pd-demo` or `offload-demo` preset, run it, and inspect the result.',
  '无共享域': 'no shared domain',
  '定位链路 / 请求 →': 'Locate link / request →',
  '{count} 条链路': '{count} links',
  '仲裁：{mode}': 'arbitration: {mode}',
  '串行': 'serialized',
  '共享': 'processor-sharing',
  '全双工': 'full duplex',
  '半双工': 'half duplex',
  '{count} 个活跃': '{count} active',
  '{count} 个完成': '{count} done',
  '查看代表链路 →': 'View representative link →',
  '共享域内的传输串行排队，不把双向带宽相加。选中链路后 Inspector 显示端点、有效带宽与共享域。':
    'Transfers in a shared domain queue serially; bidirectional bandwidth is not summed. Selecting a link shows its endpoints, effective bandwidth, and shared domain in the Inspector.',
  '{bandwidth} × {ratio} 有效带宽': '{bandwidth} × {ratio} effective',
  '竞争域 {id}': 'domain {id}',

  // Metrics lens
  '来自导入 Trace 的实测值，未被仿真器改写，也不参与成本模型拟合。':
    'Measured values from an imported trace; not rewritten by the simulator and not used to fit the cost model.',
  '缺少可计算样本': 'No computable sample',
  '{label} 趋势': '{label} trend',
  '尚无 Run 指标': 'No run metrics yet',
  '结构预览只显示容量与放置；TTFT / TPOT / 吞吐必须由冻结的事件日志计算。点击 Header 的“运行实验”。':
    'The structural preview shows capacity and placement only; TTFT / TPOT / throughput must be computed from a frozen event log. Click “Run experiment” in the header.',
  '实测观测指标': 'Observed metrics',
  'OBSERVED · 来自导入 Trace，不参与仿真':
    'OBSERVED · from an imported trace, not simulated',
  '请求关键路径 · 到达 → 首 Token → 完成':
    'REQUEST CRITICAL PATH · arrival → first token → finish',
  '{count} 次抢占': '{count} preemptions',
  '排队 / 等待': 'queue / wait',
  'Prefill + Decode': 'prefill + decode',
  '灰色区间为未完成或缺失数据': 'Grey ranges are incomplete or missing data',
  '序列 · 事件采样': 'SERIES · EVENT SAMPLED',
  '等待请求': 'Waiting requests',
  'KV 已用': 'KV used',
  '预算已用': 'Budget used',
  '请求数': 'requests',
  'Block': 'blocks',
  '字节': 'bytes',
  'Token': 'tokens',
  '步': 'steps',
  '事件数': 'events',
  '路由次数': 'routings',
  '×': 'x',
  '推导': 'derived',
  '估算': 'estimated',
  '假定': 'assumed',
  '未知': 'unknown',
  '实测 TTFT P50': 'Observed TTFT P50',
  '实测 TPOT P50': 'Observed TPOT P50',
  '序列按事件采样并降采样；不能替代逐事件日志。':
    'Series are sampled from events and downsampled; they do not replace the per-event log.',
  '证据与限制': 'EVIDENCE & LIMITATIONS',
  '假设': 'Assumptions',
  '无显式假设记录。': 'No explicit assumptions recorded.',
  '限制': 'Limitations',
  '无额外限制。': 'No additional limitations.',
  '每个指标卡片都显示质量等级；`SYNTHETIC` 不代表真实硬件性能，`N/A` 表示缺少可计算样本。':
    'Every metric card shows its quality tier; `SYNTHETIC` does not represent real hardware performance, and `N/A` means no computable sample.',

  // Domain values rendered by the lenses (plan notes, evidence, metrics)
  'PP 按 {ppSize} 个 Stage 均匀切分 {numLayers} 层；bubble 以 max_num_seqs={microbatches} 个微批估算，activation 跨 Stage 传输只计结构成本。':
    'PP splits {numLayers} layers evenly across {ppSize} stages; bubble is estimated with max_num_seqs={microbatches} microbatches, and cross-stage activation transfer counts structural cost only.',
  'PP 采用均匀层切分与理想 microbatch 填充；真实流水线调度、Stage 负载不均与跨节点带宽未建模。':
    'PP assumes even layer splitting and ideal microbatch filling; real pipeline scheduling, stage load imbalance, and cross-node bandwidth are not modelled.',
  'SP 复用 TP Rank，只沿序列维切分 Activation；Workspace 不随之切分。它不同于 PCP/DCP 的上下文 KV 切分，也不新增设备。':
    'SP reuses TP ranks and shards activations along the sequence dimension only; workspace is not sharded with it. Unlike PCP/DCP context KV sharding, it adds no devices.',
  'SP 的 collective 成本为按 log2(spSize) 估算的假设值，未按具体 All-Gather/Reduce-Scatter 实现标定。':
    'SP collective cost is an assumption estimated as log2(spSize), not calibrated to a specific All-Gather/Reduce-Scatter implementation.',
  'MTP/DSpark 的接受率是场景假设；收益随任务与采样参数变化，不是固定加速比。':
    'The acceptance rate for MTP/DSpark is a scenario assumption; gains vary with workload and sampling parameters and are not a fixed speedup.',
  '适配器 {framework} 未声明支持 {method}；以下仅为场景假设，不作为已验证收益。':
    'Adapter {framework} does not declare support for {method}; the following are scenario assumptions only, not verified gains.',
  '适配器 {framework} 明确不支持 {method}；以下数值仅用于结构展示。':
    'Adapter {framework} explicitly does not support {method}; the values below are for structural display only.',
  '{method} 在适配器 {framework} 中为 unknown；Plan 不宣称该功能已验证。':
    '{method} is unknown in adapter {framework}; the plan does not claim this feature is verified.',
  '{method} 在适配器 {framework} 中为 unsupported；Plan 不可运行。':
    '{method} is unsupported in adapter {framework}; the plan cannot run.',
  '投机解码按每步期望接受 Token 数建模，未模拟 Draft 模型独立显存、验证失败回滚与批内混合接受率。':
    'Speculative decoding is modelled by expected accepted tokens per step; draft-model memory, rollback on verification failure, and mixed acceptance within a batch are not simulated.',
  '容量计算基于 Profile 与显式并行映射；时间指标另行标注假设。':
    'Capacity is computed from the profile and explicit parallel mapping; timing metrics are labelled with assumptions separately.',
  '模型权重布局存在未建模项，停止每卡权重数值评估。':
    'The model weight layout has unmodelled items; per-accelerator weight evaluation is stopped.',
  '计算/传输时间使用教学成本模型：max(FLOPs/有效算力, 权重与 KV 读取/有效 HBM 带宽) + 固定开销。':
    'Compute/transfer time uses a teaching cost model: max(FLOPs / effective compute, weight and KV reads / effective HBM bandwidth) + fixed overhead.',
  'vLLM V1 调度为可解释子集，不是逐行复刻官方源码。':
    'The vLLM V1 scheduler is an explainable subset, not a line-by-line copy of the official source.',
  'Token 内容仅使用确定性指纹，不执行真实 Transformer。':
    'Token content uses deterministic fingerprints only; no real Transformer is executed.',
  '时间指标为仿真估计，未经真实硬件校准。':
    'Timing metrics are simulation estimates and are not calibrated against real hardware.',
  'KV Block 逻辑池按每个 Rank 最小容量建模；未对每 Rank 单独分配。':
    'The logical KV block pool is modelled with the minimum capacity per rank; blocks are not allocated per rank individually.',
  'M2 子集调度未覆盖全部 vLLM 版本特性。':
    'The M2 scheduler subset does not cover every vLLM version feature.',
  'PD 传输按逻辑 Block 聚合；PD_LAYERWISE_PUSH 未建模逐层重叠，仅按同一链路路径计时。':
    'PD transfer is aggregated by logical block; PD_LAYERWISE_PUSH layer-wise overlap is not modelled and is timed along the same link path only.',
  'CPU Offload 以完整 Block 为单位，不建模逐层流水；Host Hit 加载期间请求暂停调度。':
    'CPU offload works in complete blocks and does not model layer-wise pipelining; requests pause scheduling while a host hit loads.',
  '模型没有 Attention Layer 描述。': 'The model has no Attention layer description.',
  'MLA 层缺少 kvLatentDim/dtype，不能套用 GQA/MHA 公式。':
    'An MLA layer is missing kvLatentDim/dtype; the GQA/MHA formula cannot be applied.',
  '{kind} 的 sparseKV 缺少 storage={storage} 所需的形状字段。':
    'The sparseKV for {kind} is missing the shape fields required by storage={storage}.',
  '第 {layer} 层窗口 {window} < max_model_len={maxLen}；池容量需按窗口/稀疏策略确认。':
    'Layer {layer} window {window} < max_model_len={maxLen}; pool capacity must be confirmed against the window/sparse policy.',
  '{kind} 的 KV 布局未建模；需声明 sparseKV 缓存组或 measuredBytesPerToken。':
    'The KV layout for {kind} is not modelled; declare a sparseKV cache group or measuredBytesPerToken.',
  '第 {layer} 层缺少 nKVHeads/headDim。': 'Layer {layer} is missing nKVHeads/headDim.',
  '第 {layer} 层 KV 布局 {layout} 缺少显式每 Rank 数据。':
    'Layer {layer} KV layout {layout} is missing explicit per-rank data.',
  '第 {layer} 层 MLA 使用 latent={latent}+rope={rope}，按 DCP={dcp} 切分 KV。':
    'Layer {layer} MLA uses latent={latent}+rope={rope} and shards KV by DCP={dcp}.',
  '第 {layer} 层 MLA 使用 latent={latent}+rope={rope}，按每 Rank 复制估算（未启用 DCP 分片）。':
    'Layer {layer} MLA uses latent={latent}+rope={rope} and is estimated as replicated per rank (DCP sharding disabled).',
  '{kind} 使用显式 {storage} 缓存组 {cacheGroup}（按 DCP={dcp} 切分）；稀疏选择开销与压缩率按 Profile 假设，非实测。':
    '{kind} uses explicit {storage} cache group {cacheGroup} (sharded by DCP={dcp}); sparse-selection overhead and compression ratio are profile assumptions, not measured.',
  '{kind} 使用显式 {storage} 缓存组 {cacheGroup}（按 TP={tp} 切分）；稀疏选择开销与压缩率按 Profile 假设，非实测。':
    '{kind} uses explicit {storage} cache group {cacheGroup} (sharded by TP={tp}); sparse-selection overhead and compression ratio are profile assumptions, not measured.',
  '{kind} 使用显式 {storage} 缓存组 {cacheGroup}（每 Rank 复制）；稀疏选择开销与压缩率按 Profile 假设，非实测。':
    '{kind} uses explicit {storage} cache group {cacheGroup} (replicated per rank); sparse-selection overhead and compression ratio are profile assumptions, not measured.',
  '{kind} 使用显式 {storage} 缓存组 {cacheGroup}（按显式每 Rank 值（未切分））；稀疏选择开销与压缩率按 Profile 假设，非实测。':
    '{kind} uses explicit {storage} cache group {cacheGroup} (explicit per-rank values, unsharded); sparse-selection overhead and compression ratio are profile assumptions, not measured.',
  '第 {layer} 层使用窗口 {window}；每 Token KV 不变，池容量仍按 max_model_len 估算，未按窗口缩减，需后端确认实际回收策略。':
    'Layer {layer} uses window {window}; per-token KV is unchanged and pool capacity is still estimated from max_model_len without window reduction; confirm the actual reclamation policy with the backend.',
  'DCP={dcp} 已声明，但 {count} 个 Attention 层未声明 context-sharded/contextSharded 布局，KV 不随 DCP 切分；这些层仍按 TP/复制估算。':
    'DCP={dcp} is declared, but {count} Attention layers do not declare a context-sharded/contextSharded layout, so KV is not sharded by DCP; those layers are still estimated by TP/replication.',
  'PP={ppSize} 的每 Rank KV 按 Stage {stage} 的层范围 [{start}, {end}) 求和；不同 Stage 的层数可能不同。':
    'Per-rank KV for PP={ppSize} is summed over the layer range [{start}, {end}) of stage {stage}; stages may have different layer counts.',

  // Metric labels and reasons from the core engine
  '总请求数': 'Total requests',
  '完成请求数': 'Finished requests',
  '拒绝请求数': 'Rejected requests',
  '未完成请求数': 'Unfinished requests',
  '排队等待 P50': 'Queue wait P50',
  '端到端 P95': 'End-to-end P95',
  '输出吞吐': 'Output throughput',
  '请求吞吐': 'Request throughput',
  'Prefix Cache 命中 Block 数': 'Prefix cache hit blocks',
  'KV 淘汰 Block 数': 'KV evicted blocks',
  'KV 峰值占用': 'Peak KV usage',
  'KV 峰值 Block 数': 'Peak KV blocks',
  'Prefill 计算 Token 数': 'Prefill computed tokens',
  'Decode 计算 Token 数': 'Decode computed tokens',
  '调度步数': 'Scheduler steps',
  '抢占次数': 'Preemptions',
  'KV 传输字节': 'KV transfer bytes',
  'KV 传输次数': 'KV transfer count',
  'Host → HBM 加载次数': 'Host → HBM loads',
  'HBM → Host 写回次数': 'HBM → Host write-backs',
  'Host 驻留 KV Block 数': 'Host-resident KV blocks',
  'Pipeline Bubble 比例': 'Pipeline bubble fraction',
  '跨 Stage Activation 字节/Token': 'Cross-stage activation bytes/token',
  'SP 单步 Collective 成本': 'SP per-step collective cost',
  '投机解码期望接受 Token/步': 'Speculative expected accepted tokens/step',
  '投机解码期望加速比': 'Speculative expected speedup',
  '专家路由 Token 次数': 'Expert routing token count',
  'All-to-All 字节': 'All-to-All bytes',
  'All-to-All 估算耗时': 'All-to-All estimated time',
  '专家热点比': 'Expert hotspot ratio',
  '已应用匹配的实测校准曲线；仅覆盖校准范围。':
    'A matching measured calibration curve was applied; coverage is limited to the calibrated range.',
  '已应用匹配的实测校准曲线；仅覆盖校准范围；声明误差 ±{pct}%。':
    'A matching measured calibration curve was applied; coverage is limited to the calibrated range; declared error ±{pct}%.',
  '基于合成成本模型，非实测。': 'Based on a synthetic cost model, not measured.',
  '输出 Token <= 1 时为 N/A。': 'N/A when output tokens <= 1.',
  '按 max_num_seqs 个理想微批估算；未模拟 Stage 负载不均。':
    'Estimated with max_num_seqs ideal microbatches; stage load imbalance is not simulated.',
  '按 log2(spSize) 估算，未按具体 All-Gather/Reduce-Scatter 实现标定。':
    'Estimated as log2(spSize); not calibrated to a specific All-Gather/Reduce-Scatter implementation.',
  '适配器未声明支持该方法；不提供接受数结论。':
    'The adapter does not declare support for this method; no acceptance conclusion is provided.',
  '收益取决于接受率与 Draft 成本，不是固定加速比。':
    'Gain depends on acceptance rate and draft cost; it is not a fixed speedup.',
  '适配器未声明支持该方法；不提供加速结论。':
    'The adapter does not declare support for this method; no speedup conclusion is provided.',
  '来自导入 Trace 的实测 TTFT；未被仿真器改写。':
    'Measured TTFT from an imported trace; not rewritten by the simulator.',
  '来自导入 Trace 的实测 TPOT；未被仿真器改写。':
    'Measured TPOT from an imported trace; not rewritten by the simulator.',
  '按 topK 展开的合成路由计数。': 'Synthetic routing count expanded by topK.',
  '跨 Rank 专家分发的合成字节数。': 'Synthetic bytes for cross-rank expert dispatch.',
  '按共享互联容量估算，非实测。':
    'Estimated from shared interconnect capacity, not measured.',
  '最热专家负载 / 均衡负载。': 'Hottest expert load / balanced load.',
} as const;
