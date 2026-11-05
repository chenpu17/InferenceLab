import type { ReactNode } from 'react';
import { useLabStore, type Lens } from '../store/useLabStore';
import { useI18n } from '../i18n';

const LENSES: Array<{ id: Lens; icon: string; label: string; hint: string }> = [
  { id: 'topology', icon: '▦', label: '拓扑', hint: '物理拓扑 / TP·DP·EP 组' },
  { id: 'memory', icon: '▤', label: '显存', hint: 'HBM 预算 / KV Pool / Block' },
  { id: 'scheduler', icon: '☷', label: '调度', hint: 'Waiting / Running / Token Budget' },
  { id: 'transport', icon: '⇄', label: '传输', hint: '链路 / 传输 / 竞争域' },
  { id: 'metrics', icon: '▥', label: '指标', hint: '关键路径 / 证据 / 质量' },
];

export function ToolRail(): ReactNode {
  const activeLens = useLabStore((state) => state.activeLens);
  const setLens = useLabStore((state) => state.setLens);
  const resetOnboarding = useLabStore((state) => state.resetOnboarding);
  const { t } = useI18n();

  return (
    <nav className="tool-rail" aria-label={t('观察层')}>
      {LENSES.map((lens) => (
        <button
          key={lens.id}
          className={`rail-btn ${activeLens === lens.id ? 'active' : ''}`}
          title={`${t(lens.label)} · ${t(lens.hint)}`}
          aria-label={`${t(lens.label)}：${t(lens.hint)}`}
          aria-pressed={activeLens === lens.id}
          onClick={() => setLens(lens.id)}
          data-testid={`lens-${lens.id}`}
        >
          <span aria-hidden="true">{lens.icon}</span>
          <span className="rail-label">{t(lens.label)}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      <button className="rail-btn" title={t('3 分钟引导 / 帮助')} aria-label={t('帮助')} onClick={resetOnboarding}>
        <span aria-hidden="true">?</span>
      </button>
    </nav>
  );
}
