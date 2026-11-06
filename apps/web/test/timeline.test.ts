import { describe, expect, it } from 'vitest';
import { buildTimelineTicks } from '../src/lib/timeline';

describe('buildTimelineTicks', () => {
  it('uses readable steps and includes both endpoints', () => {
    expect(buildTimelineTicks(1000)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(buildTimelineTicks(1234)).toEqual([0, 250, 500, 750, 1000, 1234]);
    expect(buildTimelineTicks(106_713)).toEqual([0, 25_000, 50_000, 75_000, 106_713]);
    expect(buildTimelineTicks(6)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns five to seven increasing ticks for varied durations', () => {
    for (const totalUs of [1, 2, 3, 4, 6, 7, 14, 16, 99, 1234, 99_999]) {
      const ticks = buildTimelineTicks(totalUs);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(7);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBe(totalUs);
      expect(ticks.every((tick, index) => index === 0 || tick > ticks[index - 1]!)).toBe(true);
    }
  });

  it('handles an empty duration without invalid values', () => {
    expect(buildTimelineTicks(0)).toEqual([0]);
    expect(buildTimelineTicks(Number.NaN)).toEqual([0]);
  });
});
