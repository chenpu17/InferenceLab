import { describe, expect, it } from 'vitest';
import type { Scenario } from '@inferencelab/core';
import { applyTraceToScenario, parseStandardTrace, TRACE_LIMITS } from '../src/trace.js';

describe('standard trace adapter', () => {
  it('maps requests and preserves explicit observed metrics', () => {
    const result = parseStandardTrace({
      schemaVersion: '1.0',
      source: 'unit-test',
      requests: [
        { id: 'r1', arrivalUs: 0, promptTokens: 128, outputTokens: 16, observed: { ttftUs: 1200, tpotUs: 80 } },
        { id: 'r2', atUs: 500, promptTokens: 64, outputTokens: 4 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.requests).toHaveLength(2);
    expect(result.observedRequestCount).toBe(1);
    expect(result.requests[0]!.observed?.ttftUs).toBe(1200);
    expect(result.hasEventDetails).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'TRACE_INFERRED_STAGES')).toBe(true);
  });

  it('rejects malformed traces instead of inventing requests', () => {
    const result = parseStandardTrace({ schemaVersion: '1.0', requests: [{ promptTokens: 1 }] });
    expect(result.ok).toBe(false);
    expect(result.requests).toHaveLength(0);
  });

  it('does not coerce an invalid arrival time to zero', () => {
    const result = parseStandardTrace({
      schemaVersion: '1.0',
      requests: [{ id: 'bad', arrivalUs: -5, promptTokens: 16, outputTokens: 2 }],
    });
    expect(result.ok).toBe(false);
    expect(result.requests).toHaveLength(0);
    expect(result.issues.some((issue) => issue.code === 'TRACE_ARRIVAL_INVALID')).toBe(true);
  });

  it('only reports event details when event entries are usable', () => {
    const malformed = parseStandardTrace({
      schemaVersion: '1.0',
      requests: [{ id: 'r1', arrivalUs: 0, promptTokens: 16, outputTokens: 2, events: [{ type: 'x' }] }],
    });
    expect(malformed.hasEventDetails).toBe(false);
    expect(malformed.issues.some((issue) => issue.code === 'TRACE_EVENT_INVALID')).toBe(true);

    const valid = parseStandardTrace({
      schemaVersion: '1.0',
      requests: [
        {
          id: 'r1',
          arrivalUs: 0,
          promptTokens: 16,
          outputTokens: 2,
          events: [{ type: 'PREFILL_START', timeUs: 0 }],
        },
      ],
    });
    expect(valid.hasEventDetails).toBe(true);
  });

  it('bounds oversized imports instead of importing every record', () => {
    const requests = Array.from({ length: TRACE_LIMITS.maxRequests + 5 }, (_, index) => ({
      id: `r${index}`,
      arrivalUs: 0,
      promptTokens: 1,
      outputTokens: 1,
    }));
    const result = parseStandardTrace({ schemaVersion: '1.0', requests });
    expect(result.requests).toHaveLength(TRACE_LIMITS.maxRequests);
    expect(result.issues.some((issue) => issue.code === 'TRACE_REQUESTS_TRUNCATED')).toBe(true);
  });

  it('applies a trace to a scenario without upgrading inferred stages', () => {
    const parsed = parseStandardTrace({
      schemaVersion: '1.0',
      requests: [{ id: 'r1', arrivalUs: 0, promptTokens: 16, outputTokens: 2 }],
    });
    const scenario: Scenario = {
      schemaVersion: '1.0',
      id: 's',
      title: 's',
      seed: 1,
      accuracyTier: 'discrete-event',
      hardwareProfileId: 'h',
      modelProfileId: 'm',
      frameworkProfileId: 'f',
      deployment: { engines: [], placement: { ranks: [] }, logicalParallelism: {} },
      runtime: {
        maxModelLen: 4096,
        maxNumSeqs: 8,
        maxNumBatchedTokens: 8192,
        blockSize: 16,
        enableChunkedPrefill: true,
        enablePrefixCaching: true,
        preemptionPolicy: 'recompute',
      },
      workload: { kind: 'fixed', count: 1, promptTokens: 16, outputTokens: 2, atUs: 0 },
      assumptions: {},
    };
    const next = applyTraceToScenario(structuredClone(scenario), parsed);
    expect(next.workload.kind).toBe('trace');
    expect(next.assumptions.traceObservedRequests).toBe(0);
    expect(next.assumptions.traceHasEventDetails).toBe(false);
  });
});
