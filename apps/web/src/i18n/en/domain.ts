/** English copy for this area. Keys are Chinese source strings. */
export const domain = {
  // ------------------------------------------------------------------
  // Core simulator — run errors and warnings
  // ------------------------------------------------------------------
  '场景不可行，无法运行仿真。': 'The scenario is infeasible; simulation cannot run.',
  '关键硬件/模型数据为 unknown；仅结构预览可用。若明确接受合成时间模型，请设置 assumptions.allowSyntheticTiming=true。':
    'Key hardware/model data is unknown; only structural preview is available. To explicitly accept the synthetic timing model, set assumptions.allowSyntheticTiming=true.',
  'Engine {engine} 没有可用 KV Block，无法运行。': 'Engine {engine} has no available KV blocks; cannot run.',
  '事件数达到上限 {maxEvents}，仿真提前终止；结果仅覆盖已处理部分。':
    'Event count reached the limit of {maxEvents}; simulation stopped early and results cover only the processed portion.',
  '虚拟时间达到上限 {maxTime} µs，仿真提前终止。': 'Virtual time reached the limit of {maxTime} µs; simulation stopped early.',
  '仿真内部不变量被破坏（{count} 项）。': 'Simulation internal invariants were violated ({count} items).',
  '重复的 Request ID {id}，仅保留第一个。': 'Duplicate request ID {id}; only the first is kept.',
  '没有可用 Engine 接收请求 {requestId}。': 'No engine is available to accept request {requestId}.',
  'Engine {engine} 连续 {stalledTicks} 次调度无进展；可能存在预算过小或 KV 不足。':
    'Engine {engine} made no scheduling progress for {stalledTicks} consecutive ticks; the budget may be too small or KV may be insufficient.',
  'Host Block {hostBlockId} 加载完成时目标 HBM Slot 丢失。':
    'The target HBM slot was lost when host block {hostBlockId} finished loading.',
  'KV Block {blockId} Offload 完成时状态已变化。': 'KV block {blockId} changed state before offload completed.',
  '请求需要 {neededBlocks} 个 KV Block，超过池容量 {capacity}。':
    'The request needs {neededBlocks} KV blocks, exceeding the pool capacity of {capacity}.',
  '部分算力/HBM 带宽缺失，使用显式合成时间参数；时间指标仅为教学假设。':
    'Some compute/HBM bandwidth data is missing; explicit synthetic timing parameters are used and time metrics are teaching assumptions only.',
  '请求 {requestId} 未在仿真预算内完成（状态 {status}）。':
    'Request {requestId} did not finish within the simulation budget (status {status}).',

  // ------------------------------------------------------------------
  // Core simulator — metric labels
  // ------------------------------------------------------------------
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
  'KV 峰值占用': 'KV peak usage',
  'KV 峰值 Block 数': 'KV peak blocks',
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

  // ------------------------------------------------------------------
  // Core simulator — metric reasons and calibration notes
  // ------------------------------------------------------------------
  '输出 Token <= 1 时为 N/A。': 'N/A when output tokens <= 1.',
  '按 max_num_seqs 个理想微批估算；未模拟 Stage 负载不均。':
    'Estimated with max_num_seqs ideal micro-batches; uneven stage load is not modeled.',
  '按 log2(spSize) 估算，未按具体 All-Gather/Reduce-Scatter 实现标定。':
    'Estimated as log2(spSize); not calibrated to a specific All-Gather/Reduce-Scatter implementation.',
  '适配器未声明支持该方法；不提供接受数结论。':
    'The adapter does not declare support for this method; no acceptance-count conclusion is provided.',
  '收益取决于接受率与 Draft 成本，不是固定加速比。':
    'The gain depends on the acceptance rate and draft cost; it is not a fixed speedup.',
  '适配器未声明支持该方法；不提供加速结论。':
    'The adapter does not declare support for this method; no speedup conclusion is provided.',
  '来自导入 Trace 的实测 TTFT；未被仿真器改写。':
    'Measured TTFT from the imported trace; not rewritten by the simulator.',
  '来自导入 Trace 的实测 TPOT；未被仿真器改写。':
    'Measured TPOT from the imported trace; not rewritten by the simulator.',
  '按 topK 展开的合成路由计数。': 'Synthetic routing count expanded by topK.',
  '跨 Rank 专家分发的合成字节数。': 'Synthetic bytes for cross-rank expert dispatch.',
  '按共享互联容量估算，非实测。': 'Estimated from shared interconnect capacity; not measured.',
  '最热专家负载 / 均衡负载。': 'Hottest expert load / balanced load.',
  '已应用匹配的实测校准曲线；仅覆盖校准范围。':
    'A matching measured calibration curve was applied; coverage is limited to the calibrated range.',
  '已应用匹配的实测校准曲线；仅覆盖校准范围；声明误差 ±{pct}%。':
    'A matching measured calibration curve was applied; coverage is limited to the calibrated range; declared uncertainty ±{pct}%.',
  '基于合成成本模型，非实测。': 'Based on the synthetic cost model; not measured.',
  'Prefill 与 Decode 均在匹配的校准范围内；其余指标仍按各自来源标注。':
    'Both Prefill and Decode are within the matching calibration range; other metrics remain labeled by their own source.',
  'Prefill 与 Decode 均在匹配的校准范围内；声明误差 ±{uncertainty}%；其余指标仍按各自来源标注。':
    'Both Prefill and Decode are within the matching calibration range; declared uncertainty ±{uncertainty}%; other metrics remain labeled by their own source.',
  '存在超出校准范围的请求；该 Run 的时间指标降级为 assumption。':
    'Some requests fall outside the calibrated range; this run’s time metrics are downgraded to assumption.',
  '没有曲线匹配当前硬件/模型/框架/dtype/范围；该 Run 的时间指标保持 assumption。':
    'No curve matches the current hardware/model/framework/dtype/range; this run’s time metrics remain assumption.',
  '只匹配到部分阶段的校准曲线；时间指标未整体升级为 calibrated。':
    'Only some stage calibration curves matched; time metrics were not upgraded to calibrated as a whole.',

  // ------------------------------------------------------------------
  // Core simulator — assumptions and limitations
  // ------------------------------------------------------------------
  '计算/传输时间使用教学成本模型：max(FLOPs/有效算力, 权重与 KV 读取/有效 HBM 带宽) + 固定开销。':
    'Compute/transfer time uses a teaching cost model: max(FLOPs / effective compute, weight and KV reads / effective HBM bandwidth) + fixed overhead.',
  'vLLM V1 调度为可解释子集，不是逐行复刻官方源码。':
    'vLLM V1 scheduling is an explainable subset, not a line-by-line reproduction of the official source.',
  'Token 内容仅使用确定性指纹，不执行真实 Transformer。':
    'Token content uses deterministic fingerprints only; no real Transformer is executed.',
  '时间指标为仿真估计，未经真实硬件校准。':
    'Time metrics are simulation estimates, not calibrated against real hardware.',
  'KV Block 逻辑池按每个 Rank 最小容量建模；未对每 Rank 单独分配。':
    'The logical KV block pool is modeled at the minimum capacity per rank; blocks are not allocated per rank.',
  'M2 子集调度未覆盖全部 vLLM 版本特性。': 'The M2 scheduling subset does not cover all vLLM version features.',
  'PD 传输按逻辑 Block 聚合；PD_LAYERWISE_PUSH 未建模逐层重叠，仅按同一链路路径计时。':
    'PD transfer is aggregated by logical block; PD_LAYERWISE_PUSH does not model layer-wise overlap and is timed along the same link path only.',
  'CPU Offload 以完整 Block 为单位，不建模逐层流水；Host Hit 加载期间请求暂停调度。':
    'CPU offload works in whole blocks and does not model layer-wise pipelining; requests pause scheduling while a host hit loads.',

  // ------------------------------------------------------------------
  // Core memory planner — KV and weight layout notes
  // ------------------------------------------------------------------
  '模型权重布局存在未建模项，停止每卡权重数值评估。':
    'The model weight layout has unmodeled items; per-GPU weight evaluation is stopped.',
  '模型没有 Attention Layer 描述。': 'The model has no attention layer description.',
  'MLA 层缺少 kvLatentDim/dtype，不能套用 GQA/MHA 公式。':
    'The MLA layer lacks kvLatentDim/dtype; the GQA/MHA formula cannot be applied.',
  '第 {layer} 层 MLA 使用 latent={latent}+rope={rope}，按 DCP={dcp} 切分 KV。':
    'Layer {layer} MLA uses latent={latent}+rope={rope}; KV is sharded by DCP={dcp}.',
  '第 {layer} 层 MLA 使用 latent={latent}+rope={rope}，按每 Rank 复制估算（未启用 DCP 分片）。':
    'Layer {layer} MLA uses latent={latent}+rope={rope}; estimated as replicated per rank (DCP sharding not enabled).',
  '{kind} 的 sparseKV 缺少 storage={storage} 所需的形状字段。':
    'The sparseKV for {kind} is missing the shape fields required by storage={storage}.',
  '{kind} 使用显式 {storage} 缓存组 {cacheGroup}（按显式每 Rank 值（未切分））；稀疏选择开销与压缩率按 Profile 假设，非实测。':
    '{kind} uses explicit {storage} cache group {cacheGroup} (explicit per-rank values, unsharded); sparse selection overhead and compression ratio are profile assumptions, not measured.',
  '{kind} 使用显式 {storage} 缓存组 {cacheGroup}（按 DCP={dcp} 切分）；稀疏选择开销与压缩率按 Profile 假设，非实测。':
    '{kind} uses explicit {storage} cache group {cacheGroup} (sharded by DCP={dcp}); sparse selection overhead and compression ratio are profile assumptions, not measured.',
  '{kind} 使用显式 {storage} 缓存组 {cacheGroup}（按 TP={tp} 切分）；稀疏选择开销与压缩率按 Profile 假设，非实测。':
    '{kind} uses explicit {storage} cache group {cacheGroup} (sharded by TP={tp}); sparse selection overhead and compression ratio are profile assumptions, not measured.',
  '{kind} 使用显式 {storage} 缓存组 {cacheGroup}（每 Rank 复制）；稀疏选择开销与压缩率按 Profile 假设，非实测。':
    '{kind} uses explicit {storage} cache group {cacheGroup} (replicated per rank); sparse selection overhead and compression ratio are profile assumptions, not measured.',
  '第 {layer} 层窗口 {window} < max_model_len={maxLen}；池容量需按窗口/稀疏策略确认。':
    'Layer {layer} window {window} < max_model_len={maxLen}; pool capacity must be confirmed against the window/sparse policy.',
  '{kind} 的 KV 布局未建模；需声明 sparseKV 缓存组或 measuredBytesPerToken。':
    'The KV layout for {kind} is not modeled; declare a sparseKV cache group or measuredBytesPerToken.',
  '第 {layer} 层缺少 nKVHeads/headDim。': 'Layer {layer} is missing nKVHeads/headDim.',
  '第 {layer} 层 KV 布局 {layout} 缺少显式每 Rank 数据。':
    'Layer {layer} KV layout {layout} lacks explicit per-rank data.',
  '第 {layer} 层使用窗口 {window}；每 Token KV 不变，池容量仍按 max_model_len 估算，未按窗口缩减，需后端确认实际回收策略。':
    'Layer {layer} uses window {window}; per-token KV is unchanged and pool capacity is still estimated from max_model_len without window reduction; the backend must confirm the actual reclamation policy.',
  'DCP={dcp} 已声明，但 {count} 个 Attention 层未声明 context-sharded/contextSharded 布局，KV 不随 DCP 切分；这些层仍按 TP/复制估算。':
    'DCP={dcp} is declared, but {count} attention layers do not declare a context-sharded/contextSharded layout, so KV is not sharded with DCP; these layers are still estimated by TP/replication.',
  'PP={ppSize} 的每 Rank KV 按 Stage {stage} 的层范围 [{start}, {end}) 求和；不同 Stage 的层数可能不同。':
    'Per-rank KV for PP={ppSize} is summed over the layer range [{start}, {end}) of stage {stage}; stages may have different layer counts.',

  // ------------------------------------------------------------------
  // Core memory planner — validation issues
  // ------------------------------------------------------------------
  'Rank {rank} 指向不存在的加速卡 {accelerator}。':
    'Rank {rank} points to a nonexistent accelerator {accelerator}.',
  'Rank {rank} 的权重驻留无法计算：{note}': 'Weight residency for rank {rank} cannot be computed: {note}',
  'Rank {rank} 的权重驻留无法计算：缺少 Tensor 布局。':
    'Weight residency for rank {rank} cannot be computed: missing tensor layout.',
  'Rank {rank} 的权重驻留无法计算：模型权重布局存在未建模项，停止每卡权重数值评估。':
    'Weight residency for rank {rank} cannot be computed: the model weight layout has unmodeled items; per-GPU weight evaluation is stopped.',
  '补充模型 Tensor Inventory 或导入经测量的每卡权重。':
    'Add a model tensor inventory or import measured per-GPU weights.',
  'Rank {rank} 的 KV 布局无法计算：{note}': 'The KV layout for rank {rank} cannot be computed: {note}',
  'Rank {rank} 的 KV 布局无法计算：缺少 Attention 布局。':
    'The KV layout for rank {rank} cannot be computed: missing attention layout.',
  'Rank {rank} 的 KV 布局无法计算：模型没有 Attention Layer 描述。':
    'The KV layout for rank {rank} cannot be computed: the model has no attention layer description.',
  'Rank {rank} 的 KV 布局无法计算：MLA 层缺少 kvLatentDim/dtype，不能套用 GQA/MHA 公式。':
    'The KV layout for rank {rank} cannot be computed: the MLA layer lacks kvLatentDim/dtype; the GQA/MHA formula cannot be applied.',
  'Rank {rank} 的 KV 布局无法计算：{kind} 的 sparseKV 缺少 storage={storage} 所需的形状字段。':
    'The KV layout for rank {rank} cannot be computed: the sparseKV for {kind} is missing the shape fields required by storage={storage}.',
  'Rank {rank} 的 KV 布局无法计算：{kind} 的 KV 布局未建模；需声明 sparseKV 缓存组或 measuredBytesPerToken。':
    'The KV layout for rank {rank} cannot be computed: the KV layout for {kind} is not modeled; declare a sparseKV cache group or measuredBytesPerToken.',
  'Rank {rank} 的 KV 布局无法计算：第 {layerIndex} 层缺少 nKVHeads/headDim。':
    'The KV layout for rank {rank} cannot be computed: layer {layerIndex} is missing nKVHeads/headDim.',
  'Rank {rank} 的 KV 布局无法计算：第 {layerIndex} 层 KV 布局 {kvLayout} 缺少显式每 Rank 数据。':
    'The KV layout for rank {rank} cannot be computed: layer {layerIndex} KV layout {kvLayout} lacks explicit per-rank data.',
  '补充 Attention Layer 形状或经测量的每 Token KV 字节数。':
    'Add attention layer shapes or measured KV bytes per token.',
  '缺少 Tensor 布局。': 'Missing tensor layout.',
  '缺少 Attention 布局。': 'Missing attention layout.',
  '显式 kv_cache_memory_bytes={explicit} 超过预算可容纳值 {capacity}；已按预算上限处理。':
    'Explicit kv_cache_memory_bytes={explicit} exceeds the budget capacity of {capacity}; it has been capped at the budget.',
  '降低显式 KV 预算或提高 gpu_memory_utilization。':
    'Lower the explicit KV budget or raise gpu_memory_utilization.',
  'Rank {rank} 的权重未知；使用显式 kv_cache_memory_bytes={budget} 作为合成运行的 KV 池，HBM 容量仍不可验证。':
    'Weights for rank {rank} are unknown; explicit kv_cache_memory_bytes={budget} is used as the KV pool for a synthetic run, and HBM capacity remains unverifiable.',
  '补充权重 Tensor Inventory 后再做容量结论；合成运行的时间指标保持 SYNTHETIC。':
    'Add the weight tensor inventory before drawing capacity conclusions; time metrics for the synthetic run remain SYNTHETIC.',
  'Rank {rank} ({accelerator}) HBM 预算 {budget} bytes 小于固定占用 {fixed} bytes。':
    'The HBM budget of rank {rank} ({accelerator}) is {budget} bytes, less than the fixed footprint of {fixed} bytes.',
  '降低模型驻留、提高 gpu_memory_utilization，或使用更多 TP/设备。':
    'Reduce model residency, raise gpu_memory_utilization, or use more TP/devices.',
  'Rank {rank} 的 KV 池不足以容纳一个 Block（block_size={blockSize}），Plan 不可运行。':
    'The KV pool for rank {rank} cannot hold a single block (block_size={blockSize}); the plan is not runnable.',
  '降低权重/运行时占用、提高 gpu_memory_utilization，或显式提供足够的 kv_cache_memory_bytes。':
    'Reduce weight/runtime footprint, raise gpu_memory_utilization, or explicitly provide enough kv_cache_memory_bytes.',

  // ------------------------------------------------------------------
  // Core memory planner — pipeline, sequence parallel, speculative notes
  // ------------------------------------------------------------------
  'PP={pp} 大于模型层数 {layers}；部分 Stage 将没有 Transformer 层，pipeline 结果只具结构意义。':
    'PP={pp} exceeds the model layer count {layers}; some stages will have no Transformer layers, so pipeline results are structural only.',
  '降低 PP 或选择层数更多的模型。': 'Lower PP or choose a model with more layers.',
  'PP 按 {ppSize} 个 Stage 均匀切分 {numLayers} 层；bubble 以 max_num_seqs={microbatches} 个微批估算，activation 跨 Stage 传输只计结构成本。':
    'PP evenly splits {numLayers} layers across {ppSize} stages; bubble is estimated with max_num_seqs={microbatches} micro-batches, and cross-stage activation transfer counts structural cost only.',
  'PP 采用均匀层切分与理想 microbatch 填充；真实流水线调度、Stage 负载不均与跨节点带宽未建模。':
    'PP uses even layer splitting and ideal microbatch filling; real pipeline scheduling, uneven stage load, and cross-node bandwidth are not modeled.',
  'SP 复用 TP Rank，只沿序列维切分 Activation；Workspace 不随之切分。它不同于 PCP/DCP 的上下文 KV 切分，也不新增设备。':
    'SP reuses TP ranks and shards activations only along the sequence dimension; workspace is not sharded. It differs from PCP/DCP context KV sharding and adds no devices.',
  'SP 的 collective 成本为按 log2(spSize) 估算的假设值，未按具体 All-Gather/Reduce-Scatter 实现标定。':
    'SP collective cost is an assumption estimated as log2(spSize), not calibrated to a specific All-Gather/Reduce-Scatter implementation.',
  '适配器 {framework} 未声明支持 {method}；以下仅为场景假设，不作为已验证收益。':
    'Adapter {framework} does not declare support for {method}; the following is a scenario assumption, not a verified gain.',
  '适配器 {framework} 明确不支持 {method}；以下数值仅用于结构展示。':
    'Adapter {framework} explicitly does not support {method}; the values below are for structural display only.',
  'MTP/DSpark 的接受率是场景假设；收益随任务与采样参数变化，不是固定加速比。':
    'The MTP/DSpark acceptance rate is a scenario assumption; the gain varies with task and sampling parameters and is not a fixed speedup.',
  '{method} 在适配器 {framework} 中为 unknown；Plan 不宣称该功能已验证。':
    '{method} is unknown in adapter {framework}; the plan does not claim the feature is verified.',
  '{method} 在适配器 {framework} 中为 unsupported；Plan 不可运行。':
    '{method} is unsupported in adapter {framework}; the plan is not runnable.',
  '投机解码按每步期望接受 Token 数建模，未模拟 Draft 模型独立显存、验证失败回滚与批内混合接受率。':
    'Speculative decoding is modeled by expected accepted tokens per step; draft-model memory, verification-failure rollback, and mixed within-batch acceptance rates are not simulated.',
  '容量计算基于 Profile 与显式并行映射；时间指标另行标注假设。':
    'Capacity calculations are based on profiles and explicit parallel mapping; time metrics carry separate assumption labels.',

  // ------------------------------------------------------------------
  // Core placement planner — validation issues
  // ------------------------------------------------------------------
  'TP={tp} × DP={dp} × PP={pp} 需要 {required} 张卡，但可用加速卡只有 {available} 张。':
    'TP={tp} × DP={dp} × PP={pp} requires {required} devices, but only {available} accelerators are available.',
  '降低 TP/DP/PP，或选择更大的硬件 Profile。': 'Lower TP/DP/PP or choose a larger hardware profile.',
  'SP={sp} 不能大于 TP={tp}：SP 复用 TP Rank 的 Activation 分片，不能凭空创建设备。':
    'SP={sp} cannot exceed TP={tp}: SP reuses TP rank activation shards and cannot create devices.',
  '降低 spSize 或提高 TP。': 'Lower spSize or raise TP.',
  '只生成了 {generated}/{required} 个 Rank 映射。': 'Only {generated}/{required} rank mappings were generated.',
  '检查硬件卡数量与 TP/DP/PP 设置。': 'Check the accelerator count and TP/DP/PP settings.',
  'P({prefillTp}×{prefillDp}) + D({decodeTp}×{decodeDp}) 需要 {required} 张卡，硬件只有 {available} 张。':
    'P({prefillTp}×{prefillDp}) + D({decodeTp}×{decodeDp}) requires {required} devices, but the hardware has only {available}.',
  '调整 P/D 的 TP/DP 比例。': 'Adjust the TP/DP ratio for P/D.',
  'DCP={dcp} 不能大于 TP={tp}：DCP 必须复用 TP rank，不能凭空创建设备。':
    'DCP={dcp} cannot exceed TP={tp}: DCP must reuse TP ranks and cannot create devices.',
  '降低 dcpSize 或提高 TP。': 'Lower dcpSize or raise TP.',
  'TP={tp} × DP={dp} × PCP={pcp} 需要 {required} 张卡，但硬件只有 {available} 张。':
    'TP={tp} × DP={dp} × PCP={pcp} requires {required} devices, but the hardware has only {available}.',
  '降低 PCP/TP/DP，或选择更大的硬件 Profile。': 'Lower PCP/TP/DP or choose a larger hardware profile.',

  // ------------------------------------------------------------------
  // Core validation — scenario
  // ------------------------------------------------------------------
  '修正该字段的类型或取值后重新导入。': 'Fix the field type or value and import again.',
  '找不到硬件 Profile "{id}"。': 'Hardware profile "{id}" was not found.',
  '选择内置硬件 Profile；当前 UI 不支持导入 Profile。':
    'Select a built-in hardware profile; the current UI does not support importing profiles.',
  '找不到模型 Profile "{id}"。': 'Model profile "{id}" was not found.',
  '选择内置模型 Profile；当前 UI 不支持导入 Profile。':
    'Select a built-in model profile; the current UI does not support importing profiles.',
  '找不到框架 Profile "{id}"。': 'Framework profile "{id}" was not found.',
  '选择内置教学适配器。': 'Select a built-in teaching adapter.',
  'max_num_batched_tokens 必须 >= 1。': 'max_num_batched_tokens must be >= 1.',
  'max_num_seqs 必须 >= 1。': 'max_num_seqs must be >= 1.',
  'block_size 必须为正整数。': 'block_size must be a positive integer.',
  'block_size={blockSize} 不在教学适配器常用集合 {16,32,64,128} 内。':
    'block_size={blockSize} is not in the teaching adapter’s common set {16,32,64,128}.',
  '确认后端支持该粒度。': 'Confirm the backend supports this granularity.',
  '关闭 Chunked Prefill 时，某些后端要求单轮 token budget 足以覆盖最长 prefill；当前 budget 小于 max_model_len。':
    'With Chunked Prefill disabled, some backends require a single-iteration token budget that covers the longest prefill; the current budget is smaller than max_model_len.',
  '打开 Chunked Prefill 或提高 max_num_batched_tokens。':
    'Enable Chunked Prefill or raise max_num_batched_tokens.',
  'gpu_memory_utilization 必须在 (0, 1] 内。': 'gpu_memory_utilization must be within (0, 1].',
  'TP 与 DP 必须 >= 1。': 'TP and DP must be >= 1.',
  'PP 必须 >= 1。': 'PP must be >= 1.',
  '投机解码每步至少需要 1 + draftTokens = {required} 个 Token Budget；当前 max_num_batched_tokens={budget}，请求会永久无法调度。':
    'Speculative decoding requires at least 1 + draftTokens = {required} tokens of Token Budget per step; with max_num_batched_tokens={budget}, requests can never be scheduled.',
  '提高 max_num_batched_tokens 或降低 draftTokens。':
    'Raise max_num_batched_tokens or lower draftTokens.',
  'SP={sp} 不能大于 TP={tp}；SP 复用 TP Rank 的 Activation 分片，不能新增设备。':
    'SP={sp} cannot exceed TP={tp}; SP reuses TP rank activation shards and cannot add devices.',
  '当前教学适配器不建模 PP 与 PD 分离的组合；请分开验证 PP 或 PD。':
    'The current teaching adapter does not model PP combined with PD disaggregation; validate PP or PD separately.',
  '将 PP 设为 1，或使用 mixed Engine。': 'Set PP to 1, or use a mixed engine.',
  '当前教学适配器不建模 PP 与 PCP 的组合；两者都会改变 Rank 布局。':
    'The current teaching adapter does not model PP combined with PCP; both change the rank layout.',
  '将 PP 或 PCP 设为 1。': 'Set PP or PCP to 1.',
  'EP 只适用于带 MoE 结构的模型；Dense 模型不能启用专家并行。':
    'EP applies only to models with a MoE structure; dense models cannot enable expert parallelism.',
  'EP={ep} 需要至少 {required} 个显式 Rank。': 'EP={ep} requires at least {required} explicit ranks.',
  'DCP={dcp} 不能大于 TP={tp}；DCP 必须复用 TP Rank，不能新增设备。':
    'DCP={dcp} cannot exceed TP={tp}; DCP must reuse TP ranks and cannot add devices.',
  'PCP={pcp} 在教学中按显式 Rank 放置；适配器仅声明 partial 支持，不宣称与上游实现等价。':
    'In this teaching model, PCP={pcp} is placed via explicit ranks; the adapter declares only partial support and does not claim equivalence with the upstream implementation.',
  'Engine {engine} 没有 Rank。': 'Engine {engine} has no ranks.',
  'Rank ID {rankId} 重复。': 'Rank ID {rankId} is duplicated.',
  'Rank {rank} 引用了不存在的 Engine {engine}。': 'Rank {rank} references nonexistent engine {engine}.',
  'Rank {rank} 引用了不存在的加速卡 {accelerator}。':
    'Rank {rank} references nonexistent accelerator {accelerator}.',
  '加速卡 {accelerator} 同时映射给 Rank {previous} 与 {rank}；MVP 不支持共享设备。':
    'Accelerator {accelerator} is mapped to both rank {previous} and rank {rank}; the MVP does not support shared devices.',
  '减少 Rank 数或更换设备。': 'Reduce the rank count or change devices.',
  'Rank {rank} 不在任何 Engine 的 rankIds 中。': 'Rank {rank} is not in any engine’s rankIds.',
  'TP Group {groupId} 有 {count} 个 Rank，但对应角色 TP={expectedTp}。':
    'TP group {groupId} has {count} ranks, but the corresponding role has TP={expectedTp}.',
  '重新生成并行映射。': 'Regenerate the parallel mapping.',
  '检测到 {replicaCount} 个 DP 副本，但 logicalParallelism.dp={dp}。':
    'Detected {replicaCount} DP replicas, but logicalParallelism.dp={dp}.',
  '{role} 角色检测到 {roleReplicas} 个副本，但 {roleAgain}Dp={expected}。':
    'The {role} role detected {roleReplicas} replicas, but {roleAgain}Dp={expected}.',
  '当前有 {count} 个 Rank，期望 {expectedRanks}。':
    'There are currently {count} ranks; expected {expectedRanks}.',
  '仅在明确使用额外并行维度时才允许不一致。':
    'A mismatch is allowed only when an extra parallelism dimension is explicitly in use.',
  'EP={ep} 但没有任何 Rank 声明 epGroupIds。': 'EP={ep} is set, but no rank declares epGroupIds.',
  '重新生成并行映射或关闭 EP。': 'Regenerate the parallel mapping or disable EP.',
  'EP Group {groupId} 有 {count} 个 Rank，但 ep={ep}。':
    'EP group {groupId} has {count} ranks, but ep={ep}.',
  'DCP={dcp} 但没有任何 Rank 声明 dcpGroupId。': 'DCP={dcp} is set, but no rank declares dcpGroupId.',
  '重新生成并行映射或关闭 DCP。': 'Regenerate the parallel mapping or disable DCP.',
  'DCP Group {groupId} 有 {count} 个 Rank，但 dcpSize={dcp}。':
    'DCP group {groupId} has {count} ranks, but dcpSize={dcp}.',
  'DCP Group {groupId} 跨越多个 TP Group；DCP 必须复用同一 TP Group 的 Rank。':
    'DCP group {groupId} spans multiple TP groups; DCP must reuse ranks from the same TP group.',
  'PCP={pcp} 但没有任何 Rank 声明 pcpGroupId。': 'PCP={pcp} is set, but no rank declares pcpGroupId.',
  '重新生成并行映射或关闭 PCP。': 'Regenerate the parallel mapping or disable PCP.',
  'PCP Group {groupId} 有 {count} 个 Rank，期望 TP×PCP={expected}。':
    'PCP group {groupId} has {count} ranks; expected TP×PCP={expected}.',
  '检测到 {stageCount} 个 PP Stage Index，但 logicalParallelism.pp={pp}。':
    'Detected {stageCount} PP stage indices, but logicalParallelism.pp={pp}.',
  'PP Stage {stageId} 有 {count} 个 Rank，期望每个 Stage TP={tp}。':
    'PP stage {stageId} has {count} ranks; each stage is expected to have TP={tp}.',
  'PP Stage {stageIndex} 在 {dp} 个 DP 副本中共有 {count} 个 Rank，期望 TP×DP={expectedPerStage}。':
    'PP stage {stageIndex} has {count} ranks across {dp} DP replicas; expected TP×DP={expectedPerStage}.',
  '存在 ppStageId，但 logicalParallelism.pp=1。':
    'ppStageId is present, but logicalParallelism.pp=1.',
  'SP={sp} 但没有任何 Rank 声明 spGroupId；SP 将只影响时间模型。':
    'SP={sp} is set, but no rank declares spGroupId; SP will affect only the timing model.',
  'SP Group {groupId} 有 {count} 个 Rank，但 spSize={sp}。':
    'SP group {groupId} has {count} ranks, but spSize={sp}.',
  'SP Group {groupId} 跨越多个 TP Group；SP 必须复用同一 TP Group 的 Rank。':
    'SP group {groupId} spans multiple TP groups; SP must reuse ranks from the same TP group.',
  '当前教学模型把投机解码应用于所有 Decode Engine，未区分 Draft 模型独立部署；结果仅作结构级对比。':
    'The current teaching model applies speculative decoding to all decode engines without separating draft-model deployment; results are for structural comparison only.',
  'backend-specific 抢占未单独建模；仿真按 recompute 处理，结果只作结构级对比。':
    'Backend-specific preemption is not modeled separately; the simulation treats it as recompute, and results are for structural comparison only.',
  '适配器 {framework} 明确不支持 {feature}。': 'Adapter {framework} explicitly does not support {feature}.',
  '{feature} 在适配器 {framework} 中为 partial：只覆盖已声明的子集，不能宣称与上游实现等价。':
    '{feature} is partial in adapter {framework}: only the declared subset is covered, and equivalence with the upstream implementation cannot be claimed.',
  '{feature} 在适配器 {framework} 中为 unknown，不能宣称已验证可用。':
    '{feature} is unknown in adapter {framework}; it cannot be claimed as verified.',
  '仅以教学假设模式运行，或提供对应版本的官方依据。':
    'Run only in teaching-assumption mode, or provide official evidence for the corresponding version.',
  'Prompt/Output token 数不能为负。': 'Prompt/output token counts cannot be negative.',
  'ISL+OSL={totalTokens} 超过 max_model_len={maxModelLen}；仿真会在到达时拒绝该请求（REQUEST_REJECTED / MAX_MODEL_LEN_EXCEEDED）。':
    'ISL+OSL={totalTokens} exceeds max_model_len={maxModelLen}; the simulation will reject the request on arrival (REQUEST_REJECTED / MAX_MODEL_LEN_EXCEEDED).',
  '提高 max_model_len 或降低请求长度。': 'Raise max_model_len or reduce the request length.',
  'Trace 没有任何请求。': 'The trace contains no requests.',
  'Prefix block {hash} 的 tokenCount={tokenCount}，不是完整块 {blockSize}；不会按完整前缀命中。':
    'Prefix block {hash} has tokenCount={tokenCount}, which is not a full block of {blockSize}; it will not hit as a full prefix.',
  '最后一轮 prompt+output={lastTurn} 超过 max_model_len={maxModelLen}。':
    'The final turn’s prompt+output={lastTurn} exceeds max_model_len={maxModelLen}.',
  'PD 分离场景必须同时存在 prefill 与 decode 引擎。':
    'A PD disaggregation scenario must have both prefill and decode engines.',
  'PD 分离需要 KV Transfer 策略（PD_PULL / PD_LAYERWISE_PUSH / PD_HOST_STAGING）。':
    'PD disaggregation requires a KV transfer strategy (PD_PULL / PD_LAYERWISE_PUSH / PD_HOST_STAGING).',
  'CPU_OFFLOAD 不是 PD 引擎间的传输策略；请使用 PD_PULL / PD_LAYERWISE_PUSH / PD_HOST_STAGING。':
    'CPU_OFFLOAD is not a transfer strategy between PD engines; use PD_PULL / PD_LAYERWISE_PUSH / PD_HOST_STAGING.',
  '启用 CPU Offload 但未设置 Host Cache 容量；将使用 DRAM 可用容量作为上界。':
    'CPU offload is enabled but no host cache capacity is set; available DRAM capacity will be used as the upper bound.',
  '链路 {linkId} 引用了不存在的 contention domain "{domainId}"；共享带宽将无法串行化。':
    'Link {linkId} references nonexistent contention domain "{domainId}"; shared bandwidth cannot be serialized.',
  '在硬件 Profile 中声明该 contention domain，或修正链路引用。':
    'Declare the contention domain in the hardware profile, or fix the link reference.',
  '部分 HBM 带宽为 unknown；只能做结构分析，不产生时间预测。':
    'Some HBM bandwidth is unknown; only structural analysis is possible, with no time prediction.',
  '模型缺少 Tensor Inventory；无法计算每卡权重驻留。':
    'The model lacks a tensor inventory; per-GPU weight residency cannot be computed.',

  // ------------------------------------------------------------------
  // Core validation — calibration
  // ------------------------------------------------------------------
  'batchMax 必须 >= batchMin。': 'batchMax must be >= batchMin.',
  'seqLenMax 必须 >= seqLenMin。': 'seqLenMax must be >= seqLenMin.',
  '提供 schemaVersion="1.0" 与符合字段定义的 curves 数组。':
    'Provide schemaVersion="1.0" and a curves array matching the field definitions.',
  '校准曲线 ID {id} 重复，仅保留第一条。':
    'Calibration curve ID {id} is duplicated; only the first is kept.',
  'kv-transfer 曲线 {id} 缺少 achievedBytesPerSecond；timeUs 无法脱离具体 payload 字节数套用，该曲线不会生效。':
    'The kv-transfer curve {id} lacks achievedBytesPerSecond; timeUs cannot be applied independently of the payload byte count, so the curve will not take effect.',
  '补充实测 achievedBytesPerSecond，或移除该曲线。':
    'Add a measured achievedBytesPerSecond, or remove the curve.',

  // ------------------------------------------------------------------
  // Core KV cache — allocation reasons
  // ------------------------------------------------------------------
  '需要 {neededBlocks} 个 KV Block，超过池容量 {capacity}。':
    'Requires {neededBlocks} KV blocks, exceeding the pool capacity of {capacity}.',
  'KV 池没有可用的空闲 Block，且没有可淘汰的无引用缓存块。':
    'The KV pool has no free blocks and no unreferenced cached blocks that can be evicted.',

  // ------------------------------------------------------------------
  // Adapters — feature matrix
  // ------------------------------------------------------------------
  '按 token 预算切分 Prefill；调度顺序可解释。':
    'Prefill is split by token budget; scheduling order is explainable.',
  '连续完整 Block 前缀匹配，部分命中不跨空洞复用。':
    'Matches contiguous full-block prefixes; partial hits are not reused across holes.',
  '抢占 / 重算': 'Preemption / recompute',
  'KV 不足时释放最低优先级请求并重算；不实现 Swap 模式。':
    'Releases the lowest-priority requests and recomputes when KV is insufficient; swap mode is not implemented.',
  'PD 分离': 'PD disaggregation',
  'Prefill Engine 完成后显式传输 KV 到 Decode Engine。':
    'After the prefill engine completes, KV is explicitly transferred to the decode engine.',
  '仅建模完整 Block 的主机驻留/回迁；不做逐层流水。':
    'Models host residency/migration for whole blocks only; no layer-wise pipelining.',
  '结构/容量层面按专家分片；不模拟 All-to-All 延迟细节。':
    'Expert sharding at the structural/capacity level; All-to-All latency details are not simulated.',
  'DCP 复用 TP Rank；PCP 在显式放置中增加 Rank。仅结构/容量，不模拟逐层流水。':
    'DCP reuses TP ranks; PCP adds ranks through explicit placement. Structural/capacity only; layer-wise pipelining is not simulated.',
  '逐层 KV 传输': 'Layer-wise KV transfer',
  '当前只支持整段 KV 传输。': 'Only whole-segment KV transfer is currently supported.',

  // ------------------------------------------------------------------
  // Adapters — parameter metadata
  // ------------------------------------------------------------------
  'Token 预算': 'Token Budget',
  '一次调度迭代可处理的 Prefill + Decode Token 上限（vLLM max_num_batched_tokens 子集）。':
    'Upper bound on Prefill + Decode tokens processed in one scheduling iteration (a subset of vLLM max_num_batched_tokens).',
  '吞吐': 'Throughput',
  'Chunked Prefill 粒度': 'Chunked Prefill granularity',
  '并发序列上限': 'Concurrent sequence limit',
  '一次迭代可同时调度的请求数上限。':
    'Upper bound on requests scheduled concurrently in one iteration.',
  '批大小': 'Batch size',
  '排队': 'Queueing',
  'KV 峰值': 'KV peak',
  'KV Block 大小': 'KV block size',
  'KV Cache 的逻辑块大小；影响内部碎片与 Prefix 匹配粒度。':
    'Logical block size of the KV cache; affects internal fragmentation and prefix-match granularity.',
  'KV 池块数': 'KV pool block count',
  '前缀命中粒度': 'Prefix hit granularity',
  '内存碎片': 'Memory fragmentation',
  '允许长 Prompt 跨多个调度迭代分块计算。':
    'Allows long prompts to be computed in chunks across multiple scheduling iterations.',
  'Decode 干扰': 'Decode interference',
  '保留已计算完整块的哈希，供后续请求连续前缀复用。':
    'Retains hashes of computed full blocks for contiguous prefix reuse by later requests.',
  'Prefill 计算量': 'Prefill compute',
  'KV 占用': 'KV usage',
  'GPU 显存利用率': 'GPU memory utilization',
  'HBM 预算 = 容量 × 利用率 - 外部预留。': 'HBM budget = capacity × utilization - external reserve.',
  'KV 池容量': 'KV pool capacity',
  '可行性': 'Feasibility',
  '显式 KV 预算': 'Explicit KV budget',
  '可选覆盖：显式限制 KV Pool 字节数，超过预算时按预算上限处理。':
    'Optional override: explicitly cap the KV pool in bytes; values above the budget are capped at the budget.',
  '抢占概率': 'Preemption probability',
  '抢占策略': 'Preemption policy',
  'recompute 会释放受害者 KV 并重算；none 表示 KV 不足时拒绝/等待。':
    'recompute releases victim KV and recomputes; none means reject/wait when KV is insufficient.',
  '尾延迟': 'Tail latency',
  '重算 Token 数': 'Recomputed token count',
  'Tensor Parallel 组大小；来自显式 Device→Rank 放置，不做乘法推断。':
    'Tensor Parallel group size; taken from explicit device→rank placement, not inferred by multiplication.',
  '每卡权重': 'Per-GPU weights',
  'KV 头分片': 'KV head sharding',
  '通信开销': 'Communication overhead',
  '数据并行副本数；每个副本有独立 Engine 与 KV Pool。':
    'Number of data-parallel replicas; each replica has its own engine and KV pool.',
  '路由': 'Routing',
  '总吞吐': 'Total throughput',
  '设备数': 'Device count',
  '专家并行组大小；仅在 MoE 模型下生效。':
    'Expert parallel group size; applies only to MoE models.',
  '每卡专家权重': 'Per-GPU expert weights',
  '专家通信（未细化）': 'Expert communication (not detailed)',

  // ------------------------------------------------------------------
  // Adapters — trace import issues
  // ------------------------------------------------------------------
  'observed.{key} 不是非负数，已忽略。': 'observed.{key} is not a non-negative number; ignored.',
  '事件数 {count} 超过上限 {limit}，仅检查前 {limitAgain} 条。':
    'Event count {count} exceeds the limit of {limit}; only the first {limitAgain} are checked.',
  'event 需要非负 timeUs/atUs/timestampUs 与字符串 type/kind，已忽略该条。':
    'event requires a non-negative timeUs/atUs/timestampUs and string type/kind; this entry was ignored.',
  '前缀块数 {count} 超过上限 {limit}，仅保留前 {limitAgain} 个。':
    'Prefix block count {count} exceeds the limit of {limit}; only the first {limitAgain} are kept.',
  '前缀块需要 hash 与非负 tokenCount，已忽略该块。':
    'A prefix block requires hash and a non-negative tokenCount; this block was ignored.',
  'Trace 必须是 JSON 对象。': 'The trace must be a JSON object.',
  '使用 schemaVersion="1.0" 与 requests 数组。': 'Use schemaVersion="1.0" with a requests array.',
  '仅支持 schemaVersion="1.0"。': 'Only schemaVersion="1.0" is supported.',
  'requests 必须是非空数组。': 'requests must be a non-empty array.',
  '请求数 {count} 超过上限 {limit}，仅导入前 {limitAgain} 条。':
    'Request count {count} exceeds the limit of {limit}; only the first {limitAgain} are imported.',
  '请求缺少 id，已跳过。': 'A request is missing id and was skipped.',
  '请求 ID {id} 重复，已跳过。': 'Request ID {id} is duplicated and was skipped.',
  '请求 {id} 的 arrivalUs/atUs 不是非负数，已跳过该请求。':
    'The arrivalUs/atUs of request {id} is not a non-negative number; the request was skipped.',
  '请求 {id} 缺少非负 promptTokens/outputTokens，已跳过。':
    'Request {id} is missing non-negative promptTokens/outputTokens and was skipped.',
  '没有可用的请求记录。': 'No usable request records.',
  'Trace 只包含请求级观测值；Prefill/Decode 阶段时序仍由仿真推断，不显示为实测。':
    'The trace contains request-level observations only; Prefill/Decode stage timing is still inferred by the simulation and is not shown as measured.',

  // ------------------------------------------------------------------
  // Profiles — hardware evidence and provenance notes
  // ------------------------------------------------------------------
  '合成教学 Profile；数值用于机制演示，不代表任何真实产品规格。':
    'Synthetic teaching profile; values are for mechanism demonstration and do not represent any real product specification.',
  '合成 HBM 读带宽 100 GB/s（教学值）。': 'Synthetic HBM read bandwidth 100 GB/s (teaching value).',
  '合成 HBM 写带宽 90 GB/s（教学值）。': 'Synthetic HBM write bandwidth 90 GB/s (teaching value).',
  '合成有效算力 {tflops} TFLOP/s（教学值）。':
    'Synthetic effective compute {tflops} TFLOP/s (teaching value).',
  '模板未提供主机内存带宽。': 'The template does not provide host memory bandwidth.',
  '模板未提供 HBM 带宽。': 'The template does not provide HBM bandwidth.',
  '模板未提供算力。': 'The template does not provide compute.',
  '结构模板：仅提供节点/设备/链路结构，算力与带宽未校准，禁止用于容量或性能结论。':
    'Structural template: provides node/device/link structure only; compute and bandwidth are uncalibrated and must not be used for capacity or performance conclusions.',

  // ------------------------------------------------------------------
  // Profiles — model provenance notes
  // ------------------------------------------------------------------
  '合成 Dense 模型（约 2.5B 参数），用于机制教学；权重布局为显式近似。':
    'Synthetic dense model (~2.5B parameters) for mechanism teaching; weight layout is an explicit approximation.',
  '合成 MoE 模型：64 专家 / top-4，含 {redundantExperts} 个冗余专家副本；权重为教学近似。':
    'Synthetic MoE model: 64 experts / top-4, including {redundantExperts} redundant expert replicas; weights are teaching approximations.',
  '合成 MoE 模型：64 专家 / top-4，专家权重显式为教学近似。':
    'Synthetic MoE model: 64 experts / top-4; expert weights are explicitly teaching approximations.',
  '合成 MLA 模型：latent=512 + RoPE=64，KV 布局按 DCP 上下文分片显式建模。':
    'Synthetic MLA model: latent=512 + RoPE=64; KV layout explicitly models DCP context sharding.',
  '合成 MLA 模型：latent=512 + RoPE=64，KV 布局按 latent 缓存显式建模，用于教学对比。':
    'Synthetic MLA model: latent=512 + RoPE=64; KV layout explicitly models the latent cache for teaching comparisons.',
  '合成稀疏 Attention 模型：SFA 窗口缓存 + DSA 压缩缓存，显式 cache group 仅用于教学。':
    'Synthetic sparse-attention model: SFA window cache + DSA compressed cache; explicit cache groups are for teaching only.',
  'GLM-5.3 结构模板：缺少可验证的权重与 KV 布局数据；仅用于导入/结构展示。':
    'GLM-5.3 structural template: lacks verifiable weight and KV layout data; for import/structural display only.',

  // ------------------------------------------------------------------
  // Profiles — framework and scenario provenance notes
  // ------------------------------------------------------------------
  '受 vLLM V1 调度思想启发的可解释子集，不是官方实现，也不声称版本等价。':
    'An explainable subset inspired by vLLM V1 scheduling ideas; not an official implementation and makes no version-equivalence claim.',
  '机制教学仿真；时间指标使用显式合成成本模型。':
    'Mechanism-teaching simulation; time metrics use an explicit synthetic cost model.',
} as const;
