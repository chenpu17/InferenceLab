import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLabStore } from '../store/useLabStore';
import { buildTimeline, buildTimelineTicks, type TimelineSegment, type TimelineTrack } from '../lib/timeline';
import { formatClock, formatCount, formatUs, percentOf } from '../lib/format';
import { useI18n } from '../i18n';
import { Icon } from './ui/Icon';

type SeekEvent = ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>;

function usePointerSeek(totalUs: number, onSeekTime: (us: number) => void) {
  const pointerIdRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const seek = useCallback(
    (event: SeekEvent) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
      onSeekTime(ratio * totalUs);
    },
    [onSeekTime, totalUs],
  );

  const finish = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerIdRef.current = event.pointerId;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      seek(event);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current === event.pointerId) seek(event);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      seek(event);
      finish(event);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => {
      suppressClickRef.current = false;
      finish(event);
    },
    onClick: (event: ReactMouseEvent<HTMLDivElement>) => {
      // Pointer activation already performed the seek; suppress its trailing click
      // (especially after a drag), while retaining click-only assistive activation.
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      seek(event);
    },
  };
}

function TrackRow({
  track,
  channel,
  totalUs,
  virtualTimeUs,
  selectedEventIndex,
  onSeekTime,
}: {
  track: TimelineTrack;
  channel: number;
  totalUs: number;
  virtualTimeUs: number;
  selectedEventIndex: number;
  onSeekTime: (us: number) => void;
}): ReactNode {
  const { t, lt } = useI18n();
  const pointerSeek = usePointerSeek(totalUs, onSeekTime);
  const visibleLanes = Math.min(track.laneCount, 4);
  const hidden = track.laneCount - visibleLanes;
  const seekBy = (delta: number) => onSeekTime(Math.min(totalUs, Math.max(0, virtualTimeUs + delta)));
  const selectSegment = useCallback(
    (target: TimelineSegment) => onSeekTime((target.startUs + target.endUs) / 2),
    [onSeekTime],
  );
  return (
    <div className="tl-track">
      <div className="tl-track-label">
        <i style={{ background: track.color }} />
        <span className="timeline-channel">
          {lt(track.label)}
          <span className="channel-code mono">CH {String(channel).padStart(2, '0')}</span>
        </span>
        <b className="mono">{track.segments.length}</b>
      </div>
      <div
        className="tl-track-body"
        style={{ height: `${Math.max(1, visibleLanes) * 16 + 6}px` }}
        role="group"
        tabIndex={0}
        aria-label={t('{label} 轨道；方向键按 1% 步进，Home/End 跳到首尾', { label: lt(track.label) })}
        {...pointerSeek}
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
        <TrackSegments
          track={track}
          totalUs={totalUs}
          visibleLanes={visibleLanes}
          selectedEventIndex={selectedEventIndex}
          onSelect={selectSegment}
        />
        <span className="tl-playhead" style={{ left: `${percentOf(virtualTimeUs, totalUs) * 100}%` }} />
        {hidden > 0 && <span className="tl-more">{t('+{count} 条泳道', { count: hidden })}</span>}
      </div>
    </div>
  );
}

const Segment = memo(function Segment({
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
  const { lt } = useI18n();
  const left = percentOf(segment.startUs, totalUs) * 100;
  const width = Math.max(0.15, percentOf(segment.endUs - segment.startUs, totalUs) * 100);
  return (
    <button
      className={`tl-seg tl-${segment.track} ${segment.tone ?? ''} ${active ? 'active' : ''}`}
      style={{ left: `${left}%`, width: `${width}%`, top: `${4 + lane * 16}px` }}
      title={`${lt(segment.label)}\n${formatUs(segment.startUs)} → ${formatUs(segment.endUs)}`}
      data-start-us={segment.startUs}
      data-end-us={segment.endUs}
      data-track={segment.track}
      data-request-id={segment.requestId ?? ''}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(segment);
      }}
    >
      <span>{lt(segment.label)}</span>
    </button>
  );
});

