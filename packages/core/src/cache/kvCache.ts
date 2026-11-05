import type { Bytes, ID, KvBlockView, Microseconds } from '../domain/types.js';

export interface KvCacheConfig {
  engineId: ID;
  poolId: ID;
  capacityBlocks: number;
  blockSize: number;
  bytesPerBlock: Bytes;
}

export type KvBlockState = KvBlockView['state'];

export interface KvBlock {
  id: ID;
  index: number;
  engineId: ID;
  poolId: ID;
  blockSize: number;
  bytes: Bytes;
  state: KvBlockState;
  location: 'HBM' | 'DRAM' | 'SSD';
  refCount: number;
  requestId: ID | null;
  hash: string | null;
  parentHash: string | null;
  lastUsedUs: Microseconds;
  generation: number;
  /** Number of prompt tokens covered when this block is full. */
  full: boolean;
}

export type KvMutationType =
  | 'KV_ALLOCATED'
  | 'KV_FREED'
  | 'BLOCK_CACHED'
  | 'BLOCK_EVICTED'
  | 'BLOCK_OFFLOAD_STARTED'
  | 'BLOCK_OFFLOAD_COMPLETED'
  | 'BLOCK_LOAD_STARTED'
  | 'BLOCK_LOAD_COMPLETED';

export interface KvMutation {
  type: KvMutationType;
  blockId: ID;
  requestId: ID | null;
  detail: Record<string, unknown>;
}

export interface PrefixLookupResult {
  hitBlockIds: ID[];
  hitTokens: number;
  missBlockIndex: number;
}

export interface HostPrefixLookupResult {
  hitBlockIds: ID[];
  hitTokens: number;
  missBlockIndex: number;
}

export interface AllocationResult {
  ok: boolean;
  allocated: ID[];
  evicted: ID[];
  reason?: string;
}

/**
 * Block-level KV cache with contiguous prefix matching, refcounts, generation
 * guards and LRU eviction. One logical pool per engine; every logical block
 * occupies one block slot on each rank of the engine.
 */
export class KvCacheManager {
  readonly config: KvCacheConfig;
  private readonly blocks: KvBlock[] = [];
  private readonly idToIndex = new Map<ID, number>();
  private readonly freeList: number[] = [];
  /**
   * A prefix hash may be present in several physical blocks: concurrent
   * requests can allocate the same prefix before either block is complete.
   * The map therefore owns a set of candidates instead of one block, so
   * freeing one duplicate cannot silently invalidate another live block's
   * mapping.
   */
  private readonly hashToBlocks = new Map<string, Set<number>>();
  private readonly requestBlocks = new Map<ID, Set<number>>();
  /** Host-resident blocks live outside the HBM slot array. */
  private readonly hostBlocks = new Map<ID, KvBlock>();
  private readonly hostHashToBlocks = new Map<string, Set<ID>>();
  /** HBM slots reserved at load start so completion cannot lose the race. */
  private readonly loadReservations = new Map<ID, number>();
  private hostCounter = 0;
  private evictions = 0;
  private allocations = 0;
  private hits = 0;

  constructor(config: KvCacheConfig) {
    this.config = config;
    for (let i = 0; i < config.capacityBlocks; i += 1) {
      this.blocks.push({
        id: `kv-${config.engineId}-${i.toString(36)}`,
        index: i,
        engineId: config.engineId,
        poolId: config.poolId,
        blockSize: config.blockSize,
        bytes: config.bytesPerBlock,
        state: 'FREE',
        location: 'HBM',
        refCount: 0,
        requestId: null,
        hash: null,
        parentHash: null,
        lastUsedUs: 0,
        generation: 0,
        full: false,
      });
      this.freeList.push(i);
      this.idToIndex.set(this.blocks[i]!.id, i);
    }
  }

  get capacityBlocks(): number {
    return this.config.capacityBlocks;
  }

  get blockSize(): number {
    return this.config.blockSize;
  }

  get usedBlocks(): number {
    return this.config.capacityBlocks - this.freeList.length;
  }

  get usedBytes(): Bytes {
    return this.usedBlocks * this.config.bytesPerBlock;
  }

  get freeBlocks(): number {
    return this.freeList.length;
  }

  get hostUsedBlocks(): number {
    return this.hostBlocks.size;
  }

