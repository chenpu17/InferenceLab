import { describe, expect, it } from 'vitest';
import type { HardwareProfile } from '../src/index.js';
import { TransferScheduler } from '../src/engine/linkScheduler.js';

function hundredGbpsHardware(): HardwareProfile {
  return {
    id: 'hw-fabric-test',
    version: '1',
    profileType: 'synthetic-toy',
    provenance: { kind: 'assumed' },
    nodes: [
      { id: 'node-p', cpuCores: 8, dramPoolId: 'dram-p' },
      { id: 'node-d', cpuCores: 8, dramPoolId: 'dram-d' },
    ],
    accelerators: [
      { id: 'gpu-p', nodeId: 'node-p', vendor: 'toy', family: 'test', hbmPoolId: 'hbm-p', computeResourceId: 'c-p', dmaResourceIds: [] },
      { id: 'gpu-d', nodeId: 'node-d', vendor: 'toy', family: 'test', hbmPoolId: 'hbm-d', computeResourceId: 'c-d', dmaResourceIds: [] },
    ],
    memoryPools: [
      { id: 'hbm-p', ownerId: 'gpu-p', kind: 'HBM', capacityBytes: 1_000_000_000, externalReservedBytes: 0, alignmentBytes: 256, readBytesPerSecond: { value: 1_000_000_000_000, evidence: { kind: 'assumed' } }, writeBytesPerSecond: { value: 1_000_000_000_000, evidence: { kind: 'assumed' } } },
      { id: 'hbm-d', ownerId: 'gpu-d', kind: 'HBM', capacityBytes: 1_000_000_000, externalReservedBytes: 0, alignmentBytes: 256, readBytesPerSecond: { value: 1_000_000_000_000, evidence: { kind: 'assumed' } }, writeBytesPerSecond: { value: 1_000_000_000_000, evidence: { kind: 'assumed' } } },
      { id: 'dram-p', ownerId: 'node-p', kind: 'DRAM', capacityBytes: 16_000_000_000, externalReservedBytes: 0, alignmentBytes: 256, readBytesPerSecond: { value: 1_000_000_000_000, evidence: { kind: 'assumed' } }, writeBytesPerSecond: { value: 1_000_000_000_000, evidence: { kind: 'assumed' } } },
      { id: 'dram-d', ownerId: 'node-d', kind: 'DRAM', capacityBytes: 16_000_000_000, externalReservedBytes: 0, alignmentBytes: 256, readBytesPerSecond: { value: 1_000_000_000_000, evidence: { kind: 'assumed' } }, writeBytesPerSecond: { value: 1_000_000_000_000, evidence: { kind: 'assumed' } } },
    ],
    links: [
      {
        id: 'fabric-pd',
        fromId: 'gpu-p',
        toId: 'gpu-d',
        kind: 'ETHERNET',
        nominalBitsPerSecond: 100 * 1e9,
        effectiveRatio: 1,
        latencyUs: 0,
        duplex: 'full',
        contentionDomainId: 'dom-fabric',
      },
      {
        id: 'fabric-p2',
        fromId: 'gpu-p',
        toId: 'gpu-d',
        kind: 'ETHERNET',
        nominalBitsPerSecond: 100 * 1e9,
        effectiveRatio: 1,
        latencyUs: 0,
        duplex: 'full',
        contentionDomainId: 'dom-fabric',
      },
    ],
    contentionDomains: [{ id: 'dom-fabric', capacityBitsPerSecond: 100 * 1e9, duplex: 'full', arbitration: 'serialized' }],
    resources: [
      { id: 'c-p', kind: 'compute', assumedTflops: 1 },
      { id: 'c-d', kind: 'compute', assumedTflops: 1 },
    ],
  };
}

describe('transfer scheduler', () => {
  it('converts 100 Gbps to 12.5 GB/s instead of 100 GB/s', () => {
    const scheduler = new TransferScheduler(hundredGbpsHardware());
    const path = scheduler.path('gpu-p', 'gpu-d')!;
    expect(path.bottleneckBitsPerSecond).toBe(100 * 1e9);
    const bytes = 1.25 * 1e9;
    const scheduled = scheduler.schedule(bytes, 'gpu-p', 'gpu-d', 0)!;
    expect(scheduled.durationUs).toBe(100_000);
    expect(bytes / (scheduled.durationUs / 1_000_000)).toBeCloseTo(12.5e9, 0);
  });

  it('serializes transfers sharing a contention domain so aggregate bandwidth stays bounded', () => {
    const scheduler = new TransferScheduler(hundredGbpsHardware());
    const bytes = 1.25 * 1e9;
    const first = scheduler.schedule(bytes, 'gpu-p', 'gpu-d', 0)!;
    const second = scheduler.schedule(bytes, 'gpu-p', 'gpu-d', 0)!;
    expect(second.startUs).toBe(first.endUs);
    expect(second.blockedByDomainIds).toContain('dom-fabric');
    expect(second.endUs).toBe(200_000);
    const aggregate = (bytes * 2) / (second.endUs / 1_000_000);
    expect(aggregate).toBeLessThanOrEqual(12.5e9);
  });

  it('lets opposite directions overlap on a full-duplex domain', () => {
    const scheduler = new TransferScheduler(hundredGbpsHardware());
    const bytes = 1.25 * 1e9;
    const forward = scheduler.schedule(bytes, 'gpu-p', 'gpu-d', 0)!;
    const reverse = scheduler.schedule(bytes, 'gpu-d', 'gpu-p', 0)!;
    expect(reverse.startUs).toBe(0);
    expect(reverse.blockedByDomainIds).toEqual([]);
    expect(reverse.endUs).toBe(forward.endUs);
  });

  it('serializes opposite directions on a half-duplex domain', () => {
    const hardware = hundredGbpsHardware();
    hardware.contentionDomains[0]!.duplex = 'half';
    const scheduler = new TransferScheduler(hardware);
    const bytes = 1.25 * 1e9;
    const forward = scheduler.schedule(bytes, 'gpu-p', 'gpu-d', 0)!;
    const reverse = scheduler.schedule(bytes, 'gpu-d', 'gpu-p', 0)!;
    expect(reverse.startUs).toBe(forward.endUs);
    expect(reverse.blockedByDomainIds).toContain('dom-fabric');
  });
});
