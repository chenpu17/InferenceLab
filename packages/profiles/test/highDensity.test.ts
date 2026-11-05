import { describe, expect, it } from 'vitest';
import { getProfileBundle, scenarioPresets } from '../src/index.js';
import { planScenario, runSimulation } from '@inferencelab/core';

describe('high density scenario', () => {
  it('plans and simulates 48 requests with 1K output tokens deterministically', () => {
    const preset = scenarioPresets.find((p) => p.id === 'high-density-demo')!;
    const bundle = getProfileBundle(preset.scenario);
    const plan = planScenario({ scenario: preset.scenario, ...bundle });
    expect(plan.feasibility).toBe('feasible');
    const started = performance.now();
    const first = runSimulation({ scenario: preset.scenario, ...bundle });
    const elapsed = performance.now() - started;
    const second = runSimulation({ scenario: preset.scenario, ...bundle });
    expect(first.events.length).toBe(second.events.length);
    expect(first.events.map((event) => `${event.type}:${event.timeUs}`)).toEqual(
      second.events.map((event) => `${event.type}:${event.timeUs}`),
    );
    expect(first.requests.filter((request) => request.status === 'FINISHED').length).toBe(48);
    console.log(`high-density: ${first.events.length} events, ended ${first.endedAtUs} us, sim ${elapsed.toFixed(0)} ms`);
  }, 120_000);
});