  /**
   * Blocks that already consume host capacity: resident blocks plus blocks
   * whose offload is in flight. Capacity checks must reserve the latter, or
   * two overlapping offload batches can both pass the same free-space check.
   */
  get hostCommittedBlocks(): number {
    let pending = 0;
    for (const block of this.blocks) {
      if (block.state === 'OFFLOADING') pending += 1;
    }
    return this.hostBlocks.size + pending;
  }

  get hostUsedBytes(): Bytes {
    return this.hostBlocks.size * this.config.bytesPerBlock;
  }

  get stats(): { evictions: number; allocations: number; hits: number; usedBlocks: number; freeBlocks: number } {
    return {
      evictions: this.evictions,
      allocations: this.allocations,
      hits: this.hits,
      usedBlocks: this.usedBlocks,
      freeBlocks: this.freeList.length,
    };
  }

  getBlock(id: ID): KvBlock | undefined {
    const index = this.idToIndex.get(id);
    return index === undefined ? undefined : this.blocks[index];
  }

  getHostBlock(id: ID): KvBlock | undefined {
    return this.hostBlocks.get(id);
  }

  allHostBlocks(): KvBlock[] {
    return [...this.hostBlocks.values()];
  }

  getBlockByHash(hash: string): KvBlock | undefined {
    const indices = this.hashToBlocks.get(hash);
    if (!indices) return undefined;
    for (const index of indices) {
      const block = this.blocks[index];
      if (block && this.isReadyCacheBlock(block, hash)) return block;
    }
    const first = indices.values().next().value;
    return first === undefined ? undefined : this.blocks[first];
  }

  private registerHash(hash: string, index: number): void {
    const indices = this.hashToBlocks.get(hash) ?? new Set<number>();
    indices.add(index);
    this.hashToBlocks.set(hash, indices);
  }

  private unregisterHash(hash: string, index: number): void {
    const indices = this.hashToBlocks.get(hash);
    if (!indices) return;
    indices.delete(index);
    if (indices.size === 0) this.hashToBlocks.delete(hash);
  }

  private registerHostHash(hash: string, hostId: ID): void {
    const ids = this.hostHashToBlocks.get(hash) ?? new Set<ID>();
    ids.add(hostId);
    this.hostHashToBlocks.set(hash, ids);
  }

  private unregisterHostHash(hash: string, hostId: ID): void {
    const ids = this.hostHashToBlocks.get(hash);
    if (!ids) return;
    ids.delete(hostId);
    if (ids.size === 0) this.hostHashToBlocks.delete(hash);
  }

  private isReadyCacheBlock(block: KvBlock, hash: string): boolean {
    return (
      block.hash === hash &&
      block.full &&
      (block.state === 'REUSABLE' || block.state === 'CACHED_ACTIVE' || block.state === 'COMPLETE')
    );
  }

  allBlocks(): KvBlock[] {
    return this.blocks;
  }

  requestBlockIds(requestId: ID): ID[] {
    const set = this.requestBlocks.get(requestId);
    if (!set) return [];
    return [...set].map((i) => this.blocks[i]!.id);
  }

  requestBlockCount(requestId: ID): number {
    return this.requestBlocks.get(requestId)?.size ?? 0;
  }

