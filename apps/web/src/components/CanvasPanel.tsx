import { useMemo, type ReactNode } from 'react';
import { useLabStore, type Lens } from '../store/useLabStore';
import { formatBytes, formatCount, formatUs } from '../lib/format';
import { entityLabel } from '../lib/entities';
import { getRunIndex } from '../lib/runIndex';
import { TopologyLens } from './lenses/TopologyLens';
import { MemoryLens } from './lenses/MemoryLens';
import { SchedulerLens } from './lenses/SchedulerLens';
import { TransportLens } from './lenses/TransportLens';
import { MetricsLens } from './lenses/MetricsLens';
import { OnboardingDock } from './OnboardingDock';
import { useI18n } from '../i18n';

const LENS_NAME: Record<Lens, string> = {
  topology: '拓扑',
  memory: '显存',
  scheduler: '调度',
  transport: '传输',
  metrics: '指标',
};

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
  const { t, lt } = useI18n();

  const engines = viewState ? Object.values(viewState.engines) : [];
  const waiting = engines.reduce((sum, engine) => sum + engine.waiting.length, 0);
  const running = engines.reduce((sum, engine) => sum + engine.running.length, 0);
  const preemptions = activeRun?.metrics.find((metric) => metric.key === 'scheduler.preemptions')?.value ?? null;
  const transfers = useMemo(
    () => activeRun ? getRunIndex(activeRun).transfers : [],
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
              name={t('加速卡总数')}
              value={plan ? plan.totals.acceleratorCount : 'N/A'}
              unit={plan ? t('卡') : ''}
              bottom={
                plan
                  ? t('{count} 节点 · Plan', { count: plan.totals.nodeCount })
                  : t('Plan 未生成')
              }
            />
            <Kpi name={t('TP 组规模')} value={tpSize} bottom={t('Rank / 组')} />
            <Kpi
              name={t('DP 副本')}
              value={plan ? plan.totals.replicaCount : 'N/A'}
              bottom={plan ? t('独立引擎') : t('Plan 未生成')}
            />
            {plan?.pipeline && (
              <Kpi
                name={t('PP Stage 数')}
                value={plan.pipeline.ppSize}
                bottom={t('气泡 {bubble}% · 假设', {
                  bubble: (plan.pipeline.bubbleFraction * 100).toFixed(1),
                })}
                tone="assumption"
              />
            )}
            {plan?.sequenceParallel && (
              <Kpi
                name={t('SP 规模')}
                value={plan.sequenceParallel.spSize}
                bottom={t('复用 TP Rank · 不新增设备')}
                tone="assumption"
              />
            )}
            <Kpi
              name={t('模型适配状态')}
              value={
                planStatus === 'ready'
                  ? t('可行')
                  : planStatus === 'unknown'
                    ? t('未知')
                    : planStatus === 'invalid'
                      ? t('无效')
                      : '…'
              }
              bottom={planStatus === 'unknown' ? t('需真实 Profile 校准') : t('Plan 结构结论')}
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
              name={t('每卡 HBM 预算')}
              value={formatBytes(rank?.hbmBudgetBytes ?? null)}
              bottom={rank ? t('容量 × 利用率 − 外部预留') : t('Plan 未生成')}
            />
            <Kpi
              name={t('每卡 KV 预留')}
              value={kvReservationUnknown ? 'N/A' : formatBytes(rank?.kvPoolReservedBytes ?? null)}
              bottom={
                !rank
                  ? t('Plan 未生成')
                  : kvReservationUnknown
                    ? rank.kvQuality === 'unavailable'
                      ? t('unknown · KV 布局不可计算')
                      : t('unknown · 容量不可计算')
                    : rank.capacityQuality === 'unavailable'
                      ? t('{count} blocks · 显式 KV 预算（容量未验证）', { count: rank.maxKvBlocks })
                      : t('{count} 个 Block · block={size}', {
                          count: rank.maxKvBlocks,
                          size: scenario.runtime.blockSize,
                        })
              }
            />
            <Kpi
              name={t('KV 当前占用')}
              value={activeRun ? formatBytes(kvUsed) : 'N/A'}
              bottom={activeRun ? t('事件回放 @ T') : t('运行后按事件更新')}
            />
            <Kpi name={t('KV 峰值')} value={formatBytes(kvPeak)} bottom={kvPeak === null ? t('需要 Run') : t('exact · 事件统计')} tone="kv" />
            {speculative && (
              <Kpi
                name={t('{method} 期望加速', { method: speculative.method.toUpperCase() })}
                value={speculativeSupported ? `${speculative.expectedDecodeSpeedup.toFixed(2)}×` : 'N/A'}
                bottom={
                  speculative.frameworkSupport === 'unknown'
                    ? t('unknown · 适配器未声明支持')
                    : speculative.frameworkSupport === 'unsupported'
                      ? t('unsupported · 适配器明确不支持')
                      : t('assumption · 接受率决定收益')
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
            <Kpi name={t('运行中')} value={activeRun ? running : 'N/A'} unit={activeRun ? t('序列') : ''} bottom={t('当前调度迭代')} />
            <Kpi name={t('等待中')} value={activeRun ? waiting : 'N/A'} unit={activeRun ? t('序列') : ''} bottom={t('FCFS 等待队列')} tone={waiting > 0 ? 'wait' : undefined} />
            <Kpi
              name={t('Token 预算')}
              value={
                activeRun
                  ? engines[0]
                    ? `${engines[0].lastBudgetUsed ?? 0}/${engines[0].lastBudgetTotal ?? scenario.runtime.maxNumBatchedTokens}`
                    : 'N/A'
                  : scenario.runtime.maxNumBatchedTokens
              }
              bottom="max_num_batched_tokens"
            />
            <Kpi name={t('抢占次数')} value={preemptions ?? (activeRun ? 0 : 'N/A')} bottom={t('recompute 策略')} tone={preemptions ? 'blocked' : undefined} />
          </>
        );
      case 'transport': {
        const domains = transfers.flatMap((event) => event.detail.contentionDomainIds as string[] | undefined ?? []);
        return (
          <>
            <Kpi
              name={t('已放置 Rank')}
              value={plan ? plan.resolvedRanks.length : 'N/A'}
              unit={plan ? 'Rank' : ''}
              bottom={plan ? t('Plan 解析后的 Rank') : t('Plan 未生成')}
            />
            <Kpi name={t('传输事件')} value={transfers.length} unit={t('次')} bottom={transfers.length > 0 ? t('来自事件日志') : t('当前 Run 无 KV 传输')} tone={transfers.length > 0 ? 'transfer' : undefined} />
            <Kpi name={t('竞争域')} value={new Set(domains).size || 'N/A'} bottom={t('共享域串行调度')} />
            <Kpi name={t('传输字节')} value={formatBytes(metricValue(activeRun?.metrics, 'transfer.bytes'))} bottom={t('exact · 请求累计')} tone="transfer" />
          </>
        );
      }
      case 'metrics':
        return (
          <>
            <Kpi
              name={t('完成 / 总数')}
              value={
                activeRun
                  ? (() => {
                      const finished = metricValue(activeRun.metrics, 'requests.finished');
                      const total = metricValue(activeRun.metrics, 'requests.total');
                      return finished === null || total === null ? 'N/A' : `${finished}/${total}`;
                    })()
                  : 'N/A'
              }
              bottom={t('exact · 事件统计')}
            />
            <Kpi name="TTFT P50" value={formatUs(metricValue(activeRun?.metrics, 'ttft.p50'))} bottom={t('assumption · 合成成本模型')} tone="assumption" />
            <Kpi name="TPOT P50" value={formatUs(metricValue(activeRun?.metrics, 'tpot.p50'))} bottom={t('输出 ≤1 token 时为 N/A')} tone="assumption" />
            <Kpi name={t('输出吞吐')} value={metricValue(activeRun?.metrics, 'throughput.outputTokensPerSec') === null ? 'N/A' : (metricValue(activeRun?.metrics, 'throughput.outputTokensPerSec') ?? 0).toFixed(1)} unit="tok/s" bottom={t('assumption · 仿真窗口')} tone="assumption" />
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
      const event = transfers[0];
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
    <section className="canvas-panel" aria-label={t('主观察画布')}>
      <div className="canvas-head">
        <div>
          <div className="eyebrow">{t('观察')} / {t(LENS_NAME[activeLens])}</div>
          <div className="canvas-title">{t(LENS_TITLE[activeLens])}</div>
          <div className="canvas-subtitle">{lt(scenario.title)}</div>
        </div>
        <div className="canvas-tools">
          <button
            className="tool-btn"
            onClick={() => {
              selectEntity(null);
              clearFocus();
            }}
            title={t('清除选择并回到全局视图')}
          >
            ◎ {t('全局视图')}
          </button>
          <button className={`tool-btn ${showLegend ? 'active' : ''}`} onClick={toggleLegend} aria-pressed={showLegend}>
            ◉ {t('图例')}
          </button>
        </div>
      </div>

      {breadcrumb.length > 0 && (
        <div className="breadcrumb" aria-label={t('焦点路径')}>
          <button
            onClick={() => {
              selectEntity(null);
              clearFocus();
            }}
          >
            {t('全部')}
          </button>
          {breadcrumb.map((entity) => (
            <span key={`${entity.kind}:${entity.id}`} className="breadcrumb-item">
              <span aria-hidden="true">›</span>
              <button onClick={() => selectEntity(entity)}>{lt(entityLabel(entity))}</button>
            </span>
          ))}
        </div>
      )}

      <div className="mobile-hint" role="note">
        {t('建议桌面使用：窄屏只保证场景概览、参数说明与静态结果，编辑与回放体验不完整。')}
      </div>

      <div className="kpi-strip">{topKpis}</div>

      {mode === 'replay' && (
        <div className="trace-banner" role="status">
          <b>{t('实测复盘')}</b>
          <span>
            {traceInfo ? (
              <>
                {t('来源 {source} · {count} 请求 · 观测值 {observed} 条', {
                  source: lt(traceInfo.source),
                  count: traceInfo.requests.length,
                  observed: traceInfo.observedRequestCount,
                })}
                {' · '}
                {t(
                  traceInfo.hasEventDetails
                    ? '检测到 events 字段，但当前不用于阶段时序'
                    : '仅请求级观测，阶段时序仍为推断',
                )}
              </>
            ) : (
              t('未导入 Trace · 当前为仿真事件回放，不是实测数据')
            )}
          </span>
        </div>
      )}
      {runError && (
        <div className="trace-banner run-error-banner" role="alert">
          <b>{t('无法运行')}{runErrorCode ? ` · ${runErrorCode}` : ''}</b>
          <span>{lt(runError)}</span>
          <button className="btn small" onClick={dismissRunError}>
            {t('关闭')}
          </button>
        </div>
      )}
      {calibrationCurves.length > 0 && (
        <div className="trace-banner calibration-banner" role="status">
          <b>{t('校准曲线')}</b>
          <span>
            {activeRun?.calibration
              ? lt(activeRun.calibration.note)
              : t('{count} 条已导入；仅匹配硬件/模型/框架/dtype/范围的指标会升级为 CALIBRATED。', { count: calibrationCurves.length })}
          </span>
        </div>
      )}

      {showLegend && (
        <div className="legend-popover" role="dialog" aria-label={t('颜色图例')}>
          <div><i style={{ background: 'var(--compute)' }} /> {t('计算 / Prefill')}</div>
          <div><i style={{ background: 'var(--kv)' }} /> {t('KV / Decode / 就绪')}</div>
          <div><i style={{ background: 'var(--transfer)' }} /> {t('传输 / DMA / P→D')}</div>
          <div><i style={{ background: 'var(--wait)' }} /> {t('排队 / 等待')}</div>
          <div><i style={{ background: 'var(--blocked)' }} /> {t('OOM / 阻塞 / 无效')}</div>
          <div><i style={{ background: 'var(--unknown)' }} /> {t('未知 / 未校准')}</div>
          <p>{t('颜色永远辅以文字或图标；不单凭颜色编码状态。')}</p>
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
          <b>{activeLens === 'topology' ? t('机制解释') : t('观察提示')}</b>　{t(LENS_WHY[activeLens])}
        </span>
        <button className="why-more" onClick={focusOnLens}>
          {t('查看原因 →')}
        </button>
      </div>

      <OnboardingDock />

      {!activeRun && (
        <div className="canvas-hint">
          <span>{t('当前是结构预览，未运行仿真。')}</span>
          <button onClick={() => setLens('topology')}>{t('回到拓扑')}</button>
        </div>
      )}
      {activeRun && (
        <div className="canvas-quality-note" title={t('所有动画都来自冻结的事件日志')}>
          {t('回放 · {count} 事件 · {time} 虚拟', {
            count: formatCount(activeRun.events.length),
            time: formatUs(activeRun.endedAtUs),
          })}
        </div>
      )}
    </section>
  );
}
