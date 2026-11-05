import { useEffect, useRef, useState, type ReactNode } from 'react';
import { scenarioPresets } from '@inferencelab/profiles';
import { useLabStore, type Mode } from '../store/useLabStore';
import { QUALITY_TITLE } from '../lib/format';

const MODES: Array<{ id: Mode; label: string; title?: string; disabled?: boolean }> = [
  { id: 'explore', label: '原理探索' },
  { id: 'experiment', label: '配置实验' },
  { id: 'replay', label: '实测复盘', title: '导入标准 JSON Trace 后，用真实到达/Token 计数驱动仿真；阶段时序仍标注为推断。' },
];

function QualityBadge(): ReactNode {
  const tier = useLabStore((state) => state.qualityTier);
  const label = tier === 'measured' ? 'MEASURED' : tier === 'unknown' ? 'UNKNOWN' : 'SYNTHETIC';
  const title =
    tier === 'measured'
      ? '至少一项指标来自已校准/实测 Profile；其余指标仍需逐项查看来源。'
      : tier === 'unknown'
        ? '关键 Profile 或 KV 布局未知；UI 不会显示精确时间或容量结论。'
        : QUALITY_TITLE.assumption;
  return (
    <span className={`quality-pill quality-${tier}`} title={title} data-testid="quality-badge">
      ◆ {label}
    </span>
  );
}

