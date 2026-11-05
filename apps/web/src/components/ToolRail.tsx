import type { ReactNode } from 'react';
import { useLabStore, type Lens } from '../store/useLabStore';

const LENSES: Array<{ id: Lens; icon: string; label: string; hint: string }> = [
  { id: 'topology', icon: '▦', label: 'Topology', hint: '物理拓扑 / TP·DP·EP 组' },
  { id: 'memory', icon: '▤', label: 'Memory', hint: 'HBM 预算 / KV Pool / Block' },
  { id: 'scheduler', icon: '☷', label: 'Scheduler', hint: 'Waiting / Running / Token Budget' },
  { id: 'transport', icon: '⇄', label: 'Transport', hint: '链路 / 传输 / 竞争域' },
  { id: 'metrics', icon: '▥', label: 'Metrics', hint: '关键路径 / 证据 / 质量' },
];

export function ToolRail(): ReactNode {
  const activeLens = useLabStore((state) => state.activeLens);
  const setLens = useLabStore((state) => state.setLens);
  const resetOnboarding = useLabStore((state) => state.resetOnboarding);

  return (
    <nav className="tool-rail" aria-label="观察层">
      {LENSES.map((lens) => (
        <button
          key={lens.id}
          className={`rail-btn ${activeLens === lens.id ? 'active' : ''}`}
          title={`${lens.label} · ${lens.hint}`}
          aria-label={`${lens.label}：${lens.hint}`}
          aria-pressed={activeLens === lens.id}
          onClick={() => setLens(lens.id)}
          data-testid={`lens-${lens.id}`}
        >
          <span aria-hidden="true">{lens.icon}</span>
          <span className="rail-label">{lens.label}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      <button className="rail-btn" title="3 分钟引导 / 帮助" aria-label="帮助" onClick={resetOnboarding}>
        <span aria-hidden="true">?</span>
      </button>
    </nav>
  );
}
