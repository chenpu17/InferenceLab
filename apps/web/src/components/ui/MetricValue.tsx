import type { ReactNode } from 'react';
import type { Metric } from '@inferencelab/core';
import { useI18n } from '../../i18n';
import { METRIC_UNIT_LABEL } from '../../lib/labels';
import {
  formatBytes,
  formatCount,
  formatUs,
  QUALITY_LABEL,
  QUALITY_TITLE,
  qualityClass,
} from '../../lib/format';

export interface MetricValueProps {
  metric: Metric;
  className?: string;
}

function displayValue(metric: Metric): string {
  if (metric.value === null) return 'N/A';
  if (metric.unit === 'µs') return formatUs(metric.value);
  if (metric.unit === 'bytes') return formatBytes(metric.value);
  if (metric.unit === 'tokens/s') return `${metric.value.toFixed(1)} tok/s`;
  if (metric.unit === 'req/s') return `${metric.value.toFixed(2)} req/s`;
  return formatCount(metric.value);
}

export function MetricValue({ metric, className }: MetricValueProps): ReactNode {
  const { t, lt } = useI18n();
  const observed = metric.group === 'observed';
  const qualityLabel = observed ? 'OBSERVED' : QUALITY_LABEL[metric.quality];
  const reason = metric.reason ?? QUALITY_TITLE[metric.quality];
  const detail = metric.reason !== undefined
    ? lt(metric.reason)
    : metric.value === null
      ? t('缺少可计算样本')
      : t(METRIC_UNIT_LABEL[metric.unit] ?? metric.unit);

  return (
    <div className={className ? `metric-value-view ${className}` : 'metric-value-view'}>
      <div className="metric-value-row">
        <span className="metric-value">{displayValue(metric)}</span>
        <span
          className={`quality-tag ${observed ? 'quality-observed' : qualityClass(metric.quality)}`}
          title={observed && metric.reason === undefined ? t('来自导入 Trace 的实测值，未被仿真器改写，也不参与成本模型拟合。') : lt(reason)}
        >
          {qualityLabel}
        </span>
      </div>
      <div className="metric-bottom">{detail}</div>
    </div>
  );
}