  /**
   * Development-mode consistency checks. Returns human-readable problems
   * instead of throwing so callers can attach them to a SimulationError with
   * the rest of the run context.
   *
   * Checked invariants:
   * - free-list entries are unique, valid and really FREE (or reserved for a
   *   load that is currently in flight);
   * - every FREE block is either on the free list or reserved by a load;
   * - refcounts are non-negative and request ownership never references a
   *   FREE block;
   * - hash maps point at live blocks with matching hashes;
   * - host blocks and load reservations are internally consistent.
   */
  assertInvariants(): string[] {
    const problems: string[] = [];
    const freeSet = new Set<number>();
    const reservedSlots = new Set(this.loadReservations.values());

    for (const index of this.freeList) {
      if (!Number.isInteger(index) || index < 0 || index >= this.blocks.length) {
        problems.push(`free list contains out-of-range block index ${index}`);
        continue;
      }
      if (freeSet.has(index)) {
        problems.push(`free list contains duplicate block index ${index}`);
        continue;
      }
      freeSet.add(index);
      const block = this.blocks[index]!;
      if (block.state !== 'FREE') {
        problems.push(`free-list block ${block.id} has state ${block.state}`);
      }
      if (reservedSlots.has(index)) {
        problems.push(`block index ${index} is both free-listed and reserved for a load`);
      }
    }

    for (const block of this.blocks) {
      if (block.index < 0 || block.index >= this.blocks.length) {
        problems.push(`block ${block.id} has invalid index ${block.index}`);
      }
      if (block.refCount < 0) {
        problems.push(`block ${block.id} has negative refCount ${block.refCount}`);
      }
      if (block.state === 'FREE' && !freeSet.has(block.index) && !reservedSlots.has(block.index)) {
        problems.push(`FREE block ${block.id} is neither free-listed nor reserved`);
      }
      if (block.state !== 'FREE' && freeSet.has(block.index)) {
        problems.push(`non-FREE block ${block.id} (${block.state}) is on the free list`);
      }
      if (block.hash && block.state !== 'FREE' && block.state !== 'OFFLOADING') {
        const mapped = this.hashToBlocks.get(block.hash);
        if (!mapped || !mapped.has(block.index)) {
          problems.push(`block ${block.id} hash ${block.hash} is missing from the hash map`);
        } else {
          const mappedBlock = this.blocks[block.index];
          if (!mappedBlock || mappedBlock.hash !== block.hash) {
            problems.push(`block ${block.id} hash ${block.hash} maps to a block with a different hash`);
          }
        }
      }
    }

    for (const [hash, indices] of this.hashToBlocks) {
      if (indices.size === 0) {
        problems.push(`hash ${hash} has an empty block set`);
        continue;
      }
      for (const index of indices) {
        const block = this.blocks[index];
        if (!block) {
          problems.push(`hash ${hash} maps to out-of-range block index ${index}`);
        } else if (block.hash !== hash) {
          problems.push(`hash ${hash} maps to block ${block.id} with hash ${block.hash ?? 'null'}`);
        } else if (block.state === 'FREE' || block.state === 'OFFLOADING') {
          problems.push(`hash ${hash} maps to block ${block.id} in state ${block.state}`);
        }
      }
    }

    for (const [requestId, indices] of this.requestBlocks) {
      for (const index of indices) {
        const block = this.blocks[index];
        if (!block) {
          problems.push(`request ${requestId} references out-of-range block index ${index}`);
          continue;
        }
        if (block.state === 'FREE') {
          problems.push(`request ${requestId} references FREE block ${block.id}`);
        }
        if (block.refCount <= 0) {
          problems.push(`request ${requestId} references block ${block.id} with refCount ${block.refCount}`);
        }
      }
    }

    for (const [hostId, block] of this.hostBlocks) {
      if (block.id !== hostId) {
        problems.push(`host block key ${hostId} does not match block id ${block.id}`);
      }
      if (block.location !== 'DRAM') {
        problems.push(`host block ${hostId} has location ${block.location}`);
      }
      if (block.state !== 'HOST_RESIDENT' && block.state !== 'LOADING') {
        problems.push(`host block ${hostId} has invalid state ${block.state}`);
      }
      if (block.refCount !== 0) {
        problems.push(`host block ${hostId} has refCount ${block.refCount}`);
      }
      if (block.hash && block.state === 'HOST_RESIDENT') {
        const mapped = this.hostHashToBlocks.get(block.hash);
        if (!mapped || !mapped.has(hostId)) {
          problems.push(`host block ${hostId} hash ${block.hash} is missing from the host hash map`);
        }
      }
    }

    for (const [hash, ids] of this.hostHashToBlocks) {
      if (ids.size === 0) {
        problems.push(`host hash ${hash} has an empty block set`);
        continue;
      }
      for (const hostId of ids) {
        const block = this.hostBlocks.get(hostId);
        if (!block) {
          problems.push(`host hash ${hash} maps to missing host block ${hostId}`);
        } else if (block.hash !== hash) {
          problems.push(`host hash ${hash} maps to host block ${hostId} with hash ${block.hash ?? 'null'}`);
        } else if (block.state !== 'HOST_RESIDENT') {
          problems.push(`host hash ${hash} maps to host block ${hostId} in state ${block.state}`);
        }
      }
    }

    for (const [hostId, index] of this.loadReservations) {
      if (index < 0 || index >= this.blocks.length) {
        problems.push(`load reservation for ${hostId} uses out-of-range index ${index}`);
      } else if (this.blocks[index]!.state !== 'FREE') {
        problems.push(`load reservation for ${hostId} targets non-FREE block ${this.blocks[index]!.id}`);
      }
      const hostBlock = this.hostBlocks.get(hostId);
      if (!hostBlock) {
        problems.push(`load reservation references missing host block ${hostId}`);
      } else if (hostBlock.state !== 'LOADING') {
        problems.push(`load reservation host block ${hostId} has state ${hostBlock.state}`);
      }
    }

    return problems;
  }