const TrackSegments = memo(function TrackSegments({
  track,
  totalUs,
  visibleLanes,
  selectedEventIndex,
  onSelect,
}: {
  track: TimelineTrack;
  totalUs: number;
  visibleLanes: number;
  selectedEventIndex: number;
  onSelect: (segment: TimelineSegment) => void;
}): ReactNode {
  const { t } = useI18n();
  const hiddenSegments = Math.max(0, track.segments.length - 500);
  return (
    <>
      {track.segments.slice(0, 500).map((segment) => (
        <Segment
          key={segment.id}
          segment={segment}
          totalUs={totalUs}
          lane={segment.lane % visibleLanes}
          active={selectedEventIndex >= segment.eventIndex && selectedEventIndex <= segment.eventIndex + 1}
          onSelect={onSelect}
        />
      ))}
      {hiddenSegments > 0 && <span className="queue-more tl-more">{t('+{count} 条', { count: hiddenSegments })}</span>}
    </>
  );
});

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
  const { t } = useI18n();

  const model = useMemo(() => {
    if (!activeRun) return null;
    const built = buildTimeline(activeRun.events);
    performance.mark('il-timeline-built');
    return built;
  }, [activeRun]);
  const scrubPointerSeek = usePointerSeek(model?.totalUs ?? 1, setVirtualTime);

  if (drawers.timeline) {
    return (
      <div className="timeline timeline-collapsed" data-testid="timeline">
        <button className="tl-expand" onClick={() => toggleDrawer('timeline')}>
          <Icon name="collapse" size={14} /> {t('展开 Timeline')}
          {activeRun && <span className="mono"> · {t('{count} 个事件', { count: activeRun.events.length })}</span>}
        </button>
      </div>
    );
  }

  if (!activeRun || !model) {
    return (
      <div className="timeline timeline-empty" data-testid="timeline">
        <div className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">{t('时间线')}</span>
            <b>{t('事件日志回放')}</b>
          </div>
          <div className="tl-controls">
            <button className="tl-icon" disabled title={t('运行后可播放')} aria-label={t('运行后可播放')}><Icon name="play" size={14} /></button>
            <button className="tl-icon" disabled title={t('运行后可单步')} aria-label={t('运行后可单步')}><Icon name="step" size={14} /></button>
            <button className="tl-icon tl-collapse" onClick={() => toggleDrawer('timeline')} title={t('收起 Timeline')} aria-label={t('收起 Timeline')}><Icon name="expand" size={14} /></button>
          </div>
        </div>
        <p className="tl-empty-text">
          {t('点击 Header 的“运行实验”后，这里按事件日志播放 Prefill、Decode、Transfer 与等待区间；动画只来自事件，不伪造进度。')}
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
          <span className="eyebrow">
            {t('时间线')}
            <span className="tl-eyebrow-long"> · {t('事件日志')}</span>
          </span>
          <b className="mono">{formatClock(virtualTimeUs)}</b>
          <span className="tl-meta mono">
            <span className="tl-meta-events">
              {t('事件 {current} / {total}', { current: formatCount(eventIndex), total: formatCount(totalEvents) })}
            </span>
            <span className="tl-meta-end"> · {t('结束 {time}', { time: formatUs(activeRun.endedAtUs) })}</span>
          </span>
        </div>
        <div className="tl-controls">
          <button className="tl-icon" onClick={resetPlayback} title={t('回到起点')} aria-label={t('回到起点')}><Icon name="reset" size={14} /></button>
          <button
            className="tl-icon tl-play"
            onClick={togglePlay}
            title={reducedMotion ? t('已开启减少动态：仍可手动单步') : playing ? t('暂停') : t('播放')}
            aria-label={playing ? t('暂停') : t('播放')}
          >
            <Icon name={playing ? 'pause' : atEnd ? 'reset' : 'play'} size={14} />
          </button>
          <button className="tl-icon" onClick={stepEvent} title={t('单步事件')} aria-label={t('单步事件')}><Icon name="step" size={14} /></button>
          <button className="tl-icon" onClick={stepIteration} title={t('跳到下一个调度迭代')} aria-label={t('下一个调度迭代')}><Icon name="next" size={14} /></button>
          <select
            className="tl-speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value) as typeof speed)}
            title={t('播放速度')}
            aria-label={t('播放速度')}
          >
            <option value={0.25}>0.25×</option>
            <option value={1}>1×</option>
            <option value={4}>4×</option>
            <option value={16}>16×</option>
          </select>
          <button className="tl-icon tl-collapse" onClick={() => toggleDrawer('timeline')} title={t('收起 Timeline')} aria-label={t('收起 Timeline')}><Icon name="expand" size={14} /></button>
        </div>
      </div>

      <div
        className="tl-scrub"
        role="slider"
        tabIndex={0}
        aria-label={t('虚拟时间游标')}
        aria-valuemin={0}
        aria-valuemax={model.totalUs}
        aria-valuenow={Math.round(virtualTimeUs)}
        aria-valuetext={formatUs(virtualTimeUs)}
        {...scrubPointerSeek}
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

      <div className="timeline-ruler" role="group" aria-label={t('时间刻度')}>
        {buildTimelineTicks(model.totalUs).map((tick) => (
          <span
            key={tick}
            className="timeline-ruler-mark"
            style={{ left: `${percentOf(tick, model.totalUs) * 100}%` }}
          >
            <span className="mono">{formatUs(tick)}</span>
          </span>
        ))}
      </div>

      <div className="tl-tracks">
        {model.tracks.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            channel={index + 1}
            totalUs={model.totalUs}
            virtualTimeUs={virtualTimeUs}
            selectedEventIndex={eventIndex}
            onSeekTime={setVirtualTime}
          />
        ))}
      </div>

      <div className="tl-foot">
        <span className="tl-legend"><i className="tl-prefill" /> {t('Prefill 计算')}</span>
        <span className="tl-legend"><i className="tl-decode" /> Decode</span>
        <span className="tl-legend"><i className="tl-transfer" /> {t('KV / 传输')}</span>
        <span className="tl-legend"><i className="tl-wait" /> {t('等待 / 阻塞')}</span>
        <span className="tl-foot-note">
          {t('点击或拖拽轨道跳转时间，点击区间跳到该区间内的时刻；回放由 ReplayIndex 重建，不修改已冻结的 Run。')}
        </span>
        <span className="shortcut-hint">
          {t('Space 播放/暂停 · ←/→ 单事件 · Shift+←/→ 10 事件 · 1–5 切换 Lens')}
        </span>
      </div>
    </div>
  );
}
