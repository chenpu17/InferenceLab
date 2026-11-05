/**
 * Seeded PRNG (mulberry32). Simulation code must never call Math.random().
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  nextUint32(): number {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Exponential inter-arrival time for a Poisson process. */
  exponential(mean: number): number {
    const u = Math.max(this.next(), 1e-12);
    return -Math.log(u) * mean;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error('cannot pick from empty array');
    return values[Math.floor(this.next() * values.length)]!;
  }
}
