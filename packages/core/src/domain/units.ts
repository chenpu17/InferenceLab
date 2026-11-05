export const KIB = 1024;
export const MIB = 1024 * 1024;
export const GIB = 1024 * 1024 * 1024;
export const TIB = 1024 * GIB;

export const KB = 1000;
export const MB = 1000 * 1000;
export const GB = 1000 * 1000 * 1000;
export const TB = 1000 * GB;

export const US_PER_MS = 1000;
export const US_PER_S = 1_000_000;

export function ceilDiv(value: number, divisor: number): number {
  if (divisor <= 0) throw new Error('ceilDiv divisor must be > 0');
  return Math.ceil(value / divisor);
}

export function alignUp(value: number, alignment: number): number {
  if (alignment <= 1) return value;
  return ceilDiv(value, alignment) * alignment;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function bitsPerSecondToBytesPerSecond(bits: number): number {
  return bits / 8;
}

export function bytesToBits(bytes: number): number {
  return bytes * 8;
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

export function safeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isSafeInteger(Math.round(value))) return Number.MAX_SAFE_INTEGER;
  return value;
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;

export function formatBytes(bytes: number | null | undefined, digits = 2): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'N/A';
  if (bytes < 0) return `-${formatBytes(-bytes, digits)}`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = unit === 0 ? Math.round(value).toString() : value.toFixed(digits);
  return `${shown} ${BYTE_UNITS[unit]}`;
}

export function formatBytesShort(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return 'N/A';
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)}G`;
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(1)}M`;
  if (bytes >= KIB) return `${(bytes / KIB).toFixed(1)}K`;
  return `${Math.round(bytes)}B`;
}

export function formatBitsPerSecond(bits: number | null | undefined, digits = 1): string {
  if (bits === null || bits === undefined || !Number.isFinite(bits)) return 'N/A';
  if (bits >= 1e12) return `${(bits / 1e12).toFixed(digits)} Tbps`;
  if (bits >= 1e9) return `${(bits / 1e9).toFixed(digits)} Gbps`;
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(digits)} Mbps`;
  if (bits >= 1e3) return `${(bits / 1e3).toFixed(digits)} Kbps`;
  return `${bits.toFixed(0)} bps`;
}

export function formatBytesPerSecond(bps: number | null | undefined, digits = 1): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return 'N/A';
  return `${formatBytes(bps, digits)}/s`;
}

export function formatMicroseconds(us: number | null | undefined, digits = 2): string {
  if (us === null || us === undefined || !Number.isFinite(us)) return 'N/A';
  if (us < 1000) return `${us.toFixed(us < 10 ? digits : 0)} µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(digits)} ms`;
  return `${(us / 1_000_000).toFixed(digits)} s`;
}

export function formatUsShort(us: number): string {
  if (us < 1000) return `${Math.round(us)}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)}%`;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  if (lo === hi) return a;
  return a + (b - a) * (rank - lo);
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
