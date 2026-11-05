import type { ReactNode } from 'react';
import { useLabStore } from '../store/useLabStore';
import { useI18n } from '../i18n';

const STEPS = [
  {
    title: '观察',
    body: '当前加速卡被划分成若干独立调度副本；每个副本内的卡协作处理同一批 Token。',
    action: null,
  },
  {
    title: '操作',
    body: '把 TP 调成 8，观察物理卡不动，但组的边界和副本数变化。',
    action: '执行 TP 8',
  },
  {
    title: '解释',
    body: '每个副本都需要放得下本模型；不能只因副本更多就断定吞吐增加。',
    action: null,
  },
  {
    title: '继续',
    body: '选择一张卡，看看权重和 KV 分别占了多少 HBM。',
    action: '选择第一张卡',
  },
  {
    title: '验证',
    body: '运行实验，按 Step 追踪请求的 KV 命中或等待原因。',
    action: '运行实验',
  },
];

export function OnboardingDock(): ReactNode {
  const onboarding = useLabStore((state) => state.onboarding);
  const setOnboarding = useLabStore((state) => state.setOnboarding);
  const plan = useLabStore((state) => state.planPreview);
  const setTp = useLabStore((state) => state.setTp);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const setLens = useLabStore((state) => state.setLens);
  const runNow = useLabStore((state) => state.runNow);
  const planStatus = useLabStore((state) => state.planStatus);
  const { t } = useI18n();

  if (!onboarding.open || onboarding.completed) return null;
  const step = STEPS[Math.min(onboarding.step, STEPS.length - 1)]!;
  const action = step.action;
  const cards = plan?.totals.acceleratorCount ?? 0;
  const replicas = plan?.totals.replicaCount ?? 0;

  const runAction = () => {
    if (onboarding.step === 1) {
      setTp(8);
      setOnboarding({ step: 2 });
      return;
    }
    if (onboarding.step === 3) {
      const first = plan?.resolvedRanks[0];
      if (first) selectEntity({ kind: 'device', id: first.acceleratorId }, { lens: 'memory', focus: true });
      setOnboarding({ step: 4 });
      return;
    }
    if (onboarding.step === 4) {
      setLens('scheduler');
      if (planStatus === 'ready') void runNow(false);
      setOnboarding({ step: 5, completed: true, open: false });
    }
  };

  return (
    <div className="onboarding-dock" role="dialog" aria-label={t('3 分钟引导')}>
      <div className="onboarding-head">
        <span className="onboarding-step">
          {t('引导 {current}/{total}', { current: Math.min(onboarding.step + 1, STEPS.length), total: STEPS.length })}
        </span>
        <span className="onboarding-title">{t(step.title)}</span>
        <button
          className="onboarding-skip"
          onClick={() => setOnboarding({ open: false })}
          title={t('跳过引导，之后可从 Header 的 ? 重新打开')}
        >
          {t('跳过')}
        </button>
      </div>
      <p className="onboarding-body">
        {onboarding.step === 0 && cards > 0
          ? t('当前 {cards} 张加速卡被划分成 {replicas} 个独立调度副本。{body}', {
              cards,
              replicas,
              body: t(step.body),
            })
          : t(step.body)}
      </p>
      <div className="onboarding-actions">
        <button
          className="btn small"
          disabled={onboarding.step === 0}
          onClick={() => setOnboarding({ step: Math.max(0, onboarding.step - 1) })}
        >
          {t('上一步')}
        </button>
        {action ? (
          <button className="btn small primary" onClick={runAction}>
            {t(action)}
          </button>
        ) : (
          <button className="btn small primary" onClick={() => setOnboarding({ step: onboarding.step + 1 })}>
            {t('下一步')}
          </button>
        )}
      </div>
    </div>
  );
}