  /**
   * Contiguous prefix lookup from block 0. A later block can never be used if
   * an earlier block misses, even if its hash happens to match.
   */
  peekPrefix(blockHashes: string[]): PrefixLookupResult {
    const hitBlockIds: ID[] = [];
    let hitTokens = 0;
    for (let i = 0; i < blockHashes.length; i += 1) {
      const hash = blockHashes[i]!;
      const indices = this.hashToBlocks.get(hash);
      if (!indices) break;
      let hit: KvBlock | undefined;
      for (const index of indices) {
        const block = this.blocks[index]!;
        if (this.isReadyCacheBlock(block, hash)) {
          hit = block;
          break;
        }
      }
      if (!hit) break;
      hitBlockIds.push(hit.id);
      hitTokens += hit.blockSize;
    }
    return { hitBlockIds, hitTokens, missBlockIndex: hitBlockIds.length };
  }

  lookupPrefix(blockHashes: string[], timeUs: Microseconds): PrefixLookupResult {
    const result = this.peekPrefix(blockHashes);
    for (const blockId of result.hitBlockIds) {
      const block = this.getBlock(blockId);
      if (block) block.lastUsedUs = timeUs;
    }
    this.hits += result.hitBlockIds.length;
    return result;
  }

  /**
   * Host-tier lookup starting at `startIndex`. Only contiguous host-resident
   * blocks are returned; a missing or HBM-resident block stops the run.
   */
  lookupHostBlocksFrom(blockHashes: string[], startIndex: number): HostPrefixLookupResult {
    const hitBlockIds: ID[] = [];
    let hitTokens = 0;
    for (let i = startIndex; i < blockHashes.length; i += 1) {
      const hash = blockHashes[i]!;
      const hostIds = this.hostHashToBlocks.get(hash);
      if (!hostIds) break;
      let hit: KvBlock | undefined;
      for (const hostId of hostIds) {
        const block = this.hostBlocks.get(hostId);
        if (block && block.hash === hash && block.state === 'HOST_RESIDENT' && block.full) {
          hit = block;
          break;
        }
      }
      if (!hit) break;
      hitBlockIds.push(hit.id);
      hitTokens += hit.blockSize;
    }
    return { hitBlockIds, hitTokens, missBlockIndex: startIndex + hitBlockIds.length };
  }

  /** Attach already-cached blocks to a request and bump refcounts. */
  attachHitBlocks(requestId: ID, blockIds: ID[], timeUs: Microseconds): KvMutation[] {
    const mutations: KvMutation[] = [];
    for (const blockId of blockIds) {
      const index = this.idToIndex.get(blockId);
      if (index === undefined) continue;
      const block = this.blocks[index]!;
      block.refCount += 1;
      block.requestId = block.requestId ?? requestId;
      block.state = 'CACHED_ACTIVE';
      block.lastUsedUs = timeUs;
      const set = this.requestBlocks.get(requestId) ?? new Set<number>();
      set.add(index);
      this.requestBlocks.set(requestId, set);
      mutations.push({
        type: 'KV_ALLOCATED',
        blockId,
        requestId,
        detail: {
          blockIndex: block.index,
          bytes: block.bytes,
          hash: block.hash,
          parentHash: block.parentHash,
          hit: true,
          state: block.state,
          refCount: block.refCount,
          requestId: block.requestId,
          engineId: block.engineId,
          poolId: block.poolId,
        },
      });
    }
    return mutations;
  }

