/** Onboarding dock copy. Keys are Chinese source strings. */
export const onboarding = {
  '观察': 'Observe',
  '当前加速卡被划分成若干独立调度副本；每个副本内的卡协作处理同一批 Token。':
    'The current accelerators are split into several independent scheduler replicas; cards within each replica cooperate on the same batch of tokens.',
  '操作': 'Act',
  '把 TP 调成 8，观察物理卡不动，但组的边界和副本数变化。':
    'Set TP to 8 and watch the physical cards stay put while group boundaries and replica count change.',
  '执行 TP 8': 'Set TP to 8',
  '解释': 'Explain',
  '每个副本都需要放得下本模型；不能只因副本更多就断定吞吐增加。':
    'Every replica must fit this model; more replicas alone do not imply higher throughput.',
  '继续': 'Continue',
  '选择一张卡，看看权重和 KV 分别占了多少 HBM。':
    'Select a card to see how much HBM weights and KV each occupy.',
  '选择第一张卡': 'Select the first card',
  '验证': 'Verify',
  '运行实验，按 Step 追踪请求的 KV 命中或等待原因。':
    'Run the experiment and trace KV hits or wait reasons per step.',
  '运行实验': 'Run experiment',
  '3 分钟引导': '3-minute guide',
  '引导 {current}/{total}': 'Guide {current}/{total}',
  '跳过引导，之后可从 Header 的 ? 重新打开':
    'Skip the guide; reopen it later from the ? in the Header',
  '跳过': 'Skip',
  '当前 {cards} 张加速卡被划分成 {replicas} 个独立调度副本。{body}':
    'The current {cards} accelerators are divided into {replicas} independent scheduler replicas. {body}',
  '上一步': 'Previous',
  '下一步': 'Next',
} as const;
