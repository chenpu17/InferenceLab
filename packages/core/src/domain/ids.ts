/**
 * Deterministic, monotonic IDs. IDs are stable across replays; array indexes
 * are never used as persistent identity.
 */

export class IdFactory {
  private counters = new Map<string, number>();

  next(prefix: string): string {
    const current = this.counters.get(prefix) ?? 0;
    this.counters.set(prefix, current + 1);
    return `${prefix}-${current.toString(36)}`;
  }

  reset(): void {
    this.counters.clear();
  }
}
