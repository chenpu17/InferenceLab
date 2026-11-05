import { describe, expect, it } from 'vitest';
import { KvCacheManager } from '../src/cache/kvCache.js';

function manager(capacityBlocks = 4): KvCacheManager {
  return new KvCacheManager({
    engineId: 'engine-test',
    poolId: 'pool-test',
    capacityBlocks,
    blockSize: 4,
    bytesPerBlock: 64,
  });
}

describe('KV cache invariants', () => {
  it('accepts a normal allocate / complete / release lifecycle', () => {
    const kv = manager();
    expect(kv.assertInvariants()).toEqual([]);

    const allocation = kv.allocateFor('request-a', 2, 0, (index) => `hash-${index}`, () => null);
    expect(allocation.ok).toBe(true);
    kv.completeFullBlocks('request-a', 8, ['hash-0', 'hash-1'], 0);
    expect(kv.assertInvariants()).toEqual([]);

    kv.releaseRequest('request-a', 10, true);
    expect(kv.assertInvariants()).toEqual([]);
  });

  it('keeps a duplicate hash mapping alive when one concurrent block is freed', () => {
    const kv = manager(2);
    kv.allocateFor('request-a', 1, 0, () => 'shared-hash', () => null);
    kv.completeFullBlocks('request-a', 4, ['shared-hash'], 0);
    kv.allocateFor('request-b', 1, 1, () => 'shared-hash', () => null);
    kv.completeFullBlocks('request-b', 4, ['shared-hash'], 1);

    // Both blocks carry the same prefix hash. Freeing the newer duplicate must
    // not delete the older block's hash mapping.
    kv.releaseRequest('request-b', 2, false);
    expect(kv.assertInvariants()).toEqual([]);
    expect(kv.peekPrefix(['shared-hash']).hitTokens).toBe(4);

    kv.releaseRequest('request-a', 3, false);
    expect(kv.assertInvariants()).toEqual([]);
    expect(kv.peekPrefix(['shared-hash']).hitTokens).toBe(0);
  });

  it('reports a duplicated free-list entry', () => {
    const kv = manager();
    const internal = kv as unknown as { freeList: number[] };
    internal.freeList.push(internal.freeList[0]!);
    const problems = kv.assertInvariants();
    expect(problems.some((problem) => problem.includes('duplicate'))).toBe(true);
  });
});
