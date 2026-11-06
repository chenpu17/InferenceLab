import type { SimEvent, SimulationResult } from '@inferencelab/core';
import type { EntityRef } from './entities';

export interface IndexedEvent {
  event: SimEvent;
  index: number;
}

function eventMatches(event: SimEvent, entity: EntityRef): boolean {
  switch (entity.kind) {
    case 'device':
      return event.resourceIds.includes(entity.id) || event.targetId === entity.id;
    case 'node':
      return event.resourceIds.some((id) => id.includes(entity.id)) || event.targetId === entity.id;
    case 'engine':
      return event.targetId === entity.id || event.resourceIds.includes(entity.id);
    case 'request':
      return event.requestId === entity.id;
    case 'block':
      return event.detail.blockId === entity.id;
    case 'link':
      return event.resourceIds.includes(entity.id) || (event.detail.linkIds as string[] | undefined)?.includes(entity.id) === true;
    case 'group':
      return event.resourceIds.some((id) => id.includes(entity.id));
    case 'metric':
      return false;
    default:
      return false;
  }
}

function upperBound(indices: readonly number[], target: number): number {
  let low = 0;
  let high = indices.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (indices[mid]! <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

export class RunIndex {
  readonly transfers: SimEvent[] = [];
  readonly transferByRequest = new Map<string, SimEvent>();
  readonly transfersByLink = new Map<string, SimEvent[]>();
  readonly requestsById = new Map<string, SimulationResult['requests'][number]>();
  private readonly entityEventIndices = new Map<string, number[]>();

  constructor(private readonly run: SimulationResult) {
    for (const request of run.requests) {
      if (!this.requestsById.has(request.id)) this.requestsById.set(request.id, request);
    }
    for (const event of run.events) {
      if (event.type !== 'TRANSFER_STARTED') continue;
      this.transfers.push(event);
      if (event.requestId && !this.transferByRequest.has(event.requestId)) {
        this.transferByRequest.set(event.requestId, event);
      }
      const linkIds = (event.detail.linkIds as string[] | undefined) ?? [];
      for (const linkId of new Set(linkIds)) {
        const indices = this.transfersByLink.get(linkId);
        if (indices) indices.push(event);
        else this.transfersByLink.set(linkId, [event]);
      }
    }
  }

  eventIndicesFor(entity: EntityRef): readonly number[] {
    const key = `${entity.kind}:${entity.id}`;
    const cached = this.entityEventIndices.get(key);
    if (cached) return cached;
    const indices: number[] = [];
    for (let index = 0; index < this.run.events.length; index += 1) {
      if (eventMatches(this.run.events[index]!, entity)) indices.push(index);
    }
    this.entityEventIndices.set(key, indices);
    return indices;
  }

  recentEvents(entity: EntityRef, eventIndex: number, limit = 6): IndexedEvent[] {
    const indices = this.eventIndicesFor(entity);
    const end = upperBound(indices, eventIndex);
    const start = Math.max(0, end - Math.max(0, limit));
    const recent: IndexedEvent[] = [];
    for (let i = end - 1; i >= start; i -= 1) {
      const index = indices[i]!;
      recent.push({ event: this.run.events[index]!, index });
    }
    return recent;
  }
}

const runIndices = new WeakMap<SimulationResult, RunIndex>();

export function getRunIndex(run: SimulationResult): RunIndex {
  let index = runIndices.get(run);
  if (!index) {
    index = new RunIndex(run);
    runIndices.set(run, index);
  }
  return index;
}
