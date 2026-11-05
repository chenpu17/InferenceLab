import { useMemo, type ReactNode } from 'react';
import { useLabStore } from '../store/useLabStore';
import { buildTimeline, type TimelineSegment, type TimelineTrack } from '../lib/timeline';
import { formatClock, formatCount, formatUs, percentOf } from '../lib/format';

function TrackRow({
  track,
  totalUs,
  virtualTimeUs,
  selectedEventIndex,
  onSeekTime,
}: {
  track: TimelineTrack;
  totalUs: number;
  virtualTimeUs: number;
  selectedEventIndex: number;
  onSeekTime: (us: number) => void;
}): ReactNode {
  const visibleLanes = Math.min(track.laneCount, 4);
  const hidden = track.laneCount - visibleLanes;
  const seekBy = (delta: number) => onSeekTime(Math.min(totalUs, Math.max(0, virtualTimeUs + delta)));
  return (
    <div className="tl-track">
      <div className="tl-track-label">
        <i style={{ background: track.color }} />
        <span>{track.label}</span>
        <b className="mono">{track.segments.length}</b>
      </div>
      <div
        className="tl-track-body"
        style={{ height: `${Math.max(1, visibleLanes) * 16 + 6}px` }}
        role="group"
        tabIndex={0}
        aria-label={`${track.label} 轨道；方向键按 1% 步进，Home/End 跳到首尾`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
          onSeekTime(ratio * totalUs);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            seekBy(-totalUs * 0.01);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            seekBy(totalUs * 0.01);
          } else if (event.key === 'Home') {
            event.preventDefault();
            onSeekTime(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            onSeekTime(totalUs);
          }
        }}
      >
        {track.segments.slice(0, 500).map((segment) => (
          <Segment
            key={segment.id}
            segment={segment}
            totalUs={totalUs}
            lane={segment.lane % visibleLanes}
            active={selectedEventIndex >= segment.eventIndex && selectedEventIndex <= segment.eventIndex + 1}
            onSelect={(target) => onSeekTime((target.startUs + target.endUs) / 2)}
          />
        ))}
        <span className="tl-playhead" style={{ left: `${percentOf(virtualTimeUs, totalUs) * 100}%` }} />
        {hidden > 0 && <span className="tl-more">+{hidden} lanes</span>}
      </div>
    </div>
  );
}

function Segment({
  segment,
  totalUs,
  lane,
  active,
  onSelect,
}: {
  segment: TimelineSegment;
  totalUs: number;
  lane: number;
  active: boolean;
  onSelect: (segment: TimelineSegment) => void;
}): ReactNode {
  const left = percentOf(segment.startUs, totalUs) * 100;
  const width = Math.max(0.15, percentOf(segment.endUs - segment.startUs, totalUs) * 100);
  return (
    <button
      className={`tl-seg tl-${segment.track} ${segment.tone ?? ''} ${active ? 'active' : ''}`}
      style={{ left: `${left}%`, width: `${width}%`, top: `${4 + lane * 16}px` }}
      title={`${segment.label}\n${formatUs(segment.startUs)} → ${formatUs(segment.endUs)}`}
      data-start-us={segment.startUs}
      data-end-us={segment.endUs}
      data-track={segment.track}
      data-request-id={segment.requestId ?? ''}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(segment);
      }}
    >
      <span>{segment.label}</span>
    </button>
  );
}

