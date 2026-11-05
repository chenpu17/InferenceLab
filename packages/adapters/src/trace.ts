import type {
  CalibrationCurve,
  ObservedRequestMetrics,
  PrefixBlockSpec,
  RequestSpec,
  Scenario,
  ValidationIssue,
} from '@inferencelab/core';

export interface TraceImportResult {
  ok: boolean;
  requests: RequestSpec[];
  issues: ValidationIssue[];
  /** True when the file carries per-request event timestamps, not just counts. */
  hasEventDetails: boolean;
  observedRequestCount: number;
  source: string;
}

interface RawRequest {
  id?: unknown;
  arrivalUs?: unknown;
  atUs?: unknown;
  promptTokens?: unknown;
  outputTokens?: unknown;
  prefixBlocks?: unknown;
  observed?: unknown;
  events?: unknown;
}

/** Bounded collections keep a malformed import from exhausting the tab. */
export const TRACE_LIMITS = {
  maxRequests: 10_000,
  maxEventsPerRequest: 10_000,
  maxPrefixBlocksPerRequest: 100_000,
} as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function parseObserved(value: unknown, path: string, issues: ValidationIssue[]): ObservedRequestMetrics | undefined {
  if (!isObject(value)) return undefined;
  const observed: ObservedRequestMetrics = {};
  for (const key of ['ttftUs', 'tpotUs', 'finishUs'] as const) {
    if (value[key] === undefined) continue;
    const parsed = numberField(value[key]);
    if (parsed === null) {
      issues.push({
        severity: 'warning',
        code: 'TRACE_OBSERVED_INVALID',
        path: `${path}.observed.${key}`,
        message: `observed.${key} 不是非负数，已忽略。`,
      });
    } else {
      observed[key] = parsed;
    }
  }
  if (typeof value.source === 'string') observed.source = value.source;
  return Object.keys(observed).length > 0 ? observed : undefined;
}

/**
 * Event-level timing is not consumed by the simulator yet, but claiming it
 * exists when every entry is malformed would overstate the trace's fidelity.
 * Only events with an explicit type and non-negative timestamp count.
 */
function parseEventDetails(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (value.length > TRACE_LIMITS.maxEventsPerRequest) {
    issues.push({
      severity: 'warning',
      code: 'TRACE_EVENTS_TRUNCATED',
      path: `${path}.events`,
      message: `事件数 ${value.length} 超过上限 ${TRACE_LIMITS.maxEventsPerRequest}，仅检查前 ${TRACE_LIMITS.maxEventsPerRequest} 条。`,
    });
  }
  let usable = 0;
  value.slice(0, TRACE_LIMITS.maxEventsPerRequest).forEach((event, index) => {
    const time = isObject(event)
      ? numberField(event.timeUs ?? event.atUs ?? event.timestampUs)
      : null;
    const type = isObject(event) ? event.type ?? event.kind : null;
    if (time === null || typeof type !== 'string' || type.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'TRACE_EVENT_INVALID',
        path: `${path}.events[${index}]`,
        message: 'event 需要非负 timeUs/atUs/timestampUs 与字符串 type/kind，已忽略该条。',
      });
      return;
    }
    usable += 1;
  });
  return usable > 0;
}

function parsePrefixBlocks(value: unknown, path: string, issues: ValidationIssue[]): PrefixBlockSpec[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length > TRACE_LIMITS.maxPrefixBlocksPerRequest) {
    issues.push({
      severity: 'warning',
      code: 'TRACE_PREFIX_TRUNCATED',
      path: `${path}.prefixBlocks`,
      message: `前缀块数 ${value.length} 超过上限 ${TRACE_LIMITS.maxPrefixBlocksPerRequest}，仅保留前 ${TRACE_LIMITS.maxPrefixBlocksPerRequest} 个。`,
    });
  }
  const blocks: PrefixBlockSpec[] = [];
  value.slice(0, TRACE_LIMITS.maxPrefixBlocksPerRequest).forEach((item, index) => {
    if (!isObject(item) || typeof item.hash !== 'string' || numberField(item.tokenCount) === null) {
      issues.push({
        severity: 'warning',
        code: 'TRACE_PREFIX_INVALID',
        path: `${path}.prefixBlocks[${index}]`,
        message: '前缀块需要 hash 与非负 tokenCount，已忽略该块。',
      });
      return;
    }
    blocks.push({ hash: item.hash, tokenCount: Number(item.tokenCount) });
  });
  return blocks.length > 0 ? blocks : undefined;
}

/**
 * Standard project trace adapter. External vLLM/Ascend log parsers are
 * plugins: they must produce this shape before the UI consumes them.
 */
