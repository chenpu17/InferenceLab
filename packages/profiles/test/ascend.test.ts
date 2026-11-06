import { describe, expect, it } from 'vitest';
import {
  TransferScheduler,
  findTransferPath,
  planScenario,
  runSimulation,
} from '@inferencelab/core';
import {
  createAscend910C384Hardware,
  createAscend950DT64Hardware,
  getProfileBundle,
  getScenarioPreset,
} from '../src/index.js';

const GB = 1_000_000_000;

function inputsFor(id: string) {
  const preset = getScenarioPreset(id);
  if (!preset) throw new Error(`missing preset ${id}`);
  return { scenario: preset.scenario, ...getProfileBundle(preset.scenario) };
}

describe('Ascend hardware profiles', () => {
  it('models the 384-NPU Atlas 900 A3 SuperPoD with per-NPU UB domains', () => {
    const hardware = createAscend910C384Hardware();
    expect(hardware.label).toBe('Ascend A3 · 910C × 384');
    expect(hardware.profileType).toBe('hardware-vendor-spec');
    expect(hardware.nodes).toHaveLength(48);
    expect(hardware.accelerators).toHaveLength(384);

    const first = hardware.accelerators[0]!;
    const hbm = hardware.memoryPools.find((pool) => pool.id === first.hbmPoolId)!;
    expect(hbm.capacityBytes).toBe(128 * GB);
    expect(hbm.readBytesPerSecond.value).toBe(3.2e12);
    const compute = hardware.resources.find((resource) => resource.id === first.computeResourceId)!;
    expect(compute.assumedTflops).toBe(800);

    const ubLinks = hardware.links.filter((link) => link.kind === 'UB');
    expect(ubLinks).toHaveLength(384);
    expect(ubLinks[0]!.nominalBitsPerSecond).toBe(392 * GB * 8);
    const ubDomains = new Set(ubLinks.map((link) => link.contentionDomainId));
    expect(ubDomains.size).toBe(384);
  });

  it('models one 64-NPU Ascend 950DT rack with FP8 peak and 144 GB HBM', () => {
    const hardware = createAscend950DT64Hardware();
    expect(hardware.label).toBe('Ascend 950DT · 64-NPU rack');
    expect(hardware.nodes).toHaveLength(8);
    expect(hardware.accelerators).toHaveLength(64);

    const first = hardware.accelerators[0]!;
    const hbm = hardware.memoryPools.find((pool) => pool.id === first.hbmPoolId)!;
    expect(hbm.capacityBytes).toBe(144 * GB);
    expect(hbm.readBytesPerSecond.value).toBe(4e12);
    const compute = hardware.resources.find((resource) => resource.id === first.computeResourceId)!;
    expect(compute.assumedTflops).toBe(1000);

    const ubLinks = hardware.links.filter((link) => link.kind === 'UB');
    expect(ubLinks).toHaveLength(64);
    expect(ubLinks[0]!.nominalBitsPerSecond).toBe(1e12 * 8);
    expect(ubLinks[0]!.latencyUs).toBe(0.2);
    expect(new Set(ubLinks.map((link) => link.contentionDomainId)).size).toBe(64);
  });

  it('does not serialize transfers from different source NPUs', () => {
    const hardware = createAscend910C384Hardware();
    const [sourceA, sourceB, targetA, targetB] = [
      hardware.accelerators[0]!,
      hardware.accelerators[1]!,
      hardware.accelerators[383]!,
      hardware.accelerators[382]!,
    ];
    const path = findTransferPath(hardware, sourceA.id, targetA.id)!;
    expect(path.linkIds).toHaveLength(2);
    expect(new Set(path.contentionDomainIds).size).toBe(2);

    const scheduler = new TransferScheduler(hardware);
    const a = scheduler.schedule(4 * GB, sourceA.id, targetA.id, 0)!;
    const b = scheduler.schedule(4 * GB, sourceB.id, targetB.id, 0)!;
    expect(a.startUs).toBe(0);
    expect(b.startUs).toBe(0);

    const sameSource = scheduler.schedule(4 * GB, sourceA.id, targetB.id, 0)!;
    expect(sameSource.startUs).toBe(a.endUs);
    expect(sameSource.blockedByDomainIds).toContain(`dom-ub-${sourceA.id}`);
  });
});

describe('Ascend scenario presets', () => {
  it('plans 384 ranks with 24 engines and 48 EP8 groups', () => {
    const plan = planScenario(inputsFor('ascend-910c-384-moe-ep'));
    expect(plan.feasibility).toBe('feasible');
    expect(plan.resolvedRanks).toHaveLength(384);
    expect(plan.engines).toHaveLength(24);
    expect(plan.expertPlacement?.epSize).toBe(8);
    expect(plan.expertPlacement?.expertsPerRank).toBe(8);
    const epGroups = plan.groups.filter((group) => group.kind === 'EP');
    expect(epGroups).toHaveLength(48);
    expect(epGroups.every((group) => group.memberRankIds.length === 8)).toBe(true);
  });

  it('runs the 384-NPU MoE preset to completion', () => {
    const result = runSimulation(inputsFor('ascend-910c-384-moe-ep'));
    expect(result.requests).toHaveLength(48);
    expect(result.requests.every((request) => request.status === 'FINISHED')).toBe(true);
  });

  it('runs the 64-NPU PD/MLA/MTP preset and emits KV transfers', () => {
    const inputs = inputsFor('ascend-950dt-64-pd-mla-mtp');
    const plan = planScenario(inputs);
    expect(plan.feasibility).toBe('feasible');
    expect(plan.resolvedRanks).toHaveLength(64);
    expect(plan.engines.filter((engine) => engine.role === 'prefill')).toHaveLength(4);
    expect(plan.engines.filter((engine) => engine.role === 'decode')).toHaveLength(4);
    expect(plan.speculative?.method).toBe('mtp');

    const result = runSimulation(inputs);
    const transfers = result.events.filter(
      (event) => event.type === 'TRANSFER_STARTED' && event.detail.kind === 'PD_KV_TRANSFER',
    );
    expect(transfers.length).toBeGreaterThan(0);
    expect(result.requests.every((request) => request.status === 'FINISHED')).toBe(true);
  });
});
