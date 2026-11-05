import { describe, expect, it } from 'vitest';
import {
  StablePriorityQueue,
  SeededRandom,
  alignUp,
  blockContentFingerprint,
  chainHash,
  ceilDiv,
  formatBytes,
  percentile,
  validateScenarioStructure,
} from '../src/index.js';
import { testFramework, testHardware, testModel, testScenario } from './fixtures.js';

describe('units', () => {
  it('aligns and divides safely', () => {
    expect(ceilDiv(9, 4)).toBe(3);
    expect(alignUp(9, 4)).toBe(12);
    expect(alignUp(8, 4)).toBe(8);
    expect(() => ceilDiv(1, 0)).toThrow();
  });

  it('formats bytes and percentiles', () => {
    expect(formatBytes(1024)).toBe('1.00 KiB');
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('hashing', () => {
  it('chains deterministically and detects content changes', () => {
    const a = blockContentFingerprint('req-a', 0, 0, 16);
    const b = blockContentFingerprint('req-b', 0, 0, 16);
    expect(a).not.toBe(b);
    const h1 = chainHash(null, a);
    const h2 = chainHash(null, a);
    expect(h1).toBe(h2);
    expect(chainHash(h1, b)).not.toBe(h1);
  });
});

describe('stable priority queue', () => {
  it('orders by time, priority, then insertion sequence', () => {
    const q = new StablePriorityQueue<string>();
    q.push('late', 10, 0);
    q.push('second', 5, 1);
    q.push('first', 5, 0);
    q.push('same', 5, 0);
    expect(q.pop()?.value).toBe('first');
    expect(q.pop()?.value).toBe('same');
    expect(q.pop()?.value).toBe('second');
    expect(q.pop()?.value).toBe('late');
  });
});

describe('seeded PRNG', () => {
  it('produces the same stream for the same seed', () => {
    const a = new SeededRandom(123);
    const b = new SeededRandom(123);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
    const c = new SeededRandom(124);
    expect(c.next()).not.toBe(seqA[0]);
  });
});

describe('scenario validation', () => {
  it('accepts a structurally valid scenario', () => {
    const scenario = testScenario({ kind: 'fixed', count: 2, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const result = validateScenarioStructure(scenario);
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown runtime field', () => {
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const broken = { ...scenario, runtime: { ...scenario.runtime, magic: true } };
    const result = validateScenarioStructure(broken);
    expect(result.ok).toBe(false);
  });

  it('accepts trace requests with explicit observed metrics', () => {
    const scenario = testScenario({
      kind: 'trace',
      requests: [
        {
          id: 'r0',
          atUs: 0,
          promptTokens: 8,
          outputTokens: 2,
          prefixBlocks: [{ hash: 'prefix-a', tokenCount: 16 }],
          observed: { ttftUs: 1200, tpotUs: 40, source: 'benchmark' },
        },
      ],
    });
    const result = validateScenarioStructure(scenario);
    expect(result.ok).toBe(true);
  });

  it('accepts the semantic fixture with matching profiles', () => {
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    expect(scenario.hardwareProfileId).toBe(testHardware().id);
    expect(scenario.modelProfileId).toBe(testModel().id);
    expect(scenario.frameworkProfileId).toBe(testFramework().id);
  });
});
