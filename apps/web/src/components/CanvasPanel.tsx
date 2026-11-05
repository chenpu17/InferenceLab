import { useMemo, type ReactNode } from 'react';
import { useLabStore, type Lens } from '../store/useLabStore';
import { formatBytes, formatCount, formatUs } from '../lib/format';
import { entityLabel } from '../lib/entities';
import { TopologyLens } from './lenses/TopologyLens';
import { MemoryLens } from './lenses/MemoryLens';
import { SchedulerLens } from './lenses/SchedulerLens';
import { TransportLens } from './lenses/TransportLens';
import { MetricsLens } from './lenses/MetricsLens';
import { OnboardingDock } from './OnboardingDock';

const LENS_TITLE: Record<Lens, string> = {
  topology: '物理拓扑 · 并行部署',
  memory: 'HBM 与 KV · 双层账本',
  scheduler: '请求队列 · Token Budget',
  transport: '链路 · 传输 · 竞争域',
  metrics: '关键路径 · 证据与质量',
};

const LENS_WHY: Record<Lens, string> = {
  topology: '设备位置来自 Plan.resolvedRanks，TP 改变只重组组边界与 DP 副本，不移动物理卡。',
  memory: 'KV Pool 是 HBM 预算中的已预留段；Block 增长只改变内层 used/free，不重复增加外层 HBM 承诺。',
  scheduler: '预算按 max_num_batched_tokens 扣减；这是 vLLM V1 的机制子集，并非逐行复刻源码。',
  transport: '传输时长与共享竞争域来自 TransferScheduler；没有物理路径时不会凭空画连线。',
  metrics: '时间指标使用标注过的合成成本模型；输出 ≤1 token 时 TPOT 显示 N/A，不猜数字。',
};

function Kpi({
  name,
  value,
  unit,
  bottom,
  tone,
}: {
  name: string;
  value: ReactNode;
  unit?: string;
  bottom?: ReactNode;
  tone?: string;
}): ReactNode {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-name">{name}</div>
      <div className="kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {bottom && <div className="kpi-bottom">{bottom}</div>}
    </div>
  );
}

function metricValue(
  metrics: Array<{ key: string; value: number | null }> | undefined,
  key: string,
): number | null {
  return metrics?.find((metric) => metric.key === key)?.value ?? null;
}

