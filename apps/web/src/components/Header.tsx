import { useEffect, useRef, useState, type ReactNode } from 'react';
import { scenarioPresets } from '@inferencelab/profiles';
import { useLabStore, type Mode } from '../store/useLabStore';
import { QUALITY_TITLE } from '../lib/format';
import { useI18n } from '../i18n';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Icon } from './ui/Icon';

const MODES: Array<{ id: Mode; label: string; title?: string; disabled?: boolean }> = [
  { id: 'explore', label: '原理探索' },
  { id: 'experiment', label: '配置实验' },
  { id: 'replay', label: '实测复盘', title: '导入标准 JSON Trace 后，用真实到达/Token 计数驱动仿真；阶段时序仍标注为推断。' },
];

function QualityBadge(): ReactNode {
  const tier = useLabStore((state) => state.qualityTier);
  const { t } = useI18n();
  const label = tier === 'measured' ? 'MEASURED' : tier === 'unknown' ? 'UNKNOWN' : 'SYNTHETIC';
  const title =
    tier === 'measured'
      ? t('至少一项指标来自已校准/实测 Profile；其余指标仍需逐项查看来源。')
      : tier === 'unknown'
        ? t('关键 Profile 或 KV 布局未知；UI 不会显示精确时间或容量结论。')
        : t(QUALITY_TITLE.assumption);
  return (
    <span className={`quality-pill quality-${tier}`} title={title} data-testid="quality-badge">
      ◆ {label}
    </span>
  );
}

function DraftBadge(): ReactNode {
  const running = useLabStore((state) => state.running);
  const runProgress = useLabStore((state) => state.runProgress);
  const activeRun = useLabStore((state) => state.activeRun);
  const draftDirty = useLabStore((state) => state.draftDirty);
  const planStatus = useLabStore((state) => state.planStatus);
  const { t } = useI18n();
  let label = '● 结构预览';
  let labelParams: { received: number; total: number } | undefined;
  let tone = 'neutral';
  if (running && runProgress.phase === 'receiving') {
    label = '● 接收结果 {received}/{total}';
    labelParams = {
      received: runProgress.receivedChunks,
      total: runProgress.totalChunks,
    };
    tone = 'running';
  } else if (running && runProgress.phase === 'assembling') {
    label = '● 组装结果…';
    tone = 'running';
  } else if (running) {
    label = '● 运行中';
    tone = 'running';
  } else if (planStatus === 'planning') {
    label = '● 规划中';
  } else if (planStatus === 'invalid') {
    label = '● 配置非法';
    tone = 'blocked';
  } else if (planStatus === 'unknown') {
    label = '● 未知';
    tone = 'unknown';
  } else if (activeRun && draftDirty) {
    label = '● Draft · 未运行';
    tone = 'draft';
  } else if (activeRun) {
    label = '● Run 已冻结';
    tone = 'ready';
  }
  return (
    <span className={`draft-pill draft-${tone}`} data-testid="draft-state" aria-live="polite">
      {t(label, labelParams)}
    </span>
  );
}