function DraftBadge(): ReactNode {
  const running = useLabStore((state) => state.running);
  const activeRun = useLabStore((state) => state.activeRun);
  const draftDirty = useLabStore((state) => state.draftDirty);
  const planStatus = useLabStore((state) => state.planStatus);
  let label = '● 结构预览';
  let tone = 'neutral';
  if (running) {
    label = '● 运行中';
    tone = 'running';
  } else if (planStatus === 'planning') {
    label = '● 规划中';
  } else if (planStatus === 'invalid') {
    label = '● 配置非法';
    tone = 'blocked';
  } else if (planStatus === 'unknown') {
    label = '● Unknown';
    tone = 'unknown';
  } else if (activeRun && draftDirty) {
    label = '● Draft · 未运行';
    tone = 'draft';
  } else if (activeRun) {
    label = '● Run 已冻结';
    tone = 'ready';
  }
  return (
    <span className={`draft-pill draft-${tone}`} data-testid="draft-state">
      {label}
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
  const runNow = useLabStore((state) => state.runNow);
  const setLens = useLabStore((state) => state.setLens);
  const theme = useLabStore((state) => state.theme);
  const toggleTheme = useLabStore((state) => state.toggleTheme);
  const reducedMotion = useLabStore((state) => state.reducedMotion);
  const setReducedMotion = useLabStore((state) => state.setReducedMotion);
  const resetOnboarding = useLabStore((state) => state.resetOnboarding);
  const toggleDrawer = useLabStore((state) => state.toggleDrawer);
  const [consentOpen, setConsentOpen] = useState(false);
  const consentFirstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (consentOpen) consentFirstRef.current?.focus();
  }, [consentOpen]);

  const canRunSynthetic = planPreview?.engines.some((engine) => engine.maxKvBlocksPerRank > 0) ?? false;
  const unknownWarnings = planPreview?.issues.filter((issue) => issue.severity === 'warning').slice(0, 3) ?? [];

  const presetValue = presetId ?? (scenarioPresets.some((preset) => preset.scenario.id === scenario.id) ? scenario.id : '');
  const runDisabled = running || planStatus === 'planning' || planStatus === 'idle' || planStatus === 'invalid';
  const runTitle =
    planStatus === 'invalid'
      ? 'Plan 不可行；请先在配置面板修复错误。'
      : planStatus === 'planning'
        ? '正在生成结构预览…'
        : running
          ? '仿真正在 Worker 中运行。'
          : planStatus === 'unknown'
            ? 'Plan 为 unknown；点击后需要显式选择降级方式。'
            : '冻结当前 Draft，运行离散事件仿真。';

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="brand" onClick={() => navigate('lab')} aria-label="返回工作台">
          <span className="brandmark">◈</span>
          <span className="brandtext">
            InferenceLab <span className="version">v1.1</span>
          </span>
        </button>
        <label className="scenario-picker">
          <span className="scenario-dot" aria-hidden="true" />
          <span className="sr-only">选择场景预设</span>
          <select
            value={presetValue}
            onChange={(event) => {
              if (event.target.value) loadPreset(event.target.value);
            }}
            data-testid="scenario-select"
          >
            {presetValue === '' && <option value="">自定义 · {scenario.title}</option>}
            {scenarioPresets.map((preset) => (
              <option key={preset.id} value={preset.scenario.id}>
                {preset.title}
              </option>
            ))}
          </select>
        </label>
        <nav className="top-nav" aria-label="一级功能">
          <button className={route === 'lab' ? 'active' : ''} onClick={() => navigate('lab')}>
            工作台
          </button>
          <button className={route === 'experiments' ? 'active' : ''} onClick={() => navigate('experiments')}>
            实验
          </button>
          <button className={route === 'reference' ? 'active' : ''} onClick={() => navigate('reference')}>
            参考
          </button>
        </nav>
        <div className="mode-switch" role="group" aria-label="工作模式">
          {MODES.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? 'active' : ''}
              disabled={item.disabled}
              title={item.title}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="header-right">
        <QualityBadge />
        <DraftBadge />
        <button
          className="icon-btn mobile-only"
          title="打开配置面板"
          aria-label="打开配置面板"
          onClick={() => toggleDrawer('config')}
        >
          ☰
        </button>
        <button
          className="icon-btn"
          title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? '◐' : '◑'}
        </button>
        <button
          className={`icon-btn ${reducedMotion ? 'active' : ''}`}
          title={reducedMotion ? '减少动效已开启：用颜色/数字瞬态替代移动粒子' : '开启减少动效'}
          aria-label="切换减少动效"
          aria-pressed={reducedMotion}
          onClick={() => setReducedMotion(!reducedMotion)}
        >
          ◔
        </button>
        <button className="icon-btn" title="重新打开 3 分钟引导" aria-label="帮助" onClick={resetOnboarding}>
          ?
        </button>
        <button
          className="run-btn"
          disabled={runDisabled}
          title={runTitle}
          onClick={() => {
            if (planStatus === 'unknown') setConsentOpen(true);
            else void runNow(false);
          }}
        >
          {running ? '运行中…' : '▶ 运行实验'}
        </button>
      </div>

      {consentOpen && (
        <div
          className="consent-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConsentOpen(false);
          }}
        >
          <div
            className="consent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unknown-consent-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConsentOpen(false);
            }}
          >
            <div className="eyebrow">PLAN · UNKNOWN</div>
            <h2 id="unknown-consent-title">当前 Plan 含未知数据</h2>
            <p>
              权重、KV 布局或框架能力中存在未验证项。请选择如何继续；系统不会把猜测当作已验证结果。
            </p>
            {unknownWarnings.length > 0 && (
              <ul className="consent-reasons">
                {unknownWarnings.map((warning) => (
                  <li key={`${warning.code}-${warning.path}`}>{warning.message}</li>
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
                仅结构查看
              </button>
              <button
                className="btn primary"
                disabled={!canRunSynthetic}
                title={
                  canRunSynthetic
                    ? '以场景中标注的合成参数运行；所有时间指标保持 SYNTHETIC。'
                    : '当前模板没有可计算的 KV Block，时间仿真无法启动。'
                }
                onClick={() => {
                  setConsentOpen(false);
                  void runNow(true);
                }}
              >
                使用已标注合成参数模拟
              </button>
              <button className="btn" onClick={() => setConsentOpen(false)}>
                取消
              </button>
            </div>
            {!canRunSynthetic && (
              <p className="caption consent-note">
                该模板缺少可用的 KV 布局，无法建立 KV Block 池；时间仿真会拒绝启动。请先查看结构或补充 Profile。
              </p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
