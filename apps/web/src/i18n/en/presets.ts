/**
 * English copy for scenario presets from `@inferencelab/profiles`.
 * Keys are the exact Chinese source strings; canonical tags map to themselves.
 */
export const presets = {
  '4 GPU · TP4 基线': '4 GPUs · TP4 baseline',
  '4 张 Toy GPU 组成一个 TP4 Engine；4 个请求同时到达，观察 Prefill/Decode 与 KV 池。':
    'Four toy GPUs form one TP4 engine; four requests arrive together so you can watch Prefill/Decode and the KV pool.',
  '32 GPU · TP16 × DP2': '32 GPUs · TP16 × DP2',
  '两个 DP 副本，每个 TP16；观察副本间请求路由与每副本 KV 峰值。':
    'Two DP replicas, each TP16; watch request routing across replicas and per-replica KV peaks.',
  '高密度 · 48 请求 × 1K 输出': 'High density · 48 requests × 1K output',
  '32 卡 TP16×DP2，48 条 8K Prompt / 1K Output 请求同时到达；用于主线程响应与事件回放压力测试。':
    '32 GPUs at TP16×DP2; 48 requests with 8K prompts / 1K output arrive together, stressing main-thread responsiveness and event replay.',
  '预算 8 Token · 分块 Prefill': 'Budget 8 tokens · chunked Prefill',
  '两个 6-token Prompt 同时到达，max_num_batched_tokens=8：第一步 A 占 6、B 占 2。':
    'Two 6-token prompts arrive together with max_num_batched_tokens=8: the first step gives A 6 tokens and B 2.',
  'Prefix Cache · 连续前缀命中': 'Prefix cache · consecutive prefix hits',
  '三个请求共享连续前缀块；B/C 命中缓存，只有未命中的块需要 Prefill。':
    'Three requests share consecutive prefix blocks; B and C hit the cache, so only the missing blocks need Prefill.',
  'Agent 多轮 · 粘性会话': 'Agent multi-turn · sticky sessions',
  '两个会话各 3 轮；工具等待后进入下一轮，前缀随历史增长，观察会话粘性与缓存复用。':
    'Two conversations of three turns each; after a tool wait the next turn begins with a longer prefix, showing session stickiness and cache reuse.',
  'PD 分离 · Prefill → KV 传输 → Decode': 'PD disaggregation · Prefill → KV transfer → Decode',
  '4 卡 Prefill Engine + 4 卡 Decode Engine；Prefill 完成后通过共享 Fabric 传输 KV。':
    'A 4-GPU Prefill engine plus a 4-GPU Decode engine; after Prefill completes, KV is transferred over the shared fabric.',
  'CPU Offload · 主机 KV 分层': 'CPU Offload · host KV tiering',
  'HBM KV 池收紧，共享前缀块被淘汰到主机内存；后续请求从主机加载。':
    'The HBM KV pool is tightened so shared prefix blocks are evicted to host memory; later requests load them back from the host.',
  'MoE · 冗余专家与热点': 'MoE · redundant experts and hotspots',
  'EP2 + 8 个冗余专家副本 + 偏斜路由；观察每卡专家权重增加与专家负载热点。':
    'EP2 with 8 redundant expert replicas and skewed routing; watch per-GPU expert weight growth and expert load hotspots.',
  'CP · DCP 复用 TP，PCP 增加 Rank': 'CP · DCP reuses TP, PCP adds ranks',
  'TP2 × PCP2：DCP2 只在 TP2 内重标号；PCP2 让 Rank 数从 2 增至 4。':
    'TP2 × PCP2: DCP2 only relabels within TP2; PCP2 raises the rank count from 2 to 4.',
  'MoE · EP2 专家并行': 'MoE · EP2 expert parallelism',
  '64 专家 / top-4；EP2 下每 Rank 持有 32 个专家，展示专家权重驻留而非 TP 乘法。':
    '64 experts, top-4; under EP2 each rank holds 32 experts, showing expert weight residency rather than TP multiplication.',
  'PP2 × SP2 · 分层执行与 Activation 分片': 'PP2 × SP2 · layered execution and Activation sharding',
  'TP2 × PP2 新增 4 个 Rank；SP2 复用同一 TP Group，只把 Activation 沿序列维切分（Workspace 不切分），并与 PCP/DCP 区分。':
    'TP2 × PP2 adds 4 ranks; SP2 reuses the same TP group and shards Activation along the sequence dimension only (Workspace is not sharded), distinct from PCP/DCP.',
  'MLA · Latent KV + DCP2': 'MLA · latent KV + DCP2',
  'MLA 使用 latent=512 + RoPE=64 的 KV 布局，不套用 GQA 头公式；DCP2 在 TP2 内切分 latent 缓存。':
    'MLA uses a latent=512 + RoPE=64 KV layout instead of the GQA head formula; DCP2 shards the latent cache within TP2.',
  'SFA/DSA · 显式稀疏缓存组': 'SFA/DSA · explicit sparse cache groups',
  '前 12 层 SFA 窗口缓存、后 12 层 DSA 压缩缓存；每层声明 cache group，未声明布局的模型保持 unavailable。':
    'The first 12 layers use SFA window cache and the last 12 use DSA compressed cache; each layer declares a cache group, and models without a declared layout stay unavailable.',
  'MTP · 投机解码假设': 'MTP · speculative decoding assumption',
  '每步 Draft 4 个 Token、接受率 0.6；Token Budget 计入 Draft，收益随接受率变化，不是固定加速比。':
    '4 draft tokens per step with a 0.6 acceptance rate; draft tokens count against the Token Budget, so the gain varies with acceptance and is not a fixed speedup.',
  'DSpark · Unknown 适配器边界': 'DSpark · Unknown adapter boundary',
  '使用显式 Draft 8 / 接受率 0.35 运行结构对比；教学适配器将 DSpark 标为 unknown，必须显示未验证警告。':
    'Runs a structural comparison with explicit Draft 8 / acceptance 0.35; the teaching adapter marks DSpark as unknown and must show an unverified warning.',
  'Ascend A3 · GLM-5.3 结构模板': 'Ascend A3 · GLM-5.3 structure template',
  '仅导入结构：算力/HBM 带宽/SFA KV 布局均为 unknown；不允许伪造时间与容量结论。':
    'Structure import only: compute, HBM bandwidth, and SFA KV layout are all unknown; fabricating timing or capacity conclusions is not allowed.',
  'Ascend A3 · 910C × 384 · MoE/EP': 'Ascend A3 · 910C × 384 · MoE/EP',
  '48 节点 × 8 NPU，TP16 × DP24 = 384 Rank；EP8 按 DP 副本分组。观察 24 个 Engine 的请求路由、专家驻留与每 NPU 独立 UB 上行竞争域。':
    '48 nodes × 8 NPUs, TP16 × DP24 = 384 ranks; EP8 groups across DP replicas. Watch request routing across 24 engines, expert residency, and per-NPU UB uplink contention.',
  'Ascend 950DT · 64 卡 PD + MLA + MTP': 'Ascend 950DT · 64-NPU PD + MLA + MTP',
  '单机柜 8 节点 × 8 NPU；P/D 各 TP8 × DP4（各 32 卡），PD_PULL 跨节点传输 KV；MLA latent 缓存与 MTP Draft 4 / 接受率 0.6 均显式为假设。':
    'One rack of 8 nodes × 8 NPUs; Prefill and Decode each run TP8 × DP4 (32 NPUs each), PD_PULL transfers KV across nodes, and MLA latent cache plus MTP Draft 4 / acceptance 0.6 are explicit assumptions.',

  // Tags — canonical protocol/quality identifiers stay identical.
  // '调度' and '假设' are already owned by the lenses fragment; adding them
  // here would override the Lens tab labels, so they are intentionally omitted.
  '基线': 'Baseline',
  '性能': 'Performance',
  '高密度': 'High density',
  '金标': 'Golden',
  '多轮': 'Multi-turn',
  'KV 传输': 'KV transfer',
  'KV 分层': 'KV tiering',
  '冗余专家': 'Redundant experts',
  '稀疏 Attention': 'Sparse attention',
  '投机解码': 'Speculative decoding',
  'TP': 'TP',
  'DP': 'DP',
  'EP': 'EP',
  'PP': 'PP',
  'SP': 'SP',
  'PCP': 'PCP',
  'DCP': 'DCP',
  'PD': 'PD',
  'CP': 'CP',
  'MoE': 'MoE',
  'MLA': 'MLA',
  'MTP': 'MTP',
  'DSpark': 'DSpark',
  'SFA': 'SFA',
  'DSA': 'DSA',
  'Agent': 'Agent',
  'Ascend': 'Ascend',
  '910C': '910C',
  '950DT': '950DT',
  'A3': 'A3',
  'A5': 'A5',
  'UB': 'UB',
  'GLM-5.3': 'GLM-5.3',
  'KV Cache': 'KV Cache',
  'Prefix': 'Prefix',
  'Chunked Prefill': 'Chunked Prefill',
  'Offload': 'Offload',
  'KV Layout': 'KV Layout',
  'Activation Pipeline': 'Activation Pipeline',
  'Unknown': 'Unknown',
  'M2': 'M2',
  'M3': 'M3',
  'M4': 'M4',
  'M5': 'M5',
} as const;
