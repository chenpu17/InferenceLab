import type { ReactNode } from 'react';
import type { Metric, MetricSeries } from '@inferencelab/core';
import { useLabStore } from '../../store/useLabStore';
import {
  formatBytes,
  formatCount,
  formatUs,
  percentOf,
  QUALITY_LABEL,
  QUALITY_TITLE,
  qualityClass,
} from '../../lib/format';
import { useI18n } from '../../i18n';

const PRIMARY_METRICS = [
  'requests.finished',
  'ttft.p50',
  'ttft.p95',
  'tpot.p50',
  'queue.wait.p50',
  'kv.peakBytes',
  'throughput.outputTokensPerSec',
  'scheduler.preemptions',
];

const UNIT_LABEL: Record<string, string> = {
  requests: '请求数',
  blocks: 'Block',
  bytes: '字节',
  tokens: 'Token',
  steps: '步',
  events: '事件数',
  routings: '路由次数',
  x: '×',
};

const EVIDENCE_KIND_LABEL: Record<string, string> = {
  derived: '推导',
  measured: '实测',
  estimated: '估算',
  assumed: '假定',
  unknown: '未知',
};

const OBSERVED_METRIC_LABEL: Record<string, string> = {
  'Observed TTFT P50': '实测 TTFT P50',
  'Observed TPOT P50': '实测 TPOT P50',
};

function metricDisplay(metric: Metric): string {
  if (metric.value === null) return 'N/A';
  if (metric.unit === 'µs') return formatUs(metric.value);
  if (metric.unit === 'bytes') return formatBytes(metric.value);
  if (metric.unit === 'tokens/s') return `${metric.value.toFixed(1)} tok/s`;
  if (metric.unit === 'req/s') return `${metric.value.toFixed(2)} req/s`;
  return formatCount(metric.value);
}

