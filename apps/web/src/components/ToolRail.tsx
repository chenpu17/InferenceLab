import type { ReactNode } from 'react';
import { useLabStore } from '../store/useLabStore';
import { LENS_DEFINITIONS } from '../lib/lenses';
import { Icon } from './ui/Icon';
import { useI18n } from '../i18n';

export function ToolRail(): ReactNode {
  const activeLens = useLabStore((state) => state.activeLens);
  const setLens = useLabStore((state) => state.setLens);
  const resetOnboarding = useLabStore((state) => state.resetOnboarding);
  const { t } = useI18n();

  return (
    <nav className="tool-rail" aria-label={t('观察层')}>
      {LENS_DEFINITIONS.map((lens, index) => (
        <button
          key={lens.id}
          className={`rail-btn ${activeLens === lens.id ? 'active' : ''}`}
          title={`${t(lens.label)} · ${t(lens.hint)}`}
          aria-label={`${t(lens.label)}：${t(lens.hint)}`}
          aria-pressed={activeLens === lens.id}
          onClick={() => setLens(lens.id)}
          data-testid={`lens-${lens.id}`}
        >
          <span className="lens-number mono" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <Icon name={lens.id} />
          <span className="rail-label">{t(lens.label)}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      <button className="rail-btn" title={t('3 分钟引导 / 帮助')} aria-label={t('帮助')} onClick={resetOnboarding}>
        <Icon name="help" />
      </button>
    </nav>
  );
}