  /**
   * Allocate blocks so that a request owns `neededBlocks` blocks. Existing
   * blocks are reused; new blocks may evict reusable cache entries.
   */
  allocateFor(
    requestId: ID,
    neededBlocks: number,
    timeUs: Microseconds,
    hashForBlock: (blockIndex: number) => string | null,
    parentHashForBlock: (blockIndex: number) => string | null,
  ): AllocationResult {
    if (neededBlocks > this.config.capacityBlocks) {
      return {
        ok: false,
        allocated: [],
        evicted: [],
        reason: `需要 ${neededBlocks} 个 KV Block，超过池容量 ${this.config.capacityBlocks}。`,
      };
    }
    const set = this.requestBlocks.get(requestId) ?? new Set<number>();
    this.requestBlocks.set(requestId, set);
    const current = set.size;
    const allocated: ID[] = [];
    const evicted: ID[] = [];
    for (let blockIndex = current; blockIndex < neededBlocks; blockIndex += 1) {
      let freeIndex = this.freeList.pop();
      if (freeIndex === undefined) {
        const victim = this.evictOne(timeUs);
        if (victim === null) {
          this.rollbackAllocated(requestId, allocated, timeUs);
          return {
            ok: false,
            allocated: [],
            evicted,
            reason: 'KV 池没有可用的空闲 Block，且没有可淘汰的无引用缓存块。',
          };
        }
        evicted.push(victim.id);
        // evictOne() puts the victim back on the free list; this allocation is
        // about to claim it, so remove it again to avoid a double allocation.
        this.removeFromFreeList(victim.index);
        freeIndex = victim.index;
      }
      const block = this.blocks[freeIndex]!;
      const hash = hashForBlock(blockIndex);
      block.state = 'RESERVED';
      block.location = 'HBM';
      block.refCount = 1;
      block.requestId = requestId;
      block.hash = hash;
      block.parentHash = parentHashForBlock(blockIndex);
      block.lastUsedUs = timeUs;
      block.generation += 1;
      block.full = false;
      if (hash) this.registerHash(hash, block.index);
      set.add(block.index);
      this.allocations += 1;
      allocated.push(block.id);
    }
    return { ok: true, allocated, evicted };
  }

  /**
   * Mark full prompt blocks as complete and register their hashes. Returns
   * mutations so the event log explains every cache transition.
   */
  completeFullBlocks(
    requestId: ID,
    computedTokens: number,
    blockHashes: string[],
    timeUs: Microseconds,
  ): KvMutation[] {
    const set = this.requestBlocks.get(requestId);
    if (!set) return [];
    const mutations: KvMutation[] = [];
    const fullBlocks = Math.floor(computedTokens / this.config.blockSize);
    // The set preserves allocation order, which is the request's logical block
    // order. Physical block slots are reused and must not be confused with
    // logical indices.
    const ordered = [...set];
    for (let blockIndex = 0; blockIndex < fullBlocks; blockIndex += 1) {
      const index = ordered[blockIndex];
      if (index === undefined) continue;
      const block = this.blocks[index]!;
      const hash = blockHashes[blockIndex] ?? block.hash;
      if (!hash) continue;
      const previousHash = block.hash;
      if (previousHash && previousHash !== hash) {
        this.unregisterHash(previousHash, block.index);
      }
      const alreadyReady = block.state === 'CACHED_ACTIVE' && block.hash === hash && block.full;
      block.state = 'CACHED_ACTIVE';
      block.hash = hash;
      block.full = true;
      block.lastUsedUs = timeUs;
      this.registerHash(hash, block.index);
      if (!alreadyReady) {
        mutations.push({
          type: 'BLOCK_CACHED',
          blockId: block.id,
          requestId,
          detail: { blockIndex, hash, parentHash: block.parentHash, refCount: block.refCount },
        });
      }
    }
    return mutations;
  }