export function CanvasPanel(): ReactNode {
  const activeLens = useLabStore((state) => state.activeLens);
  const mode = useLabStore((state) => state.mode);
  const traceInfo = useLabStore((state) => state.traceInfo);
  const calibrationCurves = useLabStore((state) => state.calibrationCurves);
  const scenario = useLabStore((state) => state.scenario);
  const plan = useLabStore((state) => state.planPreview);
  const planStatus = useLabStore((state) => state.planStatus);
  const runError = useLabStore((state) => state.runError);
  const runErrorCode = useLabStore((state) => state.runErrorCode);
  const dismissRunError = useLabStore((state) => state.dismissRunError);
  const activeRun = useLabStore((state) => state.activeRun);
  const viewState = useLabStore((state) => state.viewState);
  const selectedEntity = useLabStore((state) => state.selectedEntity);
  const focusPath = useLabStore((state) => state.focusPath);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const clearFocus = useLabStore((state) => state.clearFocus);
  const showLegend = useLabStore((state) => state.showLegend);
  const toggleLegend = useLabStore((state) => state.toggleLegend);
  const setLens = useLabStore((state) => state.setLens);

  const engines = viewState ? Object.values(viewState.engines) : [];
  const waiting = engines.reduce((sum, engine) => sum + engine.waiting.length, 0);
  const running = engines.reduce((sum, engine) => sum + engine.running.length, 0);
  const preemptions = activeRun?.metrics.find((metric) => metric.key === 'scheduler.preemptions')?.value ?? null;
  const transfers = useMemo(
    () => activeRun?.events.filter((event) => event.type === 'TRANSFER_STARTED') ?? [],
    [activeRun],
  );

  const tp = plan?.groups.find((group) => group.kind === 'TP');
  const tpSize = tp ? tp.memberRankIds.length : (scenario.deployment.logicalParallelism.tp ?? 1);

  const topKpis = (() => {
    switch (activeLens) {
      case 'topology':
        return (
          <>
            <Kpi
              name="加速卡总数"
              value={plan ? plan.totals.acceleratorCount : 'N/A'}
              unit={plan ? 'cards' : ''}
              bottom={plan ? `${plan.totals.nodeCount} nodes · Plan` : 'Plan 未生成'}
            />
            <Kpi name="TP Group Size" value={tpSize} bottom="Rank / group" />
            <Kpi
              name="DP Replicas"
              value={plan ? plan.totals.replicaCount : 'N/A'}
              bottom={plan ? 'Independent engines' : 'Plan 未生成'}
            />
            {plan?.pipeline && (
              <Kpi
                name="PP Stages"
                value={plan.pipeline.ppSize}
                bottom={`bubble ${(plan.pipeline.bubbleFraction * 100).toFixed(1)}% · assumption`}
                tone="assumption"
              />
            )}
            {plan?.sequenceParallel && (
              <Kpi
                name="SP Size"
                value={plan.sequenceParallel.spSize}
                bottom="reuses TP ranks · no extra devices"
                tone="assumption"
              />
            )}
            <Kpi
              name="模型适配状态"
              value={planStatus === 'ready' ? 'Feasible' : planStatus === 'unknown' ? 'Unknown' : planStatus === 'invalid' ? 'Invalid' : '…'}
              bottom={planStatus === 'unknown' ? '需真实 Profile 校准' : 'Plan 结构结论'}
              tone={planStatus === 'unknown' ? 'unknown' : planStatus === 'invalid' ? 'blocked' : undefined}
            />
          </>
        );
      case 'memory': {
        const rank = plan?.ranks[0];
        const kvUsed = engines.reduce((sum, engine) => sum + engine.kvPoolBytesUsed, 0);
        const kvPeak = metricValue(activeRun?.metrics, 'kv.peakBytes');
        const speculative = plan?.speculative;
        const speculativeSupported =
          speculative?.frameworkSupport === 'supported' || speculative?.frameworkSupport === 'partial';
        const kvReservationUnknown =
          !rank ||
          rank.kvQuality === 'unavailable' ||
          (rank.capacityQuality === 'unavailable' && rank.kvPoolReservedBytes === 0);
        return (
          <>
            <Kpi
              name="每卡 HBM 预算"
              value={formatBytes(rank?.hbmBudgetBytes ?? null)}
              bottom={rank ? '容量 × 利用率 − 外部预留' : 'Plan 未生成'}
            />
            <Kpi
              name="每卡 KV 预留"
              value={kvReservationUnknown ? 'N/A' : formatBytes(rank?.kvPoolReservedBytes ?? null)}
              bottom={
                !rank
                  ? 'Plan 未生成'
                  : kvReservationUnknown
                    ? rank.kvQuality === 'unavailable'
                      ? 'unknown · KV 布局不可计算'
                      : 'unknown · 容量不可计算'
                    : rank.capacityQuality === 'unavailable'
                      ? `${rank.maxKvBlocks} blocks · 显式 KV 预算（容量未验证）`
                      : `${rank.maxKvBlocks} blocks · block=${scenario.runtime.blockSize}`
              }
            />
            <Kpi name="KV 当前占用" value={activeRun ? formatBytes(kvUsed) : 'N/A'} bottom={activeRun ? 'Event replay @ T' : '运行后按事件更新'} />
            <Kpi name="KV 峰值" value={formatBytes(kvPeak)} bottom={kvPeak === null ? '需要 Run' : 'exact · 事件统计'} tone="kv" />
            {speculative && (
              <Kpi
                name={`${speculative.method.toUpperCase()} 期望加速`}
                value={speculativeSupported ? `${speculative.expectedDecodeSpeedup.toFixed(2)}×` : 'N/A'}
                bottom={
                  speculative.frameworkSupport === 'unknown'
                    ? 'unknown · 适配器未声明支持'
                    : speculative.frameworkSupport === 'unsupported'
                      ? 'unsupported · 适配器明确不支持'
                      : 'assumption · 接受率决定收益'
                }
                tone={speculativeSupported ? 'assumption' : 'unknown'}
              />
            )}
          </>
        );
      }
      case 'scheduler':
        return (
          <>
            <Kpi name="Running" value={activeRun ? running : 'N/A'} unit={activeRun ? 'seqs' : ''} bottom="当前调度迭代" />
            <Kpi name="Waiting" value={activeRun ? waiting : 'N/A'} unit={activeRun ? 'seqs' : ''} bottom="FCFS 等待队列" tone={waiting > 0 ? 'wait' : undefined} />
            <Kpi
              name="Token Budget"
              value={
                activeRun
                  ? engines[0]
                    ? `${engines[0].lastBudgetUsed ?? 0}/${engines[0].lastBudgetTotal ?? scenario.runtime.maxNumBatchedTokens}`
                    : 'N/A'
                  : scenario.runtime.maxNumBatchedTokens
              }
              bottom="max_num_batched_tokens"
            />
            <Kpi name="抢占次数" value={preemptions ?? (activeRun ? 0 : 'N/A')} bottom="recompute 策略" tone={preemptions ? 'blocked' : undefined} />
          </>
        );
      case 'transport': {
        const domains = activeRun?.events.filter((event) => event.type === 'TRANSFER_STARTED').flatMap((event) => event.detail.contentionDomainIds as string[] | undefined ?? []) ?? [];
        return (
          <>
            <Kpi
              name="已放置 Rank"
              value={plan ? plan.resolvedRanks.length : 'N/A'}
              unit={plan ? 'ranks' : ''}
              bottom={plan ? 'Plan.resolvedRanks' : 'Plan 未生成'}
            />
            <Kpi name="传输事件" value={transfers.length} unit="transfers" bottom={transfers.length > 0 ? '来自事件日志' : '当前 Run 无 KV 传输'} tone={transfers.length > 0 ? 'transfer' : undefined} />
            <Kpi name="竞争域" value={new Set(domains).size || 'N/A'} bottom="共享域串行调度" />
            <Kpi name="传输字节" value={formatBytes(metricValue(activeRun?.metrics, 'transfer.bytes'))} bottom="exact · 请求累计" tone="transfer" />
          </>
        );
      }
      case 'metrics':
        return (
          <>
            <Kpi
              name="完成 / 总数"
              value={
                activeRun
                  ? (() => {
                      const finished = metricValue(activeRun.metrics, 'requests.finished');
                      const total = metricValue(activeRun.metrics, 'requests.total');
                      return finished === null || total === null ? 'N/A' : `${finished}/${total}`;
                    })()
                  : 'N/A'
              }
              bottom="exact · 事件统计"
            />
            <Kpi name="TTFT P50" value={formatUs(metricValue(activeRun?.metrics, 'ttft.p50'))} bottom="assumption · 合成成本模型" tone="assumption" />
            <Kpi name="TPOT P50" value={formatUs(metricValue(activeRun?.metrics, 'tpot.p50'))} bottom="输出 ≤1 token 时为 N/A" tone="assumption" />
            <Kpi name="输出吞吐" value={metricValue(activeRun?.metrics, 'throughput.outputTokensPerSec') === null ? 'N/A' : (metricValue(activeRun?.metrics, 'throughput.outputTokensPerSec') ?? 0).toFixed(1)} unit="tok/s" bottom="assumption · 仿真窗口" tone="assumption" />
          </>
        );
      default:
        return null;
    }
  })();

  const focusOnLens = () => {
    if (activeLens === 'topology' && plan?.resolvedRanks[0]) {
      selectEntity({ kind: 'device', id: plan.resolvedRanks[0].acceleratorId }, { focus: true });
    } else if (activeLens === 'memory' && plan?.engines[0]) {
      selectEntity({ kind: 'engine', id: plan.engines[0].id }, { focus: true });
    } else if (activeLens === 'scheduler') {
      const request = activeRun?.requests.find((item) => item.status === 'WAITING' || item.status === 'PREEMPTED') ?? activeRun?.requests[0];
      if (request) selectEntity({ kind: 'request', id: request.id }, { focus: true });
    } else if (activeLens === 'transport' && activeRun) {
      const event = activeRun.events.find((item) => item.type === 'TRANSFER_STARTED');
      const linkId = event?.detail.linkIds as string[] | undefined;
      if (linkId?.[0]) selectEntity({ kind: 'link', id: linkId[0] }, { focus: true });
    } else if (activeLens === 'metrics' && activeRun?.metrics[0]) {
      selectEntity({ kind: 'metric', id: activeRun.metrics[0].key }, { focus: true });
    }
  };

  const breadcrumb = [...focusPath];
  if (selectedEntity && !breadcrumb.some((item) => item.kind === selectedEntity.kind && item.id === selectedEntity.id)) {
    breadcrumb.push(selectedEntity);
  }

  return (
    <section className="canvas-panel" aria-label="主观察画布">
      <div className="canvas-head">
        <div>
          <div className="eyebrow">OBSERVE / {activeLens.toUpperCase()}</div>
          <div className="canvas-title">{LENS_TITLE[activeLens]}</div>
          <div className="canvas-subtitle">{scenario.title}</div>
        </div>
        <div className="canvas-tools">
          <button
            className="tool-btn"
            onClick={() => {
              selectEntity(null);
              clearFocus();
            }}
            title="清除选择并回到全局视图"
          >
            ◎ 全局视图
          </button>
          <button className={`tool-btn ${showLegend ? 'active' : ''}`} onClick={toggleLegend} aria-pressed={showLegend}>
            ◉ 图例
          </button>
        </div>
      </div>

      {breadcrumb.length > 0 && (
        <div className="breadcrumb" aria-label="焦点路径">
          <button
            onClick={() => {
              selectEntity(null);
              clearFocus();
            }}
          >
            ALL
          </button>
          {breadcrumb.map((entity) => (
            <span key={`${entity.kind}:${entity.id}`} className="breadcrumb-item">
              <span aria-hidden="true">›</span>
              <button onClick={() => selectEntity(entity)}>{entityLabel(entity)}</button>
            </span>
          ))}
        </div>
      )}

      <div className="mobile-hint" role="note">
        建议桌面使用：窄屏只保证场景概览、参数说明与静态结果，编辑与回放体验不完整。
      </div>

      <div className="kpi-strip">{topKpis}</div>

      {mode === 'replay' && (
        <div className="trace-banner" role="status">
          <b>实测复盘</b>
          <span>
            {traceInfo
              ? `来源 ${traceInfo.source} · ${traceInfo.requests.length} 请求 · 观测值 ${traceInfo.observedRequestCount} 条${
                  traceInfo.hasEventDetails
                    ? ' · 检测到 events 字段，但当前不用于阶段时序'
                    : ' · 仅请求级观测，阶段时序仍为推断'
                }`
              : '未导入 Trace · 当前为仿真事件回放，不是实测数据'}
          </span>
        </div>
      )}
      {runError && (
        <div className="trace-banner run-error-banner" role="alert">
          <b>无法运行{runErrorCode ? ` · ${runErrorCode}` : ''}</b>
          <span>{runError}</span>
          <button className="btn small" onClick={dismissRunError}>
            关闭
          </button>
        </div>
      )}
      {calibrationCurves.length > 0 && (
        <div className="trace-banner calibration-banner" role="status">
          <b>校准曲线</b>
          <span>
            {activeRun?.calibration
              ? activeRun.calibration.note
              : `${calibrationCurves.length} 条已导入；仅匹配硬件/模型/框架/dtype/范围的指标会升级为 CALIBRATED。`}
          </span>
        </div>
      )}

      {showLegend && (
        <div className="legend-popover" role="dialog" aria-label="颜色图例">
          <div><i style={{ background: 'var(--compute)' }} /> Compute / Prefill</div>
          <div><i style={{ background: 'var(--kv)' }} /> KV / Decode / Ready</div>
          <div><i style={{ background: 'var(--transfer)' }} /> Transfer / DMA / P→D</div>
          <div><i style={{ background: 'var(--wait)' }} /> Queued / Wait</div>
          <div><i style={{ background: 'var(--blocked)' }} /> OOM / Blocked / Invalid</div>
          <div><i style={{ background: 'var(--unknown)' }} /> Unknown / Uncalibrated</div>
          <p>颜色永远辅以文字或图标；不单凭颜色编码状态。</p>
        </div>
      )}

      <div className="canvas-body">
        {activeLens === 'topology' && <TopologyLens />}
        {activeLens === 'memory' && <MemoryLens />}
        {activeLens === 'scheduler' && <SchedulerLens />}
        {activeLens === 'transport' && <TransportLens />}
        {activeLens === 'metrics' && <MetricsLens />}
      </div>

      <div className="why-bar">
        <span className="why-spark" aria-hidden="true">✦</span>
        <span>
          <b>{activeLens === 'topology' ? '机制解释' : '观察提示'}</b>　{LENS_WHY[activeLens]}
        </span>
        <button className="why-more" onClick={focusOnLens}>
          查看原因 →
        </button>
      </div>

      <OnboardingDock />

      {!activeRun && (
        <div className="canvas-hint">
          <span>当前是结构预览，未运行仿真。</span>
          <button onClick={() => setLens('topology')}>回到拓扑</button>
        </div>
      )}
      {activeRun && (
        <div className="canvas-quality-note" title="所有动画都来自冻结的事件日志">
          Replay · {formatCount(activeRun.events.length)} events · {formatUs(activeRun.endedAtUs)} virtual
        </div>
      )}
    </section>
  );
}