export function parseStandardTrace(input: unknown): TraceImportResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(input)) {
    return {
      ok: false,
      requests: [],
      issues: [
        {
          severity: 'error',
          code: 'TRACE_SCHEMA',
          path: '',
          message: 'Trace 必须是 JSON 对象。',
          suggestedFix: '使用 schemaVersion="1.0" 与 requests 数组。',
        },
      ],
      hasEventDetails: false,
      observedRequestCount: 0,
      source: 'unknown',
    };
  }
  if (input.schemaVersion !== '1.0') {
    issues.push({
      severity: 'error',
      code: 'TRACE_SCHEMA_VERSION',
      path: 'schemaVersion',
      message: '仅支持 schemaVersion="1.0"。',
    });
  }
  if (!Array.isArray(input.requests) || input.requests.length === 0) {
    issues.push({
      severity: 'error',
      code: 'TRACE_REQUESTS',
      path: 'requests',
      message: 'requests 必须是非空数组。',
    });
    return { ok: false, requests: [], issues, hasEventDetails: false, observedRequestCount: 0, source: 'unknown' };
  }
  if (input.requests.length > TRACE_LIMITS.maxRequests) {
    issues.push({
      severity: 'warning',
      code: 'TRACE_REQUESTS_TRUNCATED',
      path: 'requests',
      message: `请求数 ${input.requests.length} 超过上限 ${TRACE_LIMITS.maxRequests}，仅导入前 ${TRACE_LIMITS.maxRequests} 条。`,
    });
  }
  const requests: RequestSpec[] = [];
  let observedRequestCount = 0;
  let hasEventDetails = false;
  const seen = new Set<string>();
  (input.requests as RawRequest[]).slice(0, TRACE_LIMITS.maxRequests).forEach((raw, index) => {
    const path = `requests[${index}]`;
    if (!isObject(raw) || typeof raw.id !== 'string' || raw.id.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'TRACE_REQUEST_ID',
        path,
        message: '请求缺少 id，已跳过。',
      });
      return;
    }
    if (seen.has(raw.id)) {
      issues.push({
        severity: 'warning',
        code: 'TRACE_REQUEST_DUPLICATE',
        path,
        message: `请求 ID ${raw.id} 重复，已跳过。`,
      });
      return;
    }
    const rawArrival = raw.arrivalUs ?? raw.atUs;
    const arrival = rawArrival === undefined ? 0 : numberField(rawArrival);
    if (arrival === null) {
      issues.push({
        severity: 'warning',
        code: 'TRACE_ARRIVAL_INVALID',
        path: `${path}.arrivalUs`,
        message: `请求 ${raw.id} 的 arrivalUs/atUs 不是非负数，已跳过该请求。`,
      });
      return;
    }
    const promptTokens = numberField(raw.promptTokens);
    const outputTokens = numberField(raw.outputTokens);
    if (promptTokens === null || outputTokens === null) {
      issues.push({
        severity: 'warning',
        code: 'TRACE_TOKENS',
        path,
        message: `请求 ${raw.id} 缺少非负 promptTokens/outputTokens，已跳过。`,
      });
      return;
    }
    const observed = parseObserved(raw.observed, path, issues);
    if (observed) observedRequestCount += 1;
    if (parseEventDetails(raw.events, path, issues)) hasEventDetails = true;
    const spec: RequestSpec = {
      id: raw.id,
      atUs: Math.round(arrival),
      promptTokens: Math.round(promptTokens),
      outputTokens: Math.round(outputTokens),
    };
    const prefixBlocks = parsePrefixBlocks(raw.prefixBlocks, path, issues);
    if (prefixBlocks) spec.prefixBlocks = prefixBlocks;
    if (observed) spec.observed = observed;
    requests.push(spec);
    seen.add(raw.id);
  });
  if (requests.length === 0) {
    issues.push({
      severity: 'error',
      code: 'TRACE_EMPTY',
      path: 'requests',
      message: '没有可用的请求记录。',
    });
  }
  if (observedRequestCount > 0 && !hasEventDetails) {
    issues.push({
      severity: 'info',
      code: 'TRACE_INFERRED_STAGES',
      path: 'requests',
      message: 'Trace 只包含请求级观测值；Prefill/Decode 阶段时序仍由仿真推断，不显示为实测。',
    });
  }
  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    requests,
    issues,
    hasEventDetails,
    observedRequestCount,
    source: typeof input.source === 'string' ? input.source : 'standard-trace',
  };
}

export function applyTraceToScenario(scenario: Scenario, trace: TraceImportResult): Scenario {
  const next: Scenario = JSON.parse(JSON.stringify(scenario)) as Scenario;
  next.workload = { kind: 'trace', requests: trace.requests };
  next.assumptions = {
    ...next.assumptions,
    traceSource: trace.source,
    traceObservedRequests: trace.observedRequestCount,
    traceHasEventDetails: trace.hasEventDetails,
  };
  return next;
}

/** Convenience for demos/tests: wrap curves in the portable bundle shape. */
export function calibrationBundle(curves: CalibrationCurve[]): { schemaVersion: '1.0'; curves: CalibrationCurve[] } {
  return { schemaVersion: '1.0', curves };
}
