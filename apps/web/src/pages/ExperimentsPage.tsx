import { useMemo, useState, type ReactNode } from 'react';
import type { Metric, SimulationResult } from '@inferencelab/core';
import { useLabStore, currentParallelismLabel, type ExperimentRecord } from '../store/useLabStore';
import { formatBytes, formatCount, formatUs, QUALITY_LABEL, qualityClass } from '../lib/format';
import { hardwareFor, modelFor } from '../lib/scenario';
import { useI18n } from '../i18n';

function metricOf(result: SimulationResult, key: string): Metric | undefined {
  return result.metrics.find((metric) => metric.key === key);
}

function valueOf(result: SimulationResult, key: string, format: (value: number) => string): string {
  const metric = metricOf(result, key);
  if (!metric || metric.value === null) return 'N/A';
  return format(metric.value);
}

function RunCard({
  record,
  slot,
  onSetSlot,
}: {
  record: ExperimentRecord;
  slot: 'A' | 'B' | null;
  onSetSlot: (slot: 'A' | 'B' | null) => void;
}): ReactNode {
  const { t, lt, locale } = useI18n();
  const selectRun = useLabStore((state) => state.selectRun);
  const navigate = useLabStore((state) => state.navigate);
  const scenario = record.scenario;
  const hardware = hardwareFor(scenario);
  const model = modelFor(scenario);
  const result = record.result;
  const finished = metricOf(result, 'requests.finished')?.value ?? 0;
  const total = metricOf(result, 'requests.total')?.value ?? 0;
  const preemptions = metricOf(result, 'scheduler.preemptions')?.value ?? 0;
  // Trace observations are measured values, but the run's stage timings remain
  // simulated. Do not label the whole run MEASURED because of an observed row.
  const calibrated = result.metrics.some(
    (metric) => metric.quality === 'calibrated' && metric.group !== 'observed',
  );
  const ttft = metricOf(result, 'ttft.p50');

  return (
    <article className="run-card">
      <div className="run-card-head">
        <div>
          <div className="eyebrow">
            {t('运行 · {time}', {
              time: new Date(record.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false }),
            })}
          </div>
          <h3>{lt(scenario.title)}</h3>
          <p className="caption">
            {hardware?.id ?? scenario.hardwareProfileId} · {model?.id ?? scenario.modelProfileId} ·{' '}
            {currentParallelismLabel(scenario)}
          </p>
        </div>
        <span className={`quality-pill quality-${calibrated ? 'measured' : 'synthetic'}`}>
          ◆ {calibrated ? 'MEASURED' : 'SYNTHETIC'}
        </span>
      </div>

      <div className="run-metrics">
        <div>
          <span>{t('完成 / 总数')}</span>
          <b className="mono">{formatCount(finished)} / {formatCount(total)}</b>
        </div>
        <div>
          <span>TTFT P50</span>
          <b className="mono">{valueOf(result, 'ttft.p50', formatUs)}</b>
          {ttft && <i className={`quality-tag ${qualityClass(ttft.quality)}`}>{QUALITY_LABEL[ttft.quality]}</i>}
        </div>
        <div>
          <span>TPOT P50</span>
          <b className="mono">{valueOf(result, 'tpot.p50', formatUs)}</b>
        </div>
        <div>
          <span>{t('输出吞吐')}</span>
          <b className="mono">{valueOf(result, 'throughput.outputTokensPerSec', (value) => `${value.toFixed(1)} tok/s`)}</b>
        </div>
        <div>
          <span>{t('KV 峰值')}</span>
          <b className="mono">{valueOf(result, 'kv.peakBytes', formatBytes)}</b>
        </div>
        <div>
          <span>{t('抢占 / 事件')}</span>
          <b className="mono">{formatCount(preemptions)} / {formatCount(result.events.length)}</b>
        </div>
      </div>

      <div className="run-card-foot">
        <span className="caption mono">
          {t('修订 {revision} · {time} 虚拟', {
            revision: record.revision,
            time: formatUs(result.endedAtUs),
          })}
        </span>
        <div className="related-buttons">
          <button
            className={`btn small ${slot === 'A' ? 'primary' : ''}`}
            onClick={() => onSetSlot(slot === 'A' ? null : 'A')}
            title={t('将本次 Run 设为 A/B 对比的 A 侧')}
          >
            {slot === 'A' ? t('✓ A 侧') : t('设为 A')}
          </button>
          <button
            className={`btn small ${slot === 'B' ? 'primary' : ''}`}
            onClick={() => onSetSlot(slot === 'B' ? null : 'B')}
            title={t('将本次 Run 设为 A/B 对比的 B 侧')}
          >
            {slot === 'B' ? t('✓ B 侧') : t('设为 B')}
          </button>
          <button
            className="btn small"
            onClick={() => {
              selectRun(record.id);
              navigate('lab');
            }}
          >
            {t('打开回放 →')}
          </button>
        </div>
      </div>
    </article>
  );
}

