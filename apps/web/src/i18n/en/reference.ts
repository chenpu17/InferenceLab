/** English copy for the mechanism reference page. Keys are Chinese source strings. */
export const reference = {
  '机制参考': 'Mechanism reference',
  '参考章节导航': 'Reference section navigation',
  'InferenceLab 是纯前端、无后端的推理机制实验台。它把“放置 → 容量 → 调度 → KV → 传输 → 指标” 串成一条可回放的事件链，并明确标注每个数字的来源。':
    'InferenceLab is a fully client-side inference mechanics lab with no backend. It chains placement → capacity → scheduling → KV → transport → metrics into one replayable event chain and labels the provenance of every number.',
  '← 回到工作台': '← Back to workbench',
  '三个核心区分': 'Three core distinctions',
  'Draft 是正在编辑的 Scenario；Plan 是结构预览；Run 冻结 Scenario 并生成事件日志。 修改 Draft 不会篡改已经冻结的 Run。':
    'Draft is the scenario being edited; Plan is the structural preview; Run freezes the scenario and produces an event log. Editing the Draft never alters a frozen Run.',
  'HBM 账本 / KV 账本': 'HBM ledger / KV ledger',
  '外层 HBM 预算扣除权重、运行时、Workspace、通信缓冲与 KV 预留；内层 KV Pool 单独跟踪 used/free。两层不重复计算。':
    'The outer HBM budget deducts weights, runtime, Workspace, communication buffers, and KV reservation; the inner KV Pool tracks used/free separately. The two layers are never double-counted.',
  '物理放置 / 逻辑并行': 'Physical placement / logical parallelism',
  '设备先按 Node → Rank 显式放置，再划分 TP / DP / EP / PD 组。没有隐式的 TP×DP 乘法， 也没有“看不见的卡”。':
    'Devices are explicitly placed as Node → Rank first, then divided into TP / DP / EP / PD groups. There is no implicit TP×DP multiplication and no “invisible GPU”.',

  '指标质量等级': 'Metric quality levels',
  '等级': 'Level',
  '含义': 'Meaning',
  '典型指标': 'Typical metrics',
  '来自已测量或校准的 Profile。': 'Derived from a measured or calibrated profile.',
  '由标注过的合成成本模型推导。': 'Derived from a labelled synthetic cost model.',
  '缺少可计算样本，UI 不显示猜测值。': 'No computable samples; the UI does not show guessed values.',
  '请求数、完成数、KV Block 数、抢占次数、事件时间。':
    'Request counts, completion counts, KV block counts, preemption counts, event times.',
  '导入的校准曲线；仅硬件/模型/框架/dtype/范围全部匹配时生效。':
    'Imported calibration curves; only applies when hardware/model/framework/dtype/range all match.',
  'TTFT、TPOT、吞吐、传输时长。': 'TTFT, TPOT, throughput, transfer duration.',
  '输出 ≤1 token 时的 TPOT、缺少带宽时的传输时间。':
    'TPOT when output ≤1 token; transfer time when bandwidth is missing.',

  '关键公式与约束': 'Key formulas and constraints',
  'HBM 预算': 'HBM budget',
  'KV Pool 是预算内已预留段；Block 分配只改变内层 used/free。':
    'The KV Pool is the reserved segment within the budget; block allocation only changes the inner used/free counters.',
  'KV Block 大小': 'KV block size',
  '按 Rank 的 TP/DP 放置计算；不把 TP 与 DP 相乘。':
    'Computed from each rank’s TP/DP placement; TP and DP are never multiplied together.',
  '调度预算': 'Scheduling budget',
  'Σ(新 Prefill Token) + Σ(Decode Token) ≤ max_num_batched_tokens':
    'Σ(new Prefill tokens) + Σ(Decode tokens) ≤ max_num_batched_tokens',
  'Running 优先，Waiting 按 FCFS 准入；max_num_seqs 同时约束序列数。':
    'Running requests go first and Waiting requests are admitted FCFS; max_num_seqs also caps the sequence count.',
  '传输时间': 'Transfer time',
  '共享竞争域串行排队；PD 的 TTFT 包含 Prefill 到 Decode 的 KV 传输。':
    'Shared contention domains queue serially; PD TTFT includes the Prefill-to-Decode KV transfer.',
  '按 max_num_seqs 个理想微批估算；跨 Stage Activation 另计结构传输成本。':
    'Estimated with max_num_seqs ideal microbatches; cross-stage Activation adds a separate structural transfer cost.',
  'MLA 使用 latent + RoPE 布局，不套用 GQA/MHA 头公式；未启用 DCP 时每 Rank 复制。':
    'MLA uses a latent + RoPE layout rather than the GQA/MHA head formula; without DCP each rank keeps a replica.',
  '窗口/压缩缓存必须由 Profile 显式声明；缺失布局时显示 unavailable，不猜数。':
    'Window/compressed caches must be declared explicitly by the profile; when the layout is missing the UI shows unavailable instead of guessing.',
  '投机解码': 'Speculative decoding',
  'PP 气泡': 'PP Bubble',
  '接受率是场景假设；Draft Token 计入 Token Budget，收益随任务变化。':
    'Acceptance rate is a scenario assumption; draft tokens count against the Token Budget and the gain varies by workload.',

  '指标口径': 'Metric definition',
  'TTFT · 服务端': 'TTFT · server',
  'TTFT · 客户端': 'TTFT · client',
  'TPOT · 服务端': 'TPOT · server',
  'E2E · 服务端': 'E2E · server',
  '定义': 'Definition',
  '不包含': 'Excludes',
  '请求到达调度器 → 首个输出 Token 生成；包含排队、Prefill 与 PD KV 传输。':
    'From arrival at the scheduler → first output token; includes queuing, Prefill, and PD KV transfer.',
  '不含客户端上传、网络 RTT、tokenizer 与首 Token 回传。':
    'Excludes client upload, network RTT, tokenizer, and first-token return.',
  'server TTFT + 请求上传/网络 + 首 Token 回传。':
    'server TTFT + request upload/network + first-token return.',
  '本应用不建模客户端网络，因此不显示 client TTFT；导入 Trace 的 observed 值按其自带口径展示。':
    'This app does not model the client network, so client TTFT is not shown; observed values from an imported trace are displayed under their own definition.',
  '(finish − firstToken) ÷ (outputTokens − 1)；输出 ≤1 Token 时为 N/A。':
    '(finish − firstToken) ÷ (outputTokens − 1); N/A when output ≤1 token.',
  '不含客户端流式间隔与网络抖动。': 'Excludes client streaming gaps and network jitter.',
  'arrival → finish，覆盖排队、Prefill、KV 传输与 Decode。':
    'arrival → finish, covering queuing, Prefill, KV transfer, and Decode.',
  '不含客户端侧时间。': 'Excludes client-side time.',

  '场景预设': 'Scenario presets',
  '加载 →': 'Load →',

  '数据导入 · 校准曲线 / Trace': 'Data import · calibration curves / trace',
  '校准曲线': 'Calibration curves',
  '导入结构化 Benchmark 曲线：op + hardware + model + framework + dtype + batch/seqLen 范围 → 实测耗时。 仅在匹配范围内插值；超范围会降级为 assumption。':
    'Import structured benchmark curves: op + hardware + model + framework + dtype + batch/seqLen range → measured time. Interpolation only happens inside the matching range; values outside it degrade to assumption.',
  '导入曲线 JSON': 'Import curve JSON',
  '{count} 条曲线': '{count} curves',
  '序列 {min}–{max}': 'seq {min}–{max}',
  '清空': 'Clear',
  '标准 Trace': 'Standard trace',
  '导入项目标准 JSON Trace，驱动请求到达与 Token 计数。只有文件内显式提供的 ttftUs/tpotUs 才会标为 Observed；即使文件带 events 字段，当前也不解析，Prefill/Decode 阶段仍显示为仿真推断。':
    'Import a project-standard JSON trace to drive request arrivals and token counts. Only ttftUs/tpotUs explicitly present in the file are marked Observed; the events field is not parsed yet, so Prefill/Decode stages still show as simulated inference.',
  '导入 Trace JSON': 'Import trace JSON',
  '{count} 个请求 · {observed} 条观测': '{count} requests · {observed} observed',
  '来源 {source} · {detail} · 当前模式： 实测复盘': 'Source {source} · {detail} · Current mode: Replay',
  '检测到 events，但当前不用于阶段时序': 'events detected but not used for stage timing yet',
  '仅请求级观测': 'request-level observations only',

  '导入被拒绝：{file}': 'Import rejected: {file}',
  '错误': 'error',
  '警告': 'warning',
  '提示': 'info',
  '已导入校准曲线：{file}': 'Calibration curves imported: {file}',
  '已导入 Trace：{file}（可在“实测复盘”模式查看）': 'Trace imported: {file} (view it in Replay mode)',
  '无法解析 {file}': 'Could not parse {file}',

  '观察 Lens': 'Observation lenses',
  '调度器': 'Scheduler',
  '物理卡、Node、TP/DP/EP/PD 组边界；回答“卡在哪、如何分组”。':
    'Physical GPUs, Nodes, and TP/DP/EP/PD group boundaries; answers “where the GPUs are and how they are grouped”.',
  'HBM 预算组成、KV Pool、Block 状态与主机缓存；回答“空间是否足够”。':
    'HBM budget composition, KV Pool, block states, and host cache; answers “whether there is enough space”.',
  'Waiting/Running/Preempted 与 Token Budget；回答“谁先算、为什么等”。':
    'Waiting/Running/Preempted states and Token Budget; answers “who runs first and why others wait”.',
  '物理链路、KV 传输与竞争域；回答“数据走哪条路、是否排队”。':
    'Physical links, KV transfer, and contention domains; answers “which path data takes and whether it queues”.',
  '关键路径、分布与质量等级；回答“结果是什么、证据有多强”。':
    'Critical path, distributions, and quality levels; answers “what the result is and how strong the evidence is”.',

  '已知限制': 'Known limitations',
  '不是性能预测器：合成成本模型只用于比较机制，不能回答“真实硬件上 TTFT 是多少”。':
    'Not a performance predictor: the synthetic cost model compares mechanisms only and cannot answer “what is TTFT on real hardware”.',
  '不模拟 GPU 内核级并行与真实流水线调度；PP 只按均匀层切分与理想微批估算 bubble。':
    'Does not simulate GPU kernel-level parallelism or real pipeline scheduling; PP estimates bubbles from uniform layer splits and ideal microbatches only.',
  'vLLM 调度器只实现 V1 的机制子集：Token Budget、max_num_seqs、Running 优先、FCFS、Prefix Cache、recompute 抢占。':
    'The vLLM scheduler implements only a subset of V1 mechanics: Token Budget, max_num_seqs, Running-first, FCFS, Prefix Cache, and recompute preemption.',
  'EP / CP / PP / SP 以结构与容量视图为主；SP 复用 TP Rank，不新增设备；不声称覆盖所有 All-to-All 或流水线重叠细节。':
    'EP / CP / PP / SP focus on structural and capacity views; SP reuses TP ranks and adds no devices; no claim is made to cover every All-to-All or pipeline-overlap detail.',
  'MLA 只支持显式 latent + RoPE 布局；SFA/DSA/HYBRID 必须声明 cache group 与 storage，否则显示 unavailable。':
    'MLA supports explicit latent + RoPE layouts only; SFA/DSA/HYBRID must declare a cache group and storage, otherwise the UI shows unavailable.',
  'MTP/DSpark 使用场景显式给出的 Draft 数与接受率；接受率不是实测承诺，DSpark 在教学适配器中仍为 unknown。':
    'MTP/DSpark use the draft count and acceptance rate stated explicitly in the scenario; acceptance is not a measured promise, and DSpark remains unknown in the teaching adapter.',
  'CPU Offload 只建模完整 Block 的主机驻留/回迁，不做逐层流水。':
    'CPU Offload models host residency/migration of whole blocks only; it does not pipeline layer by layer.',
  '所有数字都可追溯到 Plan、Profile 或事件；未知数据显式显示 N/A 或 Unknown。':
    'Every number traces back to a Plan, Profile, or event; unknown data is explicitly shown as N/A or Unknown.',

  'InferenceLab v1.1 · 静态浏览器应用 · 无后端、无上传、无遥测。所有实验数据仅存在于当前页面会话。':
    'InferenceLab v1.1 · static browser app · no backend, no uploads, no telemetry. All experiment data exists only in the current page session.',
} as const;
