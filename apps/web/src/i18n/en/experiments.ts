/** English copy for the experiments (run history and A/B compare) page. */
export const experiments = {
  '运行 · {time}': 'Run · {time}',
  '修订 {revision} · {time} 虚拟': 'revision {revision} · {time} virtual',
  '实验记录': 'Experiment records',
  '已记录 Run 数量': 'Number of recorded runs',
  '每次 Run 都会冻结 Scenario、Plan 与完整事件日志。切换记录只重建回放，不重新仿真； 因此同一个 Run 的结果可重复。':
    'Every Run freezes its Scenario, Plan, and full event log. Switching records rebuilds the replay without re-simulating, so the result of a Run is reproducible.',
  '← 回到工作台': '← Back to workbench',
  '↧ 导出记录 JSON': '↧ Export runs JSON',

  '还没有 Run': 'No runs yet',
  '结构预览不会产生指标。回到工作台选择一个预设（例如 `toy-32gpu-tp16-dp2`）， 点击 Header 的“运行实验”，事件日志和指标会出现在这里。':
    'A structural preview produces no metrics. Return to the workbench, choose a preset (for example `toy-32gpu-tp16-dp2`), and click “Run experiment” in the header; the event log and metrics will appear here.',
  '打开工作台': 'Open workbench',

  '完成 / 总数': 'Finished / total',
  '输出吞吐': 'Output throughput',
  'KV 峰值': 'Peak KV',
  '抢占 / 事件': 'Preemptions / events',
  '将本次 Run 设为 A/B 对比的 A 侧': 'Set this run as the A side of the A/B comparison',
  '将本次 Run 设为 A/B 对比的 B 侧': 'Set this run as the B side of the A/B comparison',
  '✓ A 侧': '✓ A side',
  '设为 A': 'Set as A',
  '✓ B 侧': '✓ B side',
  '设为 B': 'Set as B',
  '打开回放 →': 'Open replay →',

  '完成请求数': 'Finished requests',
  'KV 传输字节': 'KV transfer bytes',
  'KV 传输次数': 'KV transfer count',
  '抢占次数': 'Preemption count',

  'Workload 不同：负载差异会与机制差异混杂，不能直接归因。':
    'Workload differs: load differences are confounded with mechanism differences, so the delta cannot be attributed directly.',
  'Seed 不同（{a} vs {b}）：随机到达顺序不同。': 'Seed differs ({a} vs {b}): random arrival order differs.',
  '硬件 Profile 不同：绝对延迟与容量不可直接比较。':
    'Hardware profile differs: absolute latency and capacity are not directly comparable.',
  '模型 Profile 不同：权重与 KV 形状不同。': 'Model profile differs: weights and KV shapes differ.',
  '框架适配器不同：参数语义与能力矩阵不同。':
    'Framework adapter differs: parameter semantics and capability matrices differ.',

  'A/B 对比': 'A/B comparison',
  'A/B 拆分 · 冻结 Run': 'A/B split · frozen runs',
  '可比': 'Comparable',
  '不可比': 'Incomparable',
  '部分可比': 'Partial',
  'Seed {seed}': 'seed {seed}',
  '{count} 个事件': '{count} events',
  '{time} 虚拟': '{time} virtual',
  '并排对比': 'Side-by-side comparison',
  'A 与 B 各自来自独立冻结的 ExperimentResult；对比只读取事件与指标，不重新仿真。':
    'A and B each come from an independently frozen ExperimentResult; the comparison only reads events and metrics and never re-simulates.',
  '打开 {slot} 回放 →': 'Open {slot} replay →',
  '不可比字段 / 归因限制': 'Incomparable fields / attribution limits',
  '来源': 'Source',
  'Δ 仅描述两次冻结结果之间的差异；Synthetic/Assumption 指标不能作为真实硬件性能结论。':
    'Δ describes only the difference between two frozen results; Synthetic/Assumption metrics are not conclusions about real hardware performance.',
  'A/B 对比：在任意两条 Run 上点击“设为 A”与“设为 B”，即可并排比较指标与不可比字段。':
    'A/B comparison: click “Set as A” and “Set as B” on any two runs to compare metrics and incomparable fields side by side.',
  '记录仅保存在当前浏览器会话中，刷新页面后清空；如需长期保存请导出 JSON。 所有 TTFT / TPOT / 吞吐都来自标注过的合成成本模型，不是真实硬件实测。':
    'Records live only in the current browser session and are cleared on refresh; export JSON to keep them. All TTFT / TPOT / throughput values come from a labelled synthetic cost model, not real hardware measurements.',
} as const;
