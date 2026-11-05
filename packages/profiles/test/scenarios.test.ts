import { describe, expect, it } from 'vitest';
import {
  planScenario,
  runSimulation,
  validateScenarioSemantics,
  validateScenarioStructure,
} from '@inferencelab/core';
import {
  getProfileBundle,
  getScenarioPreset,
  scenarioPresets,
  type ScenarioPreset,
} from '../src/index.js';

function planFor(preset: ScenarioPreset) {
  const bundle = getProfileBundle(preset.scenario);
  return {
    bundle,
    plan: planScenario({ scenario: preset.scenario, ...bundle }),
  };
}

describe('scenario presets', () => {
  it('all presets are structurally valid and reference existing profiles', () => {
    for (const preset of scenarioPresets) {
      const structural = validateScenarioStructure(preset.scenario);
      expect(structural.ok, `${preset.id} structure`).toBe(true);
      const bundle = getProfileBundle(preset.scenario);
      const issues = validateScenarioSemantics(preset.scenario, {
        getHardware: () => bundle.hardware,
        getModel: () => bundle.model,
        getFramework: () => bundle.framework,
      });
      expect(
        issues.filter((i) => i.severity === 'error'),
        `${preset.id}: ${issues.map((i) => i.code).join(',')}`,
      ).toEqual([]);
    }
  });

  it('marks the Ascend/GLM template as unknown, not feasible', () => {
    const preset = getScenarioPreset('ascend-a3-glm53-template')!;
    const { bundle, plan } = planFor(preset);
    expect(plan.feasibility).toBe('unknown');
    expect(plan.limitations.some((l) => l.includes('SFA') || l.includes('KV'))).toBe(true);
    expect(() =>
      runSimulation({ scenario: preset.scenario, ...bundle }),
    ).toThrow(/unknown/);
  });

  it('plans the 32 GPU TP16 x DP2 preset with two engines', () => {
    const preset = getScenarioPreset('toy-32gpu-tp16-dp2')!;
    const { plan } = planFor(preset);
    expect(plan.feasibility).toBe('feasible');
    expect(plan.engines).toHaveLength(2);
    expect(plan.totals.acceleratorCount).toBe(32);
    expect(plan.totals.replicaCount).toBe(2);
    expect(plan.ranks.every((r) => r.maxKvBlocks > 0)).toBe(true);
  });

  it('runs the budget-8 golden case with A=6 / B=2 in the first iteration', () => {
    const preset = getScenarioPreset('budget-8-demo')!;
    const { bundle } = planFor(preset);
    const result = runSimulation({ scenario: preset.scenario, ...bundle });
    const firstTick = result.events.find((e) => e.type === 'SCHEDULE_TICK')!;
    const scheduled = result.events.filter(
      (e) => e.type === 'REQUEST_SCHEDULED' && e.timeUs === firstTick.timeUs,
    );
    expect(scheduled.map((e) => [e.requestId, e.detail.prefillTokens])).toEqual([
      ['A', 6],
      ['B', 2],
    ]);
    expect(result.requests.every((r) => r.status === 'FINISHED')).toBe(true);
  });

  it('hits the shared prefix in the prefix-cache preset', () => {
    const preset = getScenarioPreset('prefix-cache-demo')!;
    const { bundle } = planFor(preset);
    const result = runSimulation({ scenario: preset.scenario, ...bundle });
    const bLookup = result.events.find(
      (e) => e.type === 'PREFIX_LOOKUP_DONE' && e.requestId === 'B',
    )!;
    expect(bLookup.detail.hitTokens).toBe(32);
    const b = result.requests.find((r) => r.id === 'B')!;
    expect(b.cachedInputTokens).toBe(32);
    expect(b.computedPrefillTokens).toBe(32);
  });

  it('runs all agent turns with sticky conversation routing', () => {
    const preset = getScenarioPreset('agent-demo')!;
    const { bundle } = planFor(preset);
    const result = runSimulation({ scenario: preset.scenario, ...bundle });
    expect(result.requests).toHaveLength(6);
    expect(result.requests.every((r) => r.status === 'FINISHED')).toBe(true);
    for (const conversation of ['conv-0', 'conv-1']) {
      const turns = result.requests.filter((r) => r.conversationId === conversation);
      expect(turns.map((r) => r.turnIndex)).toEqual([0, 1, 2]);
      expect(new Set(turns.map((r) => r.engineId)).size).toBe(1);
    }
  });

  it('plans MoE expert sharding structurally', () => {
    const preset = getScenarioPreset('moe-ep-demo')!;
    const { plan } = planFor(preset);
    expect(plan.feasibility).toBe('feasible');
    expect(plan.groups.some((g) => g.kind === 'EP')).toBe(true);
    expect(plan.ranks.every((r) => r.weightBytes > 0)).toBe(true);
  });

  it('plans PD groups without reusing accelerators', () => {
    const preset = getScenarioPreset('pd-demo')!;
    const { plan } = planFor(preset);
    expect(plan.feasibility).toBe('feasible');
    expect(plan.groups.some((g) => g.kind === 'PD')).toBe(true);
    expect(plan.engines.filter((e) => e.role === 'prefill')).toHaveLength(1);
    expect(plan.engines.filter((e) => e.role === 'decode')).toHaveLength(1);
    const accelerators = plan.resolvedRanks.map((r) => r.acceleratorId);
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });
});