  /**
   * Release a request's blocks. Full hashed blocks may be retained as
   * reusable prefix cache entries; partial blocks and uncached blocks free.
   */
  releaseRequest(requestId: ID, timeUs: Microseconds, keepCached: boolean): KvMutation[] {
    const set = this.requestBlocks.get(requestId);
    if (!set) return [];
    const mutations: KvMutation[] = [];
    for (const index of set) {
      const block = this.blocks[index]!;
      block.refCount = Math.max(0, block.refCount - 1);
      if (block.refCount > 0) {
        block.requestId = null;
        continue;
      }
      if (keepCached && block.hash && block.full) {
        block.state = 'REUSABLE';
        block.requestId = null;
        block.lastUsedUs = timeUs;
        mutations.push({
          type: 'KV_FREED',
          blockId: block.id,
          requestId,
          detail: { blockIndex: block.index, hash: block.hash, retained: true },
        });
      } else {
        this.freeBlock(block, timeUs);
        mutations.push({
          type: 'KV_FREED',
          blockId: block.id,
          requestId,
          detail: { blockIndex: block.index, hash: block.hash, retained: false },
        });
      }
    }
    this.requestBlocks.delete(requestId);
    return mutations;
  }

  /** Evict up to `count` reusable blocks. Returns mutations. */
  evict(count: number, timeUs: Microseconds): KvMutation[] {
    const mutations: KvMutation[] = [];
    for (let i = 0; i < count; i += 1) {
      const victim = this.evictOne(timeUs);
      if (!victim) break;
      mutations.push({
        type: 'BLOCK_EVICTED',
        blockId: victim.id,
        requestId: null,
        detail: { blockIndex: victim.index, hash: victim.hash },
      });
    }
    return mutations;
  }

  /**
   * Start moving a reusable block out of HBM. The hash mapping is removed
   * immediately so concurrent prefix lookups cannot attach a block that is
   * being written back to host memory.
   */
  beginOffload(blockId: ID): KvMutation | null {
    const block = this.getBlock(blockId);
    if (!block || block.refCount > 0 || block.location !== 'HBM') return null;
    if (block.state !== 'REUSABLE' || !block.hash || !block.full) return null;
    block.state = 'OFFLOADING';
    this.unregisterHash(block.hash, block.index);
    return {
      type: 'BLOCK_OFFLOAD_STARTED',
      blockId,
      requestId: null,
      detail: {
        blockIndex: block.index,
        hash: block.hash,
        bytes: block.bytes,
        engineId: block.engineId,
        poolId: block.poolId,
      },
    };
  }

  /** Restore a block when an offload batch cannot be scheduled atomically. */
  cancelOffload(blockId: ID): void {
    const block = this.getBlock(blockId);
    if (!block || block.state !== 'OFFLOADING') return;
    block.state = 'REUSABLE';
    if (block.hash) this.registerHash(block.hash, block.index);
  }

  /**
   * Complete an offload: the HBM slot becomes free and the block metadata
   * moves to the host tier under a fresh id (slot ids are reused).
   */
  completeOffload(blockId: ID, timeUs: Microseconds): KvMutation | null {
    const block = this.getBlock(blockId);
    if (!block || block.state !== 'OFFLOADING') return null;
    const hostId = `kvhost-${this.config.engineId}-${(this.hostCounter++).toString(36)}`;
    const hostBlock: KvBlock = {
      ...block,
      id: hostId,
      state: 'HOST_RESIDENT',
      location: 'DRAM',
      refCount: 0,
      requestId: null,
      lastUsedUs: timeUs,
    };
    this.hostBlocks.set(hostId, hostBlock);
    if (hostBlock.hash) this.registerHostHash(hostBlock.hash, hostId);
    this.freeBlock(block, timeUs);
    return {
      type: 'BLOCK_OFFLOAD_COMPLETED',
      blockId: hostId,
      requestId: null,
      detail: {
        blockIndex: hostBlock.index,
        hash: hostBlock.hash,
        bytes: hostBlock.bytes,
        sourceBlockId: block.id,
        engineId: hostBlock.engineId,
        poolId: hostBlock.poolId,
      },
    };
  }

  /** Reserve an HBM slot and mark a host block as loading. */
  beginLoad(hostBlockId: ID): KvMutation | null {
    const hostBlock = this.hostBlocks.get(hostBlockId);
    if (!hostBlock || hostBlock.state !== 'HOST_RESIDENT') return null;
    const freeIndex = this.freeList.pop();
    if (freeIndex === undefined) return null;
    hostBlock.state = 'LOADING';
    if (hostBlock.hash) this.unregisterHostHash(hostBlock.hash, hostBlock.id);
    this.loadReservations.set(hostBlockId, freeIndex);
    return {
      type: 'BLOCK_LOAD_STARTED',
      blockId: hostBlockId,
      requestId: null,
      detail: {
        blockIndex: hostBlock.index,
        hash: hostBlock.hash,
        bytes: hostBlock.bytes,
        engineId: hostBlock.engineId,
        poolId: hostBlock.poolId,
      },
    };
  }

