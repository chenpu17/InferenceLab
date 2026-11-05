import type {
  EngineView,
  ID,
  KvBlockView,
  PlanResult,
  RequestView,
  SimEvent,
  SimViewState,
  StateSnapshot,
} from '../domain/types.js';

export function createEmptyViewState(plan?: PlanResult): SimViewState {
  const engines: Record<ID, EngineView> = {};
  if (plan) {
    for (const engine of plan.engines) {
      engines[engine.id] = {
        id: engine.id,
        role: engine.role,
        dpReplicaId: engine.dpReplicaId,
        waiting: [],
        running: [],
        preempted: [],
        kvBlocksUsed: 0,
        kvBlocksFree: engine.maxKvBlocksPerRank,
        kvBlocksTotal: engine.maxKvBlocksPerRank,
        kvPoolBytesUsed: 0,
        kvPoolBytesTotal: engine.kvPoolReservedBytesPerRank,
        lastBudgetTotal: 0,
        lastBudgetUsed: 0,
        lastIteration: 0,
      };
    }
  }
  return {
    timeUs: 0,
    requests: {},
    engines,
    blocks: {},
    latestEventId: null,
    eventCount: 0,
  };
}

export function cloneViewState(state: SimViewState, includeBlocks = true): SimViewState {
  const requests: Record<ID, RequestView> = {};
  for (const [id, request] of Object.entries(state.requests)) {
    requests[id] = { ...request, kvBlockIds: [...request.kvBlockIds] };
  }
  const engines: Record<ID, EngineView> = {};
  for (const [id, engine] of Object.entries(state.engines)) {
    engines[id] = {
      ...engine,
      waiting: [...engine.waiting],
      running: [...engine.running],
      preempted: [...engine.preempted],
    };
  }
  const blocks: Record<ID, KvBlockView> = {};
  if (includeBlocks) {
    for (const [id, block] of Object.entries(state.blocks)) {
      if (block.state !== 'FREE') blocks[id] = { ...block };
    }
  }
  return {
    timeUs: state.timeUs,
    requests,
    engines,
    blocks,
    latestEventId: state.latestEventId,
    eventCount: state.eventCount,
  };
}

function syncEngineQueues(state: SimViewState, engineId: ID): void {
  const engine = state.engines[engineId];
  if (!engine) return;
  const waiting: ID[] = [];
  const running: ID[] = [];
  const preempted: ID[] = [];
  for (const request of Object.values(state.requests)) {
    if (request.engineId !== engineId) continue;
    if (request.status === 'WAITING' || request.status === 'ARRIVED' || request.status === 'WAITING_FOR_REMOTE_KV') {
      waiting.push(request.id);
    } else if (request.status === 'RUNNING') {
      running.push(request.id);
    } else if (request.status === 'PREEMPTED') {
      preempted.push(request.id);
    }
  }
  engine.waiting = waiting;
  engine.running = running;
  engine.preempted = preempted;
}

function ensureRequest(state: SimViewState, event: SimEvent): RequestView | null {
  if (!event.requestId) return null;
  const existing = state.requests[event.requestId];
  if (existing) return existing;
  const detail = event.detail;
  const engineId = String(detail.engineId ?? '');
  const request: RequestView = {
    id: event.requestId,
    engineId,
    dpReplicaId: String(detail.dpReplicaId ?? ''),
    status: 'ARRIVED',
    promptTokens: Number(detail.promptTokens ?? 0),
    outputTokens: Number(detail.outputTokens ?? 0),
    numComputedTokens: 0,
    computedPrefillTokens: 0,
    numGeneratedTokens: 0,
    cachedInputTokens: 0,
    firstTokenUs: null,
    lastTokenUs: null,
    arrivalUs: event.timeUs,
    finishUs: null,
    waitingReason: null,
    preemptions: 0,
    kvBlockIds: [],
    scheduledTokensThisStep: 0,
  };
  state.requests[event.requestId] = request;
  return request;
}

