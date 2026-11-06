import { describe, expect, it } from 'vitest';
import { runSimulation, type SimulationResult } from '@inferencelab/core';
import { frameworkProfiles, hardwareProfiles, modelProfiles, scenarioPresets } from '@inferencelab/profiles';
import { getRunIndex } from '../src/lib/runIndex';

function makeResult(presetId: string): SimulationResult {
  const scenario = structuredClone(scenarioPresets.find((preset) => preset.id === presetId)!.scenario);
  return runSimulation({
    scenario,
    hardware: hardwareProfiles.find((profile) => profile.id === scenario.hardwareProfileId)!,
    model: modelProfiles.find((profile) => profile.id === scenario.modelProfileId)!,
    framework: frameworkProfiles[0]!,
  });
}

describe('RunIndex', () => {
  it('is cached per frozen run and preserves request history boundaries', () => {
    const result = makeResult('toy-4gpu-tp4-basic');
    const index = getRunIndex(result);
    const request = result.requests[0]!;
    const entity = { kind: 'request' as const, id: request.id };

    expect(getRunIndex(result)).toBe(index);
    expect(index.requestsById.get(request.id)).toBe(request);

    for (const eventIndex of [0, 1, Math.floor(result.events.length / 2), result.events.length]) {
      const expected = result.events
        .map((event, eventIndex) => ({ event, index: eventIndex }))
        .filter(({ event, index }) => index <= eventIndex && event.requestId === request.id)
        .slice(-6)
        .reverse();
      expect(index.recentEvents(entity, eventIndex)).toEqual(expected);
    }
    expect(index.recentEvents(entity, -1)).toEqual([]);
  });

  it('indexes transfers by their original request and link membership', () => {
    const result = makeResult('pd-demo');
    const index = getRunIndex(result);
    const transfer = index.transfers[0]!;
    const linkIds = transfer.detail.linkIds as string[];

    expect(index.transfers).toEqual(result.events.filter((event) => event.type === 'TRANSFER_STARTED'));
    expect(index.transferByRequest.get(transfer.requestId!)).toBe(transfer);
    expect(index.transfersByLink.get(linkIds[0]!)).toEqual(
      result.events.filter(
        (event) => event.type === 'TRANSFER_STARTED' && (event.detail.linkIds as string[]).includes(linkIds[0]!),
      ),
    );
  });
});