export function Header(): ReactNode {
  const route = useLabStore((state) => state.route);
  const navigate = useLabStore((state) => state.navigate);
  const mode = useLabStore((state) => state.mode);
  const setMode = useLabStore((state) => state.setMode);
  const scenario = useLabStore((state) => state.scenario);
  const presetId = useLabStore((state) => state.presetId);
  const loadPreset = useLabStore((state) => state.loadPreset);
  const planStatus = useLabStore((state) => state.planStatus);
  const planPreview = useLabStore((state) => state.planPreview);
  const running = useLabStore((state) => state.running);
  const runProgress = useLabStore((state) => state.runProgress);
  const runNow = useLabStore((state) => state.runNow);
  const setLens = useLabStore((state) => state.setLens);
  const theme = useLabStore((state) => state.theme);
  const toggleTheme = useLabStore((state) => state.toggleTheme);
  const reducedMotion = useLabStore((state) => state.reducedMotion);
  const setReducedMotion = useLabStore((state) => state.setReducedMotion);
  const resetOnboarding = useLabStore((state) => state.resetOnboarding);
  const toggleDrawer = useLabStore((state) => state.toggleDrawer);
  const { t, lt, locale, setLocale } = useI18n();
  const [consentOpen, setConsentOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const consentDialogRef = useRef<HTMLDivElement>(null);
  const consentFirstRef = useRef<HTMLButtonElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const moreFirstRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(consentOpen, consentDialogRef, () => setConsentOpen(false), consentFirstRef);

  useEffect(() => {
    if (!moreOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    moreFirstRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMoreOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreWrapRef.current?.contains(event.target)) setMoreOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [moreOpen]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1440px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMoreOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const canRunSynthetic = planPreview?.engines.some((engine) => engine.maxKvBlocksPerRank > 0) ?? false;
  const unknownWarnings = planPreview?.issues.filter((issue) => issue.severity === 'warning').slice(0, 3) ?? [];

  const presetValue = presetId ?? (scenarioPresets.some((preset) => preset.scenario.id === scenario.id) ? scenario.id : '');
  const runDisabled = running || planStatus === 'planning' || planStatus === 'idle' || planStatus === 'invalid';
  const runLabel = !running
    ? t('运行实验')
    : runProgress.phase === 'receiving'
      ? t('接收结果 {received}/{total}', {
          received: runProgress.receivedChunks,
          total: runProgress.totalChunks,
        })
      : runProgress.phase === 'assembling'
        ? t('组装结果…')
        : t('运行中…');
  const determinateProgress = running && runProgress.phase === 'receiving' && runProgress.totalChunks > 0;
  const runTitle =
    planStatus === 'invalid'
      ? t('Plan 不可行；请先在配置面板修复错误。')
      : planStatus === 'planning'
        ? t('正在生成结构预览…')
        : running
          ? runLabel
          : planStatus === 'unknown'
            ? t('Plan 为 unknown；点击后需要显式选择降级方式。')
            : t('冻结当前 Draft，运行离散事件仿真。');

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="brand" onClick={() => navigate('lab')} aria-label={t('返回工作台')}>
          <span className="brandmark"><Icon name="experiment" size={22} /></span>
          <span className="brandtext">
            <span>InferenceLab <span className="version">v1.1</span></span>
            <span className="brand-kicker mono">MECHANISM CONSOLE</span>
          </span>
        </button>
        <label className="scenario-picker">
          <span className="scenario-dot" aria-hidden="true" />
          <span className="sr-only">{t('选择场景预设')}</span>
          <select
            value={presetValue}
            onChange={(event) => {
              if (event.target.value) loadPreset(event.target.value);
            }}
            data-testid="scenario-select"
            title={lt(scenario.title)}
          >
            {presetValue === '' && <option value="">{t('自定义 · {title}', { title: lt(scenario.title) })}</option>}
            {scenarioPresets.map((preset) => (
              <option key={preset.id} value={preset.scenario.id}>
                {lt(preset.title)}
              </option>
            ))}
          </select>
        </label>
        <nav className="top-nav" aria-label={t('一级功能')}>
          <button className={route === 'lab' ? 'active' : ''} onClick={() => navigate('lab')}>
            {t('工作台')}
          </button>
          <button className={route === 'experiments' ? 'active' : ''} onClick={() => navigate('experiments')}>
            {t('实验')}
          </button>
          <button className={route === 'reference' ? 'active' : ''} onClick={() => navigate('reference')}>
            {t('参考')}
          </button>
        </nav>
        <div className="mode-switch" role="group" aria-label={t('工作模式')}>
          {MODES.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? 'active' : ''}
              disabled={item.disabled}
              title={item.title ? t(item.title) : undefined}
              onClick={() => setMode(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="header-right">
        <QualityBadge />
        <DraftBadge />
        <button
          className="icon-btn lang-btn"
          data-testid="locale-toggle"
          title={locale === 'zh' ? t('切换到英文') : t('切换到中文')}
          aria-label={locale === 'zh' ? t('切换到英文') : t('切换到中文')}
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
        >
          {locale === 'zh' ? 'EN' : '中'}
        </button>
        <div className="header-more-wrap" ref={moreWrapRef}>
          <button
            className="icon-btn more-trigger"
            data-testid="header-more-trigger"
            title={t('更多操作')}
            aria-label={t('更多操作')}
            aria-expanded={moreOpen}
            aria-controls="header-more-popover"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <Icon name="more" />
          </button>          {moreOpen && (
            <div className="header-more" id="header-more-popover" data-testid="header-more" aria-label={t('更多操作')}>
              <div className="more-section more-modes" role="group" aria-label={t('工作模式')}>
                {MODES.map((item, index) => (
                  <button
                    key={item.id}
                    ref={index === 0 ? moreFirstRef : undefined}
                    className={mode === item.id ? 'active' : ''}
                    disabled={item.disabled}
                    title={item.title ? t(item.title) : undefined}
                    aria-pressed={mode === item.id}
                    onClick={() => {
                      setMode(item.id);
                      setMoreOpen(false);
                    }}
                  >
                    {t(item.label)}
                  </button>
                ))}
              </div>
              <div className="more-section more-settings" role="group" aria-label={t('显示与帮助')}>
                <button onClick={toggleTheme}>
                  {theme === 'dark' ? t('切换到浅色主题') : t('切换到深色主题')}
                </button>
                <button aria-pressed={reducedMotion} onClick={() => setReducedMotion(!reducedMotion)}>
                  {reducedMotion ? t('关闭减少动效') : t('开启减少动效')}
                </button>
                <button
                  onClick={() => {
                    resetOnboarding();
                    setMoreOpen(false);
                  }}
                >
                  {t('帮助')}
                </button>
              </div>
              <nav className="more-section more-nav" aria-label={t('一级功能')}>
                <button
                  className={route === 'lab' ? 'active' : ''}
                  onClick={() => {
                    navigate('lab');
                    setMoreOpen(false);
                  }}
                >
                  {t('工作台')}
                </button>
                <button
                  className={route === 'experiments' ? 'active' : ''}
                  onClick={() => {
                    navigate('experiments');
                    setMoreOpen(false);
                  }}
                >
                  {t('实验')}
                </button>
                <button
                  className={route === 'reference' ? 'active' : ''}
                  onClick={() => {
                    navigate('reference');
                    setMoreOpen(false);
                  }}
                >
                  {t('参考')}
                </button>
              </nav>
            </div>
          )}
        </div>
        <button
          className="icon-btn mobile-only"
          title={t('打开配置面板')}
          aria-label={t('打开配置面板')}
          onClick={() => toggleDrawer('config')}
        >
          <Icon name="menu" />
        </button>
        <button
          className="icon-btn theme-btn"
          title={theme === 'dark' ? t('切换到浅色主题') : t('切换到深色主题')}
          aria-label={theme === 'dark' ? t('切换到浅色主题') : t('切换到深色主题')}
          onClick={toggleTheme}
        >
          <Icon name="theme" />
        </button>
        <button
          className={`icon-btn motion-btn ${reducedMotion ? 'active' : ''}`}
          title={
            reducedMotion
              ? t('减少动效已开启：用颜色/数字瞬态替代移动粒子')
              : t('开启减少动效')
          }
          aria-label={t('切换减少动效')}
          aria-pressed={reducedMotion}
          onClick={() => setReducedMotion(!reducedMotion)}
        >
          <Icon name="motion" />
        </button>
        <button className="icon-btn help-btn" title={t('重新打开 3 分钟引导')} aria-label={t('帮助')} onClick={resetOnboarding}>
          <Icon name="help" />
        </button>
        <div className="run-control">
          <button
            className="run-btn"
            disabled={runDisabled}
            title={runTitle}
            aria-label={runLabel}
            onClick={() => {
              if (planStatus === 'unknown') setConsentOpen(true);
              else void runNow(false);
            }}
          >
            <span className={`run-icon ${running ? 'running' : ''}`} aria-hidden="true">
              <Icon name={running ? 'motion' : 'run'} />
            </span>
            <span className="run-text">{runLabel}</span>
          </button>
          {running && (
            <progress
              className="run-progress"
              aria-label={runLabel}
              max={determinateProgress ? runProgress.totalChunks : undefined}
              value={determinateProgress ? Math.min(runProgress.receivedChunks, runProgress.totalChunks) : undefined}
            />
          )}
        </div>
      </div>

      {consentOpen && (
        <div
          className="consent-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConsentOpen(false);
          }}
        >
          <div
            ref={consentDialogRef}
            className="consent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unknown-consent-title"
            tabIndex={-1}
          >
            <div className="eyebrow">{t('Plan · 未知')}</div>
            <h2 id="unknown-consent-title">{t('当前 Plan 含未知数据')}</h2>
            <p>
              {t('权重、KV 布局或框架能力中存在未验证项。请选择如何继续；系统不会把猜测当作已验证结果。')}
            </p>
            {unknownWarnings.length > 0 && (
              <ul className="consent-reasons">
                {unknownWarnings.map((warning) => (
                  <li key={`${warning.code}-${warning.path}`}>{lt(warning.message)}</li>
                ))}
              </ul>
            )}
            <div className="consent-actions">
              <button
                ref={consentFirstRef}
                className="btn"
                onClick={() => {
                  setConsentOpen(false);
                  setLens('topology');
                }}
              >
                {t('仅结构查看')}
              </button>
              <button
                className="btn primary"
                disabled={!canRunSynthetic}
                title={
                  canRunSynthetic
                    ? t('以场景中标注的合成参数运行；所有时间指标保持 SYNTHETIC。')
                    : t('当前模板没有可计算的 KV Block，时间仿真无法启动。')
                }
                onClick={() => {
                  setConsentOpen(false);
                  void runNow(true);
                }}
              >
                {t('使用已标注合成参数模拟')}
              </button>
              <button className="btn" onClick={() => setConsentOpen(false)}>
                {t('取消')}
              </button>
            </div>
            {!canRunSynthetic && (
              <p className="caption consent-note">
                {t('该模板缺少可用的 KV 布局，无法建立 KV Block 池；时间仿真会拒绝启动。请先查看结构或补充 Profile。')}
              </p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
