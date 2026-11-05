import type { HardwareProfile, ID, Link, Microseconds, MetricQuality } from '../domain/types.js';

export interface TransferPath {
  fromId: ID;
  toId: ID;
  linkIds: ID[];
  endpointIds: ID[];
  bottleneckBitsPerSecond: number;
  latencyUs: Microseconds;
  contentionDomainIds: ID[];
  quality: MetricQuality;
}

export interface ScheduledTransfer {
  startUs: Microseconds;
  endUs: Microseconds;
  durationUs: Microseconds;
  bytes: number;
  path: TransferPath;
  blockedByDomainIds: ID[];
}

function effectiveBps(link: Link): number {
  return Math.max(0, link.nominalBitsPerSecond * link.effectiveRatio);
}

/**
 * Finds a physical link path through the declared topology. It never invents
 * a direct connection when no path exists.
 */
export function findTransferPath(hardware: HardwareProfile, fromId: ID, toId: ID): TransferPath | null {
  if (fromId === toId) {
    return {
      fromId,
      toId,
      linkIds: [],
      endpointIds: [fromId],
      bottleneckBitsPerSecond: Number.POSITIVE_INFINITY,
      latencyUs: 0,
      contentionDomainIds: [],
      quality: 'exact',
    };
  }
  const adjacency = new Map<ID, Array<{ link: Link; other: ID; forward: boolean }>>();
  for (const link of hardware.links) {
    const a = adjacency.get(link.fromId) ?? [];
    a.push({ link, other: link.toId, forward: true });
    adjacency.set(link.fromId, a);
    const b = adjacency.get(link.toId) ?? [];
    b.push({ link, other: link.fromId, forward: false });
    adjacency.set(link.toId, b);
  }
  const queue: Array<{ node: ID; links: Link[]; endpoints: ID[] }> = [{ node: fromId, links: [], endpoints: [fromId] }];
  const visited = new Set<ID>([fromId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.node === toId) {
      let bottleneck = Number.POSITIVE_INFINITY;
      let latency = 0;
      const domains = new Set<ID>();
      for (const link of current.links) {
        bottleneck = Math.min(bottleneck, effectiveBps(link));
        latency += link.latencyUs;
        domains.add(link.contentionDomainId);
      }
      return {
        fromId,
        toId,
        linkIds: current.links.map((l) => l.id),
        endpointIds: current.endpoints,
        bottleneckBitsPerSecond: Number.isFinite(bottleneck) ? bottleneck : 0,
        latencyUs: latency,
        contentionDomainIds: [...domains],
        quality: 'assumption',
      };
    }
    for (const edge of adjacency.get(current.node) ?? []) {
      if (visited.has(edge.other)) continue;
      visited.add(edge.other);
      queue.push({
        node: edge.other,
        links: [...current.links, edge.link],
        endpoints: [...current.endpoints, edge.other],
      });
    }
  }
  return null;
}

/**
 * Serialized shared-domain transfer scheduler. It intentionally models
 * contention conservatively: concurrent transfers sharing a domain queue
 * behind each other instead of receiving infinite bandwidth.
 */
export class TransferScheduler {
  private readonly hardware: HardwareProfile;
  private readonly domainBusyUntil = new Map<string, Microseconds>();
  private readonly domainCapacityBps = new Map<ID, number>();
  private readonly domainDuplex = new Map<ID, 'full' | 'half'>();

  constructor(hardware: HardwareProfile) {
    this.hardware = hardware;
    for (const domain of hardware.contentionDomains) {
      this.domainCapacityBps.set(domain.id, domain.capacityBitsPerSecond);
      this.domainDuplex.set(domain.id, domain.duplex);
      // A full-duplex domain has independent busy windows per direction;
      // a half-duplex domain serializes both directions on one window.
      this.domainBusyUntil.set(domain.id, 0);
      this.domainBusyUntil.set(`${domain.id}:f`, 0);
      this.domainBusyUntil.set(`${domain.id}:r`, 0);
    }
  }

  path(fromId: ID, toId: ID): TransferPath | null {
    return findTransferPath(this.hardware, fromId, toId);
  }

  /**
   * Contention keys used by a path. Full-duplex domains get one key per
   * direction so opposite-direction transfers can overlap; half-duplex
   * domains keep a single key.
   */
  private domainUses(path: TransferPath): Array<{ domainId: ID; key: string }> {
    const links = new Map(this.hardware.links.map((link) => [link.id, link]));
    const uses: Array<{ domainId: ID; key: string }> = [];
    const seen = new Set<string>();
    path.linkIds.forEach((linkId, index) => {
      const link = links.get(linkId);
      if (!link) return;
      const forward = link.fromId === path.endpointIds[index];
      const key =
        this.domainDuplex.get(link.contentionDomainId) === 'full'
          ? `${link.contentionDomainId}:${forward ? 'f' : 'r'}`
          : link.contentionDomainId;
      if (seen.has(key)) return;
      seen.add(key);
      uses.push({ domainId: link.contentionDomainId, key });
    });
    return uses;
  }

  schedule(
    bytes: number,
    fromId: ID,
    toId: ID,
    nowUs: Microseconds,
    measuredBytesPerSecond?: number,
  ): ScheduledTransfer | null {
    const path = this.path(fromId, toId);
    if (!path) return null;
    if (path.linkIds.length === 0) {
      return { startUs: nowUs, endUs: nowUs, durationUs: 0, bytes, path, blockedByDomainIds: [] };
    }
    const uses = this.domainUses(path);
    let startUs = nowUs;
    const blockedByDomainIds: ID[] = [];
    for (const use of uses) {
      const busy = this.domainBusyUntil.get(use.key) ?? 0;
      if (busy > startUs) {
        startUs = busy;
        if (!blockedByDomainIds.includes(use.domainId)) blockedByDomainIds.push(use.domainId);
      }
    }
    let bottleneck = path.bottleneckBitsPerSecond;
    for (const use of uses) {
      const capacity = this.domainCapacityBps.get(use.domainId);
      if (capacity !== undefined) bottleneck = Math.min(bottleneck, capacity);
    }
    // A calibrated end-to-end bandwidth may be lower than the nominal link;
    // never let it raise the rate above the physical bottleneck.
    if (measuredBytesPerSecond !== undefined && measuredBytesPerSecond > 0) {
      bottleneck = Math.min(bottleneck, measuredBytesPerSecond * 8);
    }
    const payloadBytesPerSecond = bottleneck / 8;
    const transferUs = payloadBytesPerSecond > 0 ? Math.ceil((bytes / payloadBytesPerSecond) * 1_000_000) : 0;
    const durationUs = Math.max(1, transferUs + Math.ceil(path.latencyUs));
    const endUs = startUs + durationUs;
    for (const use of uses) {
      this.domainBusyUntil.set(use.key, endUs);
    }
    return {
      startUs,
      endUs,
      durationUs,
      bytes,
      path:
        measuredBytesPerSecond !== undefined && measuredBytesPerSecond > 0
          ? { ...path, quality: 'calibrated' }
          : path,
      blockedByDomainIds,
    };
  }

  reset(): void {
    for (const id of this.domainBusyUntil.keys()) this.domainBusyUntil.set(id, 0);
  }
}