function MetricCard({
  metric,
  selected,
  onSelect,
}: {
  metric: Metric;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  const { t, lt } = useI18n();
  const observed = metric.group === 'observed';
  const label = observed ? 'OBSERVED' : QUALITY_LABEL[metric.quality];
  const title = observed
    ? t('来自导入 Trace 的实测值，未被仿真器改写，也不参与成本模型拟合。')
    : lt(metric.reason ?? QUALITY_TITLE[metric.quality]);
  const metricLabel = observed
    ? t(OBSERVED_METRIC_LABEL[metric.label] ?? metric.label)
    : lt(metric.label);
  return (
    <button
      className={`metric-card ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      title={title}
    >
      <div className="metric-head">
        <span>{metricLabel}</span>
        <span
          className={`quality-tag ${observed ? 'quality-observed' : qualityClass(metric.quality)}`}
          title={title}
        >
          {label}
        </span>
      </div>
      <div className="metric-value">{metricDisplay(metric)}</div>
      <div className="metric-bottom">
        {metric.reason !== undefined
          ? lt(metric.reason)
          : metric.value === null
            ? t('缺少可计算样本')
            : t(UNIT_LABEL[metric.unit] ?? metric.unit)}
      </div>
    </button>
  );
}

function Sparkline({ series, color, label }: { series: MetricSeries; color: string; label: string }): ReactNode {
  const { t } = useI18n();
  if (series.points.length < 2) {
    return <div className="spark-empty">N/A</div>;
  }
  const values = series.points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1e-9, max - min);
  const width = 180;
  const height = 34;
  const path = series.points
    .map((point, index) => {
      const x = (index / (series.points.length - 1)) * width;
      const y = height - ((point.value - min) / range) * (height - 4) - 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('{label} 趋势', { label })}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export function MetricsLens(): ReactNode {
  const { t, lt } = useI18n();
  const activeRun = useLabStore((state) => state.activeRun);
  const selectedEntity = useLabStore((state) => state.selectedEntity);
  const selectEntity = useLabStore((state) => state.selectEntity);

  if (!activeRun) {
    return (
      <div className="lens-empty">
        <h3>{t('尚无 Run 指标')}</h3>
        <p>{t('结构预览只显示容量与放置；TTFT / TPOT / 吞吐必须由冻结的事件日志计算。点击 Header 的“运行实验”。')}</p>
      </div>
    );
  }

  const metrics = activeRun.metrics;
  const primary = PRIMARY_METRICS.map((key) => metrics.find((metric) => metric.key === key)).filter(
    (metric): metric is Metric => Boolean(metric),
  );
  // Observed values come straight from an imported trace. They are kept in a
  // separate strip so an aggregate measured number can never be mistaken for a
  // simulated result.
  const observed = metrics.filter((metric) => metric.group === 'observed');
  const selectedMetricId = selectedEntity?.kind === 'metric' ? selectedEntity.id : null;
  const maxTime = Math.max(1, activeRun.endedAtUs);
  const seriesQueue = activeRun.series.find((series) => series.key === 'queue.waiting');
  const seriesKv = activeRun.series.find((series) => series.key === 'kv.usedBytes');
  const seriesBudget = activeRun.series.find((series) => series.key === 'scheduler.budgetUsed');

  return (
    <div className="metrics-lens">
      <div className="metric-grid">
        {primary.map((metric) => (
          <MetricCard
            key={metric.key}
            metric={metric}
            selected={selectedMetricId === metric.key}
            onSelect={() => selectEntity({ kind: 'metric', id: metric.key })}
          />
        ))}
      </div>

      {observed.length > 0 && (
        <section className="observed-strip" aria-label={t('实测观测指标')}>
          <div className="subhead">{t('OBSERVED · 来自导入 Trace，不参与仿真')}</div>
          <div className="metric-grid observed-grid">
            {observed.map((metric) => (
              <MetricCard
                key={metric.key}
                metric={metric}
                selected={selectedMetricId === metric.key}
                onSelect={() => selectEntity({ kind: 'metric', id: metric.key })}
              />
            ))}
          </div>
        </section>
      )}

      <div className="metrics-lower">
        <div className="waterfall-card">
          <div className="subhead">{t('请求关键路径 · 到达 → 首 Token → 完成')}</div>
          <div className="waterfall">
            {activeRun.requests.slice(0, 24).map((request) => {
              const arrival = percentOf(request.arrivalUs, maxTime) * 100;
              const first = request.firstTokenUs === null ? null : percentOf(request.firstTokenUs, maxTime) * 100;
              const finish = request.finishUs === null ? null : percentOf(request.finishUs, maxTime) * 100;
              const selected = selectedEntity?.kind === 'request' && selectedEntity.id === request.id;
              return (
                <button
                  key={request.id}
                  className={`waterfall-row ${selected ? 'selected' : ''}`}
                  onClick={() => selectEntity({ kind: 'request', id: request.id })}
                  title={`${request.id} · TTFT ${formatUs(request.ttftUs)} · TPOT ${formatUs(request.tpotUs)}`}
                >
                  <span className="waterfall-label mono">{request.id}</span>
                  <span className="waterfall-track">
                    <span className="wf-wait" style={{ left: `${arrival}%`, width: `${Math.max(0, (first ?? arrival) - arrival)}%` }} />
                    <span className="wf-prefill" style={{ left: `${first ?? arrival}%`, width: `${Math.max(0, (finish ?? first ?? arrival) - (first ?? arrival))}%` }} />
                    {request.preemptions > 0 && <span className="wf-preempt" title={t('{count} 次抢占', { count: request.preemptions })} />}
                  </span>
                  <span className="waterfall-time mono">{formatUs(request.ttftUs)}</span>
                </button>
              );
            })}
          </div>
          <div className="waterfall-legend">
            <span><i className="wf-wait" /> {t('排队 / 等待')}</span>
            <span><i className="wf-prefill" /> {t('Prefill + Decode')}</span>
            <span>{t('灰色区间为未完成或缺失数据')}</span>
          </div>
        </div>

        <div className="series-card">
          <div className="subhead">{t('序列 · 事件采样')}</div>
          {seriesQueue && (
            <div className="series-row">
              <div>
                <span>{t('等待请求')}</span>
                <b className="mono">{seriesQueue.points[seriesQueue.points.length - 1]?.value ?? 0}</b>
              </div>
              <Sparkline series={seriesQueue} color="var(--wait)" label={t('等待请求')} />
            </div>
          )}
          {seriesKv && (
            <div className="series-row">
              <div>
                <span>{t('KV 已用')}</span>
                <b className="mono">{formatBytes(seriesKv.points[seriesKv.points.length - 1]?.value ?? 0)}</b>
              </div>
              <Sparkline series={seriesKv} color="var(--kv)" label={t('KV 已用')} />
            </div>
          )}
          {seriesBudget && (
            <div className="series-row">
              <div>
                <span>{t('预算已用')}</span>
                <b className="mono">{formatCount(seriesBudget.points[seriesBudget.points.length - 1]?.value ?? 0)}</b>
              </div>
              <Sparkline series={seriesBudget} color="var(--compute)" label={t('预算已用')} />
            </div>
          )}
          <p className="helper">{t('序列按事件采样并降采样；不能替代逐事件日志。')}</p>
        </div>
      </div>

      <div className="evidence-card">
        <div className="subhead">{t('证据与限制')}</div>
        <div className="evidence-grid">
          <div>
            <h4>{t('假设')}</h4>
            {activeRun.assumptionsUsed.map((evidence, index) => (
              <p key={index} className="evidence-line">
                <span className="quality-tag quality-assumption">{t(EVIDENCE_KIND_LABEL[evidence.kind] ?? evidence.kind)}</span> {lt(evidence.note)}
              </p>
            ))}
            {activeRun.assumptionsUsed.length === 0 && <p className="evidence-line">{t('无显式假设记录。')}</p>}
          </div>
          <div>
            <h4>{t('限制')}</h4>
            {activeRun.limitations.map((limitation, index) => (
              <p key={index} className="evidence-line">• {lt(limitation)}</p>
            ))}
            {activeRun.limitations.length === 0 && <p className="evidence-line">{t('无额外限制。')}</p>}
          </div>
        </div>
        <p className="caption">
          {t('每个指标卡片都显示质量等级；`SYNTHETIC` 不代表真实硬件性能，`N/A` 表示缺少可计算样本。')}
        </p>
      </div>
    </div>
  );
}