const COMPARE_ROWS: Array<{ key: string; label: string; format: (value: number) => string }> = [
  { key: 'requests.finished', label: '完成请求数', format: (value) => formatCount(value) },
  { key: 'ttft.p50', label: 'TTFT P50', format: formatUs },
  { key: 'ttft.p95', label: 'TTFT P95', format: formatUs },
  { key: 'tpot.p50', label: 'TPOT P50', format: formatUs },
  { key: 'throughput.outputTokensPerSec', label: '输出吞吐', format: (value) => `${value.toFixed(1)} tok/s` },
  { key: 'kv.peakBytes', label: 'KV 峰值', format: formatBytes },
  { key: 'transfer.bytes', label: 'KV 传输字节', format: formatBytes },
  { key: 'transfer.count', label: 'KV 传输次数', format: formatCount },
  { key: 'scheduler.preemptions', label: '抢占次数', format: formatCount },
];

function ComparePanel({ a, b }: { a: ExperimentRecord; b: ExperimentRecord }): ReactNode {
  const { t, lt } = useI18n();
  const selectRun = useLabStore((state) => state.selectRun);
  const navigate = useLabStore((state) => state.navigate);

  const notes = useMemo(() => {
    const list: string[] = [];
    if (JSON.stringify(a.scenario.workload) !== JSON.stringify(b.scenario.workload)) {
      list.push(t('Workload 不同：负载差异会与机制差异混杂，不能直接归因。'));
    }
    if (a.scenario.seed !== b.scenario.seed) {
      list.push(t('Seed 不同（{a} vs {b}）：随机到达顺序不同。', { a: a.scenario.seed, b: b.scenario.seed }));
    }
    if (a.scenario.hardwareProfileId !== b.scenario.hardwareProfileId) {
      list.push(t('硬件 Profile 不同：绝对延迟与容量不可直接比较。'));
    }
    if (a.scenario.modelProfileId !== b.scenario.modelProfileId) {
      list.push(t('模型 Profile 不同：权重与 KV 形状不同。'));
    }
    if (a.scenario.frameworkProfileId !== b.scenario.frameworkProfileId) {
      list.push(t('框架适配器不同：参数语义与能力矩阵不同。'));
    }
    return list;
  }, [a, b, t]);

  const incomparable =
    JSON.stringify(a.scenario.workload) !== JSON.stringify(b.scenario.workload) || a.scenario.seed !== b.scenario.seed;
  const comparable = notes.length === 0;
  const badge = comparable ? t('可比') : incomparable ? t('不可比') : t('部分可比');
  const badgeClass = comparable ? 'quality-exact' : incomparable ? 'quality-unavailable' : 'quality-assumption';

  return (
    <section className="compare-panel" aria-label={t('A/B 对比')}>
      <div className="compare-head">
        <div>
          <div className="eyebrow">{t('A/B 拆分 · 冻结 Run')}</div>
          <h2>{t('并排对比')}</h2>
          <p className="caption">
            {t('A 与 B 各自来自独立冻结的 ExperimentResult；对比只读取事件与指标，不重新仿真。')}
          </p>
        </div>
        <span className={`quality-tag ${badgeClass}`}>{badge}</span>
      </div>

      <div className="compare-runs">
        {([['A', a], ['B', b]] as const).map(([slot, record]) => (
          <div key={slot} className="compare-run">
            <div className="compare-run-head">
              <span className="compare-slot">{slot}</span>
              <div>
                <b>{lt(record.scenario.title)}</b>
                <p className="caption mono">
                  {record.scenario.hardwareProfileId} · {currentParallelismLabel(record.scenario)} ·{' '}
                  {t('Seed {seed}', { seed: record.scenario.seed })}
                </p>
              </div>
            </div>
            <div className="compare-run-meta">
              <span>{t('{count} 个事件', { count: record.result.events.length })}</span>
              <span>{t('{time} 虚拟', { time: formatUs(record.result.endedAtUs) })}</span>
              <span>{record.result.metrics.some((metric) => metric.quality === 'calibrated') ? 'MEASURED' : 'SYNTHETIC'}</span>
            </div>
            <button
              className="text-link"
              onClick={() => {
                selectRun(record.id);
                navigate('lab');
              }}
            >
              {t('打开 {slot} 回放 →', { slot })}
            </button>
          </div>
        ))}
      </div>

      {notes.length > 0 && (
        <div className="compare-notes">
          <b>{t('不可比字段 / 归因限制')}</b>
          {notes.map((note) => (
            <p key={note}>· {note}</p>
          ))}
        </div>
      )}

      <table className="compare-table">
        <thead>
          <tr>
            <th>{t('指标')}</th>
            <th>A</th>
            <th>B</th>
            <th>Δ (B − A)</th>
            <th>{t('来源')}</th>
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => {
            const metricA = metricOf(a.result, row.key);
            const metricB = metricOf(b.result, row.key);
            const valueA = metricA?.value ?? null;
            const valueB = metricB?.value ?? null;
            const quality = metricB?.quality ?? metricA?.quality;
            let delta = 'N/A';
            if (valueA !== null && valueB !== null) {
              const absolute = valueB - valueA;
              const percent = valueA !== 0 ? (absolute / valueA) * 100 : null;
              delta = `${absolute >= 0 ? '+' : '−'}${row.format(Math.abs(absolute))}${
                percent !== null ? ` (${percent >= 0 ? '+' : '−'}${Math.abs(percent).toFixed(1)}%)` : ''
              }`;
            }
            return (
              <tr key={row.key}>
                <td>{t(row.label)}</td>
                <td className="mono">{valueA === null ? 'N/A' : row.format(valueA)}</td>
                <td className="mono">{valueB === null ? 'N/A' : row.format(valueB)}</td>
                <td className="mono">{delta}</td>
                <td>{quality ? <span className={`quality-tag ${qualityClass(quality)}`}>{QUALITY_LABEL[quality]}</span> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="caption">
        {t('Δ 仅描述两次冻结结果之间的差异；Synthetic/Assumption 指标不能作为真实硬件性能结论。')}
      </p>
    </section>
  );
}

export function ExperimentsPage(): ReactNode {
  const { t } = useI18n();
  const runHistory = useLabStore((state) => state.runHistory);
  const navigate = useLabStore((state) => state.navigate);
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const recordA = runHistory.find((record) => record.id === slotA) ?? null;
  const recordB = runHistory.find((record) => record.id === slotB) ?? null;

  const exportRuns = () => {
    const payload = runHistory.map((record) => ({
      id: record.id,
      label: record.label,
      createdAt: record.createdAt,
      scenario: record.scenario,
      metrics: record.result.metrics,
      endedAtUs: record.result.endedAtUs,
      eventCount: record.result.events.length,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `inferencelab-runs-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page-shell experiments-page">
      <div className="page-head page-masthead">
        <div>
          <div className="eyebrow">{t('实验')} · RUN ARCHIVE</div>
          <h1>{t('实验记录')}</h1>
          <p>
            {t(
              '每次 Run 都会冻结 Scenario、Plan 与完整事件日志。切换记录只重建回放，不重新仿真； 因此同一个 Run 的结果可重复。',
            )}
          </p>
        </div>
        <div className="page-actions">
          <span className="page-sequence mono" aria-label={t('已记录 Run 数量')}>
            EXP / {String(runHistory.length).padStart(2, '0')}
          </span>
          <button className="btn" onClick={() => navigate('lab')}>{t('← 回到工作台')}</button>
          <button className="btn" disabled={runHistory.length === 0} onClick={exportRuns}>{t('↧ 导出记录 JSON')}</button>
        </div>
      </div>

      {runHistory.length === 0 ? (
        <div className="page-empty">
          <h2>{t('还没有 Run')}</h2>
          <p>
            {t(
              '结构预览不会产生指标。回到工作台选择一个预设（例如 `toy-32gpu-tp16-dp2`）， 点击 Header 的“运行实验”，事件日志和指标会出现在这里。',
            )}
          </p>
          <button className="btn primary" onClick={() => navigate('lab')}>{t('打开工作台')}</button>
        </div>
      ) : (
        <>
          <div className="run-list">
            {runHistory.map((record) => (
              <RunCard
                key={record.id}
                record={record}
                slot={record.id === slotA ? 'A' : record.id === slotB ? 'B' : null}
                onSetSlot={(slot) => {
                  if (slot === 'A') {
                    setSlotA(record.id);
                    if (slotB === record.id) setSlotB(null);
                  } else if (slot === 'B') {
                    setSlotB(record.id);
                    if (slotA === record.id) setSlotA(null);
                  } else if (record.id === slotA) {
                    setSlotA(null);
                  } else if (record.id === slotB) {
                    setSlotB(null);
                  }
                }}
              />
            ))}
          </div>
          {recordA && recordB && <ComparePanel a={recordA} b={recordB} />}
          {(!recordA || !recordB) && (
            <p className="caption page-note">
              {t('A/B 对比：在任意两条 Run 上点击“设为 A”与“设为 B”，即可并排比较指标与不可比字段。')}
            </p>
          )}
          <p className="caption page-note">
            {t(
              '记录仅保存在当前浏览器会话中，刷新页面后清空；如需长期保存请导出 JSON。 所有 TTFT / TPOT / 吞吐都来自标注过的合成成本模型，不是真实硬件实测。',
            )}
          </p>
        </>
      )}
    </main>
  );
}