function ensureBlock(state: SimViewState, event: SimEvent): KvBlockView | null {
  const blockId = String(event.detail.blockId ?? event.targetId ?? '');
  if (!blockId) return null;
  const existing = state.blocks[blockId];
  if (existing) return existing;
  const detail = event.detail;
  const block: KvBlockView = {
    id: blockId,
    poolId: String(detail.poolId ?? ''),
    engineId: String(detail.engineId ?? ''),
    blockIndex: Number(detail.blockIndex ?? 0),
    hash: (detail.hash as string | null | undefined) ?? null,
    parentHash: (detail.parentHash as string | null | undefined) ?? null,
    state: (detail.hit ? 'CACHED_ACTIVE' : 'RESERVED') as KvBlockView['state'],
    location: 'HBM',
    refCount: Number(detail.hit ? 2 : 1),
    requestId: event.requestId ?? null,
    bytes: Number(detail.bytes ?? 0),
    lastUsedUs: event.timeUs,
    generation: 0,
  };
  state.blocks[blockId] = block;
  return block;
}

/**
 * Pure reducer used by both the simulator (for checkpoints) and the UI
 * (for replay). Every visual transition must come from an event.
 */
export function applyEvent(state: SimViewState, event: SimEvent): SimViewState {
  state.timeUs = event.timeUs;
  state.latestEventId = event.id;
  state.eventCount += 1;
  const detail = event.detail;

  switch (event.type) {
    case 'REQUEST_ARRIVED': {
      ensureRequest(state, event);
      break;
    }
    case 'REQUEST_QUEUED': {
      const request = ensureRequest(state, event);
      if (request) {
        const reason = String(detail.reason ?? 'WAITING');
        request.status = reason === 'WAITING_FOR_REMOTE_KV' ? 'WAITING_FOR_REMOTE_KV' : 'WAITING';
        request.waitingReason = reason;
        if (typeof detail.engineId === 'string') request.engineId = detail.engineId;
        if (typeof detail.dpReplicaId === 'string') request.dpReplicaId = detail.dpReplicaId;
      }
      break;
    }
    case 'REQUEST_SCHEDULED': {
      const request = ensureRequest(state, event);
      if (request) {
        request.status = 'RUNNING';
        request.scheduledTokensThisStep = Number(detail.tokens ?? 0);
        request.waitingReason = null;
      }
      break;
    }
    case 'PREFIX_LOOKUP_DONE': {
      const request = ensureRequest(state, event);
      if (request) request.cachedInputTokens = Number(detail.hitTokens ?? 0);
      break;
    }
    case 'KV_ALLOCATED': {
      const request = ensureRequest(state, event);
      const block = ensureBlock(state, event);
      if (request && block) {
        if (!request.kvBlockIds.includes(block.id)) request.kvBlockIds.push(block.id);
        if (detail.hit) {
          // A prefix hit re-attaches an existing (often REUSABLE) block. The
          // block already exists, so ensureBlock() cannot initialize these
          // fields; copy the post-attach state carried by the event.
          block.state = 'CACHED_ACTIVE';
          block.hash = (detail.hash as string | null | undefined) ?? block.hash;
          block.parentHash = (detail.parentHash as string | null | undefined) ?? block.parentHash;
          block.refCount = Number(detail.refCount ?? block.refCount);
          block.requestId =
            typeof detail.requestId === 'string'
              ? detail.requestId
              : block.requestId ?? event.requestId ?? null;
          block.lastUsedUs = event.timeUs;
        } else {
          // PD allocates decode-side blocks before the request view switches
          // engines, so accounting must follow the block, not the request.
          const engine = state.engines[block.engineId];
          if (engine) {
            engine.kvBlocksUsed += 1;
            engine.kvBlocksFree = Math.max(0, engine.kvBlocksTotal - engine.kvBlocksUsed);
            engine.kvPoolBytesUsed += block.bytes;
          }
        }
      }
      break;
    }
    case 'KV_FREED': {
      const request = ensureRequest(state, event);
      const blockId = String(detail.blockId ?? '');
      if (request) request.kvBlockIds = request.kvBlockIds.filter((id) => id !== blockId);
      const block = state.blocks[blockId];
      if (block) {
        if (detail.retained) {
          block.state = 'REUSABLE';
          block.refCount = 0;
          block.requestId = null;
        } else {
          block.state = 'FREE';
          block.requestId = null;
          block.refCount = 0;
          delete state.blocks[blockId];
          const engine = state.engines[block.engineId];
          if (engine) {
            engine.kvBlocksUsed = Math.max(0, engine.kvBlocksUsed - 1);
            engine.kvBlocksFree = Math.max(0, engine.kvBlocksTotal - engine.kvBlocksUsed);
            engine.kvPoolBytesUsed = Math.max(0, engine.kvPoolBytesUsed - block.bytes);
          }
        }
      }
      break;
    }
    case 'BLOCK_CACHED': {
      const blockId = String(detail.blockId ?? '');
      const block = state.blocks[blockId];
      if (block) {
        block.state = 'CACHED_ACTIVE';
        block.hash = (detail.hash as string | null | undefined) ?? block.hash;
        block.parentHash = (detail.parentHash as string | null | undefined) ?? block.parentHash;
        block.refCount = Number(detail.refCount ?? block.refCount);
      }
      break;
    }
    case 'BLOCK_EVICTED': {
      const blockId = String(detail.blockId ?? '');
      const block = state.blocks[blockId];
      if (block) {
        const engine = state.engines[block.engineId];
        if (engine) {
          engine.kvBlocksUsed = Math.max(0, engine.kvBlocksUsed - 1);
          engine.kvBlocksFree = Math.max(0, engine.kvBlocksTotal - engine.kvBlocksUsed);
          engine.kvPoolBytesUsed = Math.max(0, engine.kvPoolBytesUsed - block.bytes);
        }
        delete state.blocks[blockId];
      }
      break;
    }
    case 'BLOCK_OFFLOAD_STARTED': {
      const blockId = String(detail.blockId ?? '');
      const block = state.blocks[blockId];
      if (block) {
        block.state = 'OFFLOADING';
        block.location = 'HBM';
      }
      break;
    }
    case 'BLOCK_OFFLOAD_COMPLETED': {
      const hostId = String(detail.blockId ?? '');
      const sourceId = String(detail.sourceBlockId ?? '');
      const source = state.blocks[sourceId];
      if (source) {
        const engine = state.engines[source.engineId];
        if (engine) {
          engine.kvBlocksUsed = Math.max(0, engine.kvBlocksUsed - 1);
          engine.kvBlocksFree = Math.min(engine.kvBlocksTotal, engine.kvBlocksFree + 1);
          engine.kvPoolBytesUsed = Math.max(0, engine.kvPoolBytesUsed - source.bytes);
        }
        delete state.blocks[sourceId];
      }
      if (hostId) {
        state.blocks[hostId] = {
          id: hostId,
          poolId: String(detail.poolId ?? ''),
          engineId: String(detail.engineId ?? source?.engineId ?? ''),
          blockIndex: Number(detail.blockIndex ?? 0),
          hash: (detail.hash as string | null | undefined) ?? null,
          parentHash: null,
          state: 'HOST_RESIDENT',
          location: 'DRAM',
          refCount: 0,
          requestId: null,
          bytes: Number(detail.bytes ?? 0),
          lastUsedUs: event.timeUs,
          generation: (source?.generation ?? 0) + 1,
        };
      }
      break;
    }
    case 'BLOCK_LOAD_STARTED': {
      const blockId = String(detail.blockId ?? '');
      const block = state.blocks[blockId];
      if (block) {
        block.state = 'LOADING';
        block.location = 'DRAM';
        // The HBM slot is reserved at load start; account for it immediately.
        const engine = state.engines[block.engineId];
        if (engine) {
          engine.kvBlocksUsed += 1;
          engine.kvBlocksFree = Math.max(0, engine.kvBlocksTotal - engine.kvBlocksUsed);
          engine.kvPoolBytesUsed += block.bytes;
        }
      }
      break;
    }
    case 'BLOCK_LOAD_COMPLETED': {
      const hostId = String(detail.loadedFrom ?? '');
      if (hostId) delete state.blocks[hostId];
      const block = ensureBlock(state, event);
      if (block) {
        block.state = 'CACHED_ACTIVE';
        block.location = 'HBM';
        block.refCount = 0;
        block.requestId = null;
      }
      break;
    }
    case 'COMPUTE_DONE': {
      const work = Array.isArray(detail.requests) ? detail.requests : [];
      for (const item of work) {
        if (!item || typeof item !== 'object') continue;
        const entry = item as { requestId?: unknown; prefillTokens?: unknown };
        const request = state.requests[String(entry.requestId ?? '')];
        if (!request) continue;
        const tokens = Number(entry.prefillTokens ?? 0);
        if (!Number.isFinite(tokens) || tokens <= 0) continue;
        request.numComputedTokens += tokens;
        request.computedPrefillTokens += tokens;
      }
      break;
    }
    case 'TRANSFER_STARTED': {
      const request = ensureRequest(state, event);
      if (request) {
        const decodeEngineId = typeof detail.decodeEngineId === 'string' ? detail.decodeEngineId : null;
        const targetEngine = decodeEngineId ? state.engines[decodeEngineId] : null;
        if (targetEngine) {
          request.engineId = targetEngine.id;
          request.dpReplicaId = targetEngine.dpReplicaId;
        }
        const kind = String(detail.kind ?? 'PD_KV_TRANSFER');
        request.status = kind === 'PD_KV_TRANSFER' ? 'WAITING_FOR_REMOTE_KV' : request.status;
        request.waitingReason = kind === 'HOST_LOAD' ? 'HOST_KV_LOADING' : 'WAITING_FOR_REMOTE_KV';
      }
      break;
    }
    case 'TRANSFER_COMPLETED': {
      const request = ensureRequest(state, event);
      if (request && String(detail.kind ?? '') === 'PD_KV_TRANSFER') {
        request.waitingReason = 'REMOTE_KV_READY';
      }
      break;
    }
    case 'TOKEN_EMITTED': {
      const request = ensureRequest(state, event);
      if (request) {
        const count = Number(detail.count ?? 1);
        request.numGeneratedTokens += count;
        // Accepted tokens join the computed KV, matching RequestTrace.
        request.numComputedTokens += count;
        request.lastTokenUs = event.timeUs;
        if (request.firstTokenUs === null) request.firstTokenUs = event.timeUs;
      }
      break;
    }
    case 'REQUEST_PREEMPTED': {
      const request = ensureRequest(state, event);
      if (request) {
        request.status = 'PREEMPTED';
        request.waitingReason = String(detail.reason ?? 'PREEMPTED_RECOMPUTE');
        request.preemptions += 1;
        request.kvBlockIds = [];
        request.numComputedTokens = 0;
        // computedPrefillTokens is cumulative prefill work, matching the final
        // RequestTrace. Only the live KV progress (numComputedTokens) resets.
      }
      break;
    }
    case 'REQUEST_FINISHED': {
      const request = ensureRequest(state, event);
      if (request) {
        request.status = 'FINISHED';
        request.finishUs = event.timeUs;
        request.waitingReason = null;
      }
      break;
    }
    case 'REQUEST_REJECTED': {
      const request = ensureRequest(state, event);
      if (request) {
        request.status = 'REJECTED';
        request.finishUs = event.timeUs;
        request.waitingReason = String(detail.reason ?? 'REJECTED');
      }
      break;
    }
    case 'SCHEDULE_TICK': {
      const engine = state.engines[String(detail.engineId ?? event.targetId ?? '')];
      if (engine) {
        engine.lastBudgetTotal = Number(detail.budgetTotal ?? 0);
        engine.lastBudgetUsed = Number(detail.budgetUsed ?? 0);
        engine.lastIteration = Number(detail.iteration ?? 0);
      }
      break;
    }
    default:
      break;
  }

  for (const engineId of Object.keys(state.engines)) {
    syncEngineQueues(state, engineId);
  }
  return state;
}

export function snapshotViewState(state: SimViewState, eventIndex: number, includeBlocks = false): StateSnapshot {
  return {
    eventIndex,
    timeUs: state.timeUs,
    state: cloneViewState(state, includeBlocks),
  };
}