export function Timeline(): ReactNode {
  const activeRun = useLabStore((state) => state.activeRun);
  const eventIndex = useLabStore((state) => state.eventIndex);
  const virtualTimeUs = useLabStore((state) => state.virtualTimeUs);
  const playing = useLabStore((state) => state.playing);
  const speed = useLabStore((state) => state.playbackSpeed);
  const reducedMotion = useLabStore((state) => state.reducedMotion);
  const drawers = useLabStore((state) => state.drawers);
  const togglePlay = useLabStore((state) => state.togglePlay);
  const stepEvent = useLabStore((state) => state.stepEvent);
  const stepIteration = useLabStore((state) => state.stepIteration);
  const resetPlayback = useLabStore((state) => state.resetPlayback);
  const setVirtualTime = useLabStore((state) => state.setVirtualTime);
  const setSpeed = useLabStore((state) => state.setSpeed);
  const toggleDrawer = useLabStore((state) => state.toggleDrawer);

  const model = useMemo(() => {
    if (!activeRun) return null;
    const built = buildTimeline(activeRun.events);
    performance.mark('il-timeline-built');
    return built;
  }, [activeRun]);

  if (drawers.timeline) {
    return (
      <div className="timeline timeline-collapsed" data-testid="timeline">
        <button className="tl-expand" onClick={() => toggleDrawer('timeline')}>
          ▴ 展开 Timeline
          {activeRun && <span className="mono"> · {activeRun.events.length} events</span>}
        </button>
      </div>
    );
  }

  if (!activeRun || !model) {
    return (
      <div className="timeline timeline-empty" data-testid="timeline">
        <div className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">TIMELINE</span>
            <b>事件日志回放</b>
          </div>
          <div className="tl-controls">
            <button className="tl-icon" disabled title="运行后可播放">▶</button>
            <button className="tl-icon" disabled title="运行后可单步">▸|</button>
            <button className="tl-icon tl-collapse" onClick={() => toggleDrawer('timeline')} title="收起 Timeline">▾</button>
          </div>
        </div>
        <p className="tl-empty-text">
          点击 Header 的“运行实验”后，这里按事件日志播放 Prefill、Decode、Transfer 与等待区间；动画只来自事件，不伪造进度。
        </p>
      </div>
    );
  }

  const totalEvents = activeRun.events.length;
  const atEnd = eventIndex >= totalEvents;
  const pct = percentOf(virtualTimeUs, model.totalUs);

  return (
    <div className="timeline" data-testid="timeline" data-total-us={model.totalUs}>
      <div className="tl-head">
        <div className="tl-title">
          <span className="eyebrow">TIMELINE · EVENT LOG</span>
          <b className="mono">{formatClock(virtualTimeUs)}</b>
          <span className="tl-meta mono">
            event {formatCount(eventIndex)} / {formatCount(totalEvents)} · end {formatUs(activeRun.endedAtUs)}
          </span>
        </div>
        <div className="tl-controls">
          <button className="tl-icon" onClick={resetPlayback} title="回到起点" aria-label="回到起点">↺</button>
          <button
            className="tl-icon tl-play"
            onClick={togglePlay}
            title={reducedMotion ? '已开启减少动态：仍可手动单步' : playing ? '暂停' : '播放'}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? '❚❚' : atEnd ? '↺▶' : '▶'}
          </button>
          <button className="tl-icon" onClick={stepEvent} title="单步事件" aria-label="单步事件">▸|</button>
          <button className="tl-icon" onClick={stepIteration} title="跳到下一个调度迭代" aria-label="下一个调度迭代">⇥</button>
          <select
            className="tl-speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value) as typeof speed)}
            title="播放速度"
            aria-label="播放速度"
          >
            <option value={0.25}>0.25×</option>
            <option value={1}>1×</option>
            <option value={4}>4×</option>
            <option value={16}>16×</option>
          </select>
          <button className="tl-icon tl-collapse" onClick={() => toggleDrawer('timeline')} title="收起 Timeline">▾</button>
        </div>
      </div>

      <div
        className="tl-scrub"
        role="slider"
        tabIndex={0}
        aria-label="虚拟时间游标"
        aria-valuemin={0}
        aria-valuemax={model.totalUs}
        aria-valuenow={Math.round(virtualTimeUs)}
        aria-valuetext={formatUs(virtualTimeUs)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
          setVirtualTime(ratio * model.totalUs);
        }}
        onKeyDown={(event) => {
          const seekBy = (delta: number) => setVirtualTime(Math.min(model.totalUs, Math.max(0, virtualTimeUs + delta)));
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            seekBy(-model.totalUs * 0.01);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            seekBy(model.totalUs * 0.01);
          } else if (event.key === 'PageUp') {
            event.preventDefault();
            seekBy(-model.totalUs * 0.1);
          } else if (event.key === 'PageDown') {
            event.preventDefault();
            seekBy(model.totalUs * 0.1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            setVirtualTime(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            setVirtualTime(model.totalUs);
          }
        }}
      >
        <span className="tl-scrub-fill" style={{ width: `${pct * 100}%` }} />
        <span className="tl-scrub-head" style={{ left: `${pct * 100}%` }} />
        <span className="tl-scrub-label mono">{formatUs(virtualTimeUs)}</span>
      </div>

      <div className="tl-tracks">
        {model.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            totalUs={model.totalUs}
            virtualTimeUs={virtualTimeUs}
            selectedEventIndex={eventIndex}
            onSeekTime={setVirtualTime}
          />
        ))}
      </div>

      <div className="tl-foot">
        <span className="tl-legend"><i className="tl-prefill" /> prefill</span>
        <span className="tl-legend"><i className="tl-decode" /> decode</span>
        <span className="tl-legend"><i className="tl-transfer" /> transfer</span>
        <span className="tl-legend"><i className="tl-wait" /> wait / blocked</span>
        <span className="tl-foot-note">
          点击轨道跳转时间，点击区间跳到该区间内的时刻；回放由 ReplayIndex 重建，不修改已冻结的 Run。
        </span>
      </div>
    </div>
  );
}
