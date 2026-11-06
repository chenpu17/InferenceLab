import type { SimEvent } from '@inferencelab/core';

export type TrackId = 'prefill' | 'decode' | 'transfer' | 'wait';

export interface TimelineSegment {
  id: string;
  track: TrackId;
  startUs: number;
  endUs: number;
  label: string;
  requestId?: string;
  engineId?: string;
  eventId: string;
  eventIndex: number;
  lane: number;
  tone?: 'normal' | 'blocked' | 'muted';
}

export interface TimelineTrack {
  id: TrackId;
  label: string;
  color: string;
  segments: TimelineSegment[];
  laneCount: number;
}

export interface TimelineModel {
  tracks: TimelineTrack[];
  totalUs: number;
}

const TRACK_META: Record<TrackId, { label: string; color: string }> = {
  prefill: { label: 'Prefill 计算', color: 'var(--compute)' },
  transfer: { label: 'KV / 传输', color: 'var(--transfer)' },
  decode: { label: 'Decode', color: 'var(--kv)' },
  wait: { label: '等待 / 阻塞', color: 'var(--blocked)' },
};

const COMPUTE_KIND_LABEL: Record<string, string> = {
  prefill: 'Prefill 计算',
  decode: 'Decode',
  mixed: '混合',
};

type RawSegment = Omit<TimelineSegment, 'lane'>;

function assignLanes(segments: RawSegment[], minVisualDurationUs: number): TimelineSegment[] {
  const laneEnds: number[] = [];
  const sorted = [...segments].sort((a, b) => a.startUs - b.startUs || a.endUs - b.endUs);
  return sorted.map((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.startUs);
    const visualEnd = Math.max(segment.endUs, segment.startUs + minVisualDurationUs);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(visualEnd);
    } else {
      laneEnds[lane] = visualEnd;
    }
    return { ...segment, lane };
  });
}

export function buildTimeline(events: SimEvent[]): TimelineModel {
  const raw: Record<TrackId, RawSegment[]> = { prefill: [], decode: [], transfer: [], wait: [] };

  const totalUs = events.reduce((max, event) => {
    const duration = Number(event.detail.durationUs ?? 0);
    return Math.max(max, event.timeUs + (Number.isFinite(duration) ? duration : 0));
  }, 0);
  // Segments narrower than 0.15% of the timeline are still drawn at that
  // width; give them separate lanes so their hit targets do not overlap.
  const minVisualDurationUs = Math.max(1, totalUs * 0.0015);

  const waitStart = new Map<string, { timeUs: number; eventId: string; eventIndex: number }>();

  events.forEach((event, index) => {
    const detail = event.detail;
    if (event.type === 'COMPUTE_STARTED') {
      const duration = Number(detail.durationUs ?? 0);
      const kind = String(detail.kind ?? 'mixed');
      if (duration <= 0) return;
      const base = {
        startUs: event.timeUs,
        endUs: event.timeUs + duration,
        label: `${COMPUTE_KIND_LABEL[kind] ?? kind} · ${String(detail.engineId ?? event.targetId ?? '')}`,
        engineId: String(detail.engineId ?? event.targetId ?? ''),
        eventId: event.id,
        eventIndex: index,
      };
      if (kind === 'prefill' || kind === 'mixed') {
        raw.prefill.push({ ...base, id: `${event.id}-p`, track: 'prefill' });
      }
      if (kind === 'decode' || kind === 'mixed') {
        raw.decode.push({ ...base, id: `${event.id}-d`, track: 'decode' });
      }
      return;
    }
    if (event.type === 'TRANSFER_STARTED') {
      const duration = Number(detail.durationUs ?? 0);
      raw.transfer.push({
        id: event.id,
        track: 'transfer',
        startUs: event.timeUs,
        endUs: event.timeUs + duration,
        label: `${String(detail.fromId ?? '?')} → ${String(detail.toId ?? '?')}`,
        requestId: event.requestId,
        eventId: event.id,
        eventIndex: index,
      });
      return;
    }
    if (event.type === 'REQUEST_QUEUED' || event.type === 'REQUEST_PREEMPTED') {
      if (event.requestId) {
        waitStart.set(event.requestId, { timeUs: event.timeUs, eventId: event.id, eventIndex: index });
      }
      return;
    }
    if (
      (event.type === 'REQUEST_SCHEDULED' || event.type === 'REQUEST_FINISHED' || event.type === 'REQUEST_REJECTED') &&
      event.requestId
    ) {
      const start = waitStart.get(event.requestId);
      if (start && event.timeUs > start.timeUs) {
        raw.wait.push({
          id: `${start.eventId}-${event.id}`,
          track: 'wait',
          startUs: start.timeUs,
          endUs: event.timeUs,
          label: event.type === 'REQUEST_REJECTED' ? '阻塞 / 拒绝' : '等待',
          requestId: event.requestId,
          eventId: start.eventId,
          eventIndex: start.eventIndex,
          tone: event.type === 'REQUEST_REJECTED' ? 'blocked' : 'normal',
        });
      }
      waitStart.delete(event.requestId);
    }
  });

  // Requests still waiting when the run ends.
  for (const [requestId, start] of waitStart) {
    const end = events[events.length - 1]?.timeUs ?? start.timeUs;
    if (end > start.timeUs) {
      raw.wait.push({
        id: `${start.eventId}-end`,
        track: 'wait',
        startUs: start.timeUs,
        endUs: end,
        label: '结束时仍在等待',
        requestId,
        eventId: start.eventId,
        eventIndex: start.eventIndex,
        tone: 'muted',
      });
    }
  }

  const tracks = (Object.keys(TRACK_META) as TrackId[]).map((id) => {
    const segments = assignLanes(raw[id], minVisualDurationUs);
    return {
      id,
      label: TRACK_META[id].label,
      color: TRACK_META[id].color,
      segments,
      laneCount: Math.max(1, ...segments.map((segment) => segment.lane + 1)),
    };
  });

  return { tracks, totalUs: Math.max(1, totalUs) };
}

const NICE_STEP_FACTORS = [1, 2, 2.5, 5, 10];

function niceStepAtLeast(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const factor = NICE_STEP_FACTORS.find((candidate) => candidate >= normalized) ?? 10;
  return factor * magnitude;
}

/** Returns five to seven readable ticks, including both timeline endpoints. */
export function buildTimelineTicks(totalUs: number): number[] {
  if (!Number.isFinite(totalUs) || totalUs <= 0) return [0];

  // Prefer six ticks, then seven or five when a rounded step would otherwise
  // overlap the endpoint. The final interval may be shorter than the others.
  for (const intervals of [5, 6, 4]) {
    const step = niceStepAtLeast(totalUs / intervals);
    const ticks = Array.from({ length: intervals }, (_, index) =>
      Number((index * step).toPrecision(12)),
    );
    if (ticks[ticks.length - 1]! < totalUs) {
      // A rounded tick very close to the endpoint produces overlapping labels.
      // Drop that penultimate tick while retaining the exact run duration.
      const rounded = ticks[ticks.length - 1]!;
      return rounded > totalUs * 0.9 ? [...ticks.slice(0, -1), totalUs] : [...ticks, totalUs];
    }
  }

  return Array.from({ length: 6 }, (_, index) => (totalUs * index) / 5);
}

export function nextEventOfType(events: SimEvent[], fromIndex: number, type: SimEvent['type']): number {
  for (let i = Math.max(0, fromIndex + 1); i < events.length; i += 1) {
    if (events[i]!.type === type) return i;
  }
  return events.length;
}