  /** Undo a reservation when a load batch cannot be scheduled atomically. */
  cancelLoad(hostBlockId: ID): void {
    const hostBlock = this.hostBlocks.get(hostBlockId);
    const reservedIndex = this.loadReservations.get(hostBlockId);
    if (reservedIndex === undefined) return;
    this.loadReservations.delete(hostBlockId);
    this.freeList.push(reservedIndex);
    if (hostBlock) {
      hostBlock.state = 'HOST_RESIDENT';
      if (hostBlock.hash) this.registerHostHash(hostBlock.hash, hostBlock.id);
    }
  }

  /**
   * Complete a load into the slot reserved at beginLoad(). The returned
   * mutation targets the new HBM block id; the host block is removed.
   */
  completeLoad(hostBlockId: ID, timeUs: Microseconds): { mutation: KvMutation; newBlockId: ID } | null {
    const hostBlock = this.hostBlocks.get(hostBlockId);
    const reservedIndex = this.loadReservations.get(hostBlockId);
    if (!hostBlock || hostBlock.state !== 'LOADING' || reservedIndex === undefined) return null;
    const target = this.blocks[reservedIndex]!;
    target.state = 'CACHED_ACTIVE';
    target.location = 'HBM';
    target.refCount = 0;
    target.requestId = null;
    target.hash = hostBlock.hash;
    target.parentHash = hostBlock.parentHash;
    target.lastUsedUs = timeUs;
    target.generation += 1;
    target.full = hostBlock.full;
    if (target.hash) this.registerHash(target.hash, target.index);
    if (hostBlock.hash) this.unregisterHostHash(hostBlock.hash, hostBlockId);
    this.hostBlocks.delete(hostBlockId);
    this.loadReservations.delete(hostBlockId);
    return {
      mutation: {
        type: 'BLOCK_LOAD_COMPLETED',
        blockId: target.id,
        requestId: null,
        detail: {
          blockIndex: target.index,
          hash: target.hash,
          bytes: target.bytes,
          loadedFrom: hostBlockId,
          engineId: target.engineId,
          poolId: target.poolId,
        },
      },
      newBlockId: target.id,
    };
  }

  private rollbackAllocated(requestId: ID, allocated: ID[], timeUs: Microseconds): void {
    const set = this.requestBlocks.get(requestId);
    for (const blockId of allocated) {
      const block = this.getBlock(blockId);
      if (!block) continue;
      set?.delete(block.index);
      this.freeBlock(block, timeUs);
    }
  }

  private evictOne(timeUs: Microseconds): KvBlock | null {
    let victim: KvBlock | null = null;
    for (const block of this.blocks) {
      if (block.state !== 'REUSABLE' || block.refCount !== 0 || block.location !== 'HBM') continue;
      if (!victim || block.lastUsedUs < victim.lastUsedUs) victim = block;
    }
    if (!victim) return null;
    this.freeBlock(victim, timeUs);
    this.evictions += 1;
    return victim;
  }

  private freeBlock(block: KvBlock, timeUs: Microseconds): void {
    if (block.hash) this.unregisterHash(block.hash, block.index);
    block.state = 'FREE';
    block.location = 'HBM';
    block.refCount = 0;
    block.requestId = null;
    block.hash = null;
    block.parentHash = null;
    block.full = false;
    block.lastUsedUs = timeUs;
    this.removeFromFreeList(block.index);
    this.freeList.push(block.index);
  }

  private removeFromFreeList(index: number): void {
    const position = this.freeList.indexOf(index);
    if (position >= 0) this.freeList.splice(position, 1);
  }
}

export function kvBlockView(block: KvBlock): KvBlockView {
  return {
    id: block.id,
    poolId: block.poolId,
    engineId: block.engineId,
    blockIndex: block.index,
    hash: block.hash,
    parentHash: block.parentHash,
    state: block.state,
    location: block.location,
    refCount: block.refCount,
    requestId: block.requestId,
    bytes: block.bytes,
    lastUsedUs: block.lastUsedUs,
    generation: block.generation,
  };
}
