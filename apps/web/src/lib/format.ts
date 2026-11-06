import type { MetricQuality } from '@inferencelab/core';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  if (value === 0) return '0 B';
  const sign = value < 0 ? '-' : '';
  let scaled = Math.abs(value);
  let unit = 0;
  while (scaled >= 1000 && unit < BYTE_UNITS.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  const precision = scaled >= 100 || unit === 0 ? 0 : digits;
  return `${sign}${scaled.toFixed(precision)} ${BYTE_UNITS[unit]}`;
}

export function formatUs(us: number | null | undefined): string {
  if (us === null || us === undefined || !Number.isFinite(us)) return 'N/A';
  if (us < 1) return `${us.toFixed(2)} µs`;
  if (us < 1_000) return `${us.toFixed(us < 10 ? 2 : 1)} µs`;
  if (us < 1_000_000) return `${(us / 1_000).toFixed(us < 10_000 ? 2 : 1)} ms`;
  return `${(us / 1_000_000).toFixed(2)} s`;
}

const COUNT_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return COUNT_FORMAT.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRate(value: number | null | undefined, unit = '/s', digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)} ${unit}`;
}

export function formatGbps(bitsPerSecond: number | null | undefined): string {
  if (bitsPerSecond === null || bitsPerSecond === undefined || !Number.isFinite(bitsPerSecond)) return 'N/A';
  if (bitsPerSecond >= 1e12) return `${(bitsPerSecond / 1e12).toFixed(2)} Tbps`;
  if (bitsPerSecond >= 1e9) return `${(bitsPerSecond / 1e9).toFixed(1)} Gbps`;
  if (bitsPerSecond >= 1e6) return `${(bitsPerSecond / 1e6).toFixed(1)} Mbps`;
  return `${bitsPerSecond.toFixed(0)} bps`;
}

export function formatClock(us: number): string {
  if (us < 1_000) return `T + ${us.toFixed(0)} µs`;
  if (us < 1_000_000) return `T + ${(us / 1_000).toFixed(3)} ms`;
  return `T + ${(us / 1_000_000).toFixed(3)} s`;
}

export const QUALITY_LABEL: Record<MetricQuality, string> = {
  exact: 'EXACT',
  calibrated: 'CALIBRATED',
  assumption: 'SYNTHETIC',
  unavailable: 'N/A',
};

export const QUALITY_TITLE: Record<MetricQuality, string> = {
  exact: '来自显式配置或事件计数，可精确复现。',
  calibrated: '来自已测量/校准的 Profile。',
  assumption: '由标注过的合成成本模型推导，不代表真实性能。',
  unavailable: '缺少数据，UI 不展示猜测值。',
};

export function qualityClass(quality: MetricQuality): string {
  switch (quality) {
    case 'exact':
      return 'quality-exact';
    case 'calibrated':
      return 'quality-calibrated';
    case 'assumption':
      return 'quality-assumption';
    default:
      return 'quality-unavailable';
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percentOf(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return clamp(part / whole, 0, 1);
}

export function shortHash(hash: string | null): string {
  if (!hash) return '—';
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function shortId(id: string): string {
  return id.length <= 18 ? id : `${id.slice(0, 10)}…${id.slice(-4)}`;
}

export function titleCase(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}
