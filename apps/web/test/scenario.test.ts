import { describe, expect, it } from 'vitest';
import { getScenarioPreset } from '@inferencelab/profiles';
import { isPdScenario, withHardware, withMixedTp } from '../src/lib/scenario';

function preset(id: string) {
  const found = getScenarioPreset(id);
  if (!found) throw new Error(`missing preset ${id}`);
  return structuredClone(found.scenario);
}

describe('topology editing', () => {
  it('preserves PP and SP when TP changes', () => {
    const scenario = preset('pp-sp-demo');
    const result = withMixedTp(scenario, 2);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
    expect(result.scenario.deployment.logicalParallelism.pp).toBe(2);
    expect(result.scenario.runtime.spSize).toBe(2);
    expect(result.scenario.deployment.placement.ranks).toHaveLength(4);
  });

  it('preserves PCP and DCP when TP changes', () => {
    const scenario = preset('cp-demo');
    const result = withMixedTp(scenario, 2);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
    expect(result.scenario.runtime.pcpSize).toBe(2);
    expect(result.scenario.runtime.dcpSize).toBe(2);
    expect(result.scenario.deployment.logicalParallelism.pcp).toBe(2);
    expect(result.scenario.deployment.logicalParallelism.dcp).toBe(2);
    expect(result.scenario.deployment.placement.ranks).toHaveLength(4);
  });

  it('resets EP explicitly when the new rank layout cannot hold its groups', () => {
    const scenario = preset('moe-ep-demo');
    const result = withMixedTp(scenario, 1);
    expect(result.issues.some((issue) => issue.code === 'TOPOLOGY_ADVANCED_RESET')).toBe(true);
    expect(result.scenario.runtime.enableExpertParallel).toBe(false);
    expect(result.scenario.deployment.logicalParallelism.ep ?? 1).toBe(1);
    expect(
      result.scenario.deployment.placement.ranks.every((rank) => !rank.epGroupIds?.length),
    ).toBe(true);
  });

  it('keeps PD engines and host cache when switching hardware', () => {
    const scenario = preset('pd-demo');
    expect(isPdScenario(scenario)).toBe(true);
    const mixedEdit = withMixedTp(scenario, 2);
    expect(mixedEdit.scenario).toBe(scenario);
    expect(mixedEdit.issues.some((issue) => issue.severity === 'error')).toBe(true);
    scenario.deployment.kvTransfer = {
      ...scenario.deployment.kvTransfer,
      strategy: 'PD_HOST_STAGING',
      hostCacheBytes: 123_456_789,
    };
    const result = withHardware(scenario, 'hw-toy-32gpu');
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(false);
    const next = result.scenario;
    expect(next.hardwareProfileId).toBe('hw-toy-32gpu');
    expect(next.deployment.engines.some((engine) => engine.role === 'prefill')).toBe(true);
    expect(next.deployment.engines.some((engine) => engine.role === 'decode')).toBe(true);
    expect(next.deployment.kvTransfer?.strategy).toBe('PD_HOST_STAGING');
    expect(next.deployment.kvTransfer?.hostCacheBytes).toBe(123_456_789);
  });
});
