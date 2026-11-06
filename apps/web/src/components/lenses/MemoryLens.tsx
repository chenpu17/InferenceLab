import { useMemo, type ReactNode } from 'react';
import { resolveHostCacheBytes, type KvBlockView, type RankPlan } from '@inferencelab/core';
import { useLabStore } from '../../store/useLabStore';
import {
  formatBytes,
  formatPercent,
  percentOf,
  shortHash,
  QUALITY_LABEL,
  QUALITY_TITLE,
  qualityClass,
} from '../../lib/format';
import { useI18n } from '../../i18n';

const BLOCK_STATE_CLASS: Record<string, string> = {
  FREE: 'block-free',
  RESERVED: 'block-reserved',
  PARTIAL: 'block-partial',
  COMPLETE: 'block-complete',
  CACHED_ACTIVE: 'block-cached',
  REUSABLE: 'block-reusable',
  EVICTING: 'block-evicting',
  OFFLOADING: 'block-offloading',
  HOST_RESIDENT: 'block-host',
  LOADING: 'block-loading',
};

const BLOCK_STATE_LABEL: Record<string, string> = {
  FREE: '未占用',
  RESERVED: '已预留',
  PARTIAL: '部分写入',
  COMPLETE: '计算完成',
  CACHED_ACTIVE: '缓存活跃',
  REUSABLE: '待复用',
  EVICTING: '淘汰中',
  OFFLOADING: '写回中',
  HOST_RESIDENT: '主机驻留',
  LOADING: '主机加载中',
};

function HbmBar({ rank }: { rank: RankPlan }): ReactNode {
  const { t } = useI18n();
  const budget = rank.hbmBudgetBytes;
  const runtime = rank.runtimeBytes + rank.workspacePeakBytes + rank.graphCaptureBytes + rank.commBufferBytes;
  const segments = [
    { key: 'weights', label: t('权重'), value: rank.weightBytes, color: 'var(--compute)' },
    { key: 'runtime', label: t('运行时 / 工作区'), value: runtime, color: 'var(--unknown)' },
    { key: 'kv', label: t('KV Pool 预留'), value: rank.kvPoolReservedBytes, color: 'var(--kv)' },
    { key: 'slack', label: t('余量'), value: Math.max(0, rank.hbmSlackBytes), color: 'var(--surface-hi)' },
  ];
  if (budget <= 0) {
    return <p className="na-note">{t('HBM 预算不可计算（容量或利用率未知）。')}</p>;
  }
  return (
    <>
      <div className="hbm-bar" role="img" aria-label={t('HBM 预算组成')}>
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="hbm-seg"
            style={{ width: `${percentOf(segment.value, budget) * 100}%`, background: segment.color }}
            title={`${segment.label}: ${formatBytes(segment.value)}`}
          />
        ))}
      </div>
      <div className="hbm-legend">
        {segments.map((segment) => (
          <div key={segment.key} className="legend-row">
            <i style={{ background: segment.color }} />
            <span>{segment.label}</span>
            <b className="mono">{formatBytes(segment.value)}</b>
            <span className="legend-pct">{formatPercent(percentOf(segment.value, budget), 0)}</span>
          </div>
        ))}
      </div>
      <div className="ledger-total">
        <span>{t('HBM 预算')}</span>
        <b className="mono">{formatBytes(budget)}</b>
      </div>
    </>
  );
}

export function MemoryLens(): ReactNode {
  const { t, lt } = useI18n();
  const plan = useLabStore((state) => state.planPreview);
  const scenario = useLabStore((state) => state.scenario);
  const viewState = useLabStore((state) => state.viewState);
  const activeRun = useLabStore((state) => state.activeRun);
  const selectedEntity = useLabStore((state) => state.selectedEntity);
  const selectEntity = useLabStore((state) => state.selectEntity);

  const selection = useMemo(() => {
    if (!plan) return { rank: null, missing: false };
    const fallback = plan.ranks[0] ?? null;
    if (selectedEntity?.kind === 'device') {
      const found = plan.ranks.find((rank) => rank.acceleratorId === selectedEntity.id);
      return { rank: found ?? fallback, missing: !found };
    }
    if (selectedEntity?.kind === 'engine') {
      const engine = plan.engines.find((item) => item.id === selectedEntity.id);
      const found = plan.ranks.find((rank) => engine?.rankIds.includes(rank.rankId));
      return { rank: found ?? fallback, missing: !found };
    }
    if (selectedEntity?.kind === 'block') {
      const block = viewState?.blocks[selectedEntity.id];
      if (block) {
        const engine = plan.engines.find((item) => item.id === block.engineId);
        const rank = plan.ranks.find((item) => engine?.rankIds.includes(item.rankId));
        if (rank) return { rank, missing: false };
      }
      return { rank: fallback, missing: true };
    }
    return { rank: fallback, missing: false };
  }, [plan, selectedEntity, viewState]);
  const selectedRank = selection.rank;
  const selectionMissing = selection.missing;

  if (!plan || !selectedRank) {
    return (
      <div className="lens-empty">
        <h3>{t('尚无内存账本')}</h3>
        <p>{t('需要可计算的权重与 KV 布局；Unknown 模板不会显示猜测容量。')}</p>
      </div>
    );
  }

  const capacityUnavailable = selectedRank.capacityQuality === 'unavailable';
  const kvUnavailable = selectedRank.kvQuality === 'unavailable';
  const syntheticKvReservation = capacityUnavailable && !kvUnavailable && selectedRank.kvPoolReservedBytes > 0;
  const speculativeSupport = plan.speculative?.frameworkSupport;
  const speculativeKnown = speculativeSupport === 'supported' || speculativeSupport === 'partial';
  const speculativeSupportLabel =
    speculativeSupport === 'unknown' ? 'UNKNOWN' : speculativeSupport === 'unsupported' ? t('不支持') : 'SYNTHETIC';

  const engine = plan.engines.find((item) => item.id === selectedRank.engineId);
  const engineView = engine && viewState ? viewState.engines[engine.id] : null;
  const blocks: KvBlockView[] = [];
  const hostBlocks: KvBlockView[] = [];
  if (engine) {
    for (const block of Object.values(viewState?.blocks ?? {})) {
      if (block.engineId !== engine.id) continue;
      if (engineView) blocks.push(block);
      if (block.location === 'DRAM') hostBlocks.push(block);
    }
  }
  const sortedBlocks = blocks.sort((a, b) => a.blockIndex - b.blockIndex);
  const hiddenNonFreeBlocks = sortedBlocks.slice(160).reduce(
    (count, block) => count + (block.state === 'FREE' ? 0 : 1),
    0,
  );
  const usedBlocks = engineView?.kvBlocksUsed ?? 0;
  const totalBlocks = engineView?.kvBlocksTotal ?? engine?.maxKvBlocksPerRank ?? selectedRank.maxKvBlocks;
  const freeBlocks = Math.max(0, totalBlocks - usedBlocks);
  const kvUsed = engineView?.kvPoolBytesUsed ?? 0;
  const kvTotal = selectedRank.kvPoolReservedBytes;
  const hostBytes = resolveHostCacheBytes(scenario);
  const hostUsedBytes = hostBlocks.reduce((sum, block) => sum + block.bytes, 0);
  const selectedBlockId = selectedEntity?.kind === 'block' ? selectedEntity.id : null;
  const kvPeak = activeRun?.metrics.find((metric) => metric.key === 'kv.peakBytes')?.value ?? null;
  const hostLoads = activeRun?.metrics.find((metric) => metric.key === 'transfer.hostLoads')?.value ?? null;
  const offloads = activeRun?.metrics.find((metric) => metric.key === 'transfer.offloads')?.value ?? null;
  const expertPlacement = plan.expertPlacement;
  const moe = activeRun?.moe;
  const rankExpertAssignments = expertPlacement?.assignments.filter(
    (assignment) => assignment.rankId === selectedRank.rankId,
  ) ?? [];
  const rankExpertBytes = rankExpertAssignments.reduce((sum, assignment) => sum + assignment.bytes, 0);
  const topExpertLoads = (moe?.loads ?? []).slice(0, 8);
  const maxExpertLoad = topExpertLoads[0]?.tokens ?? 1;

  return (
    <div className="memory-lens">
      {selectionMissing && (
        <p className="topology-selection memory-selection-note">
          {t('所选实体不在当前 Plan，已显示 Rank 0；切换回 Topology 可重新选择。')}
        </p>
      )}
      <div className="memory-layout">
        <aside className="rank-list" aria-label={t('Rank 列表')}>
          <div className="subhead">{t('Rank 列表 · {count}', { count: plan.ranks.length })}</div>
          <div className="rank-grid">
            {plan.ranks.map((rank) => {
              const selected = rank.acceleratorId === selectedRank.acceleratorId;
              const rankEngine = viewState?.engines[rank.engineId];
              const used = rankEngine ? rankEngine.kvBlocksUsed : 0;
              const total = rank.maxKvBlocks;
              return (
                <button
                  key={rank.rankId}
                  className={`rank-cell ${selected ? 'selected' : ''}`}
                  title={t('{accelerator} · {engine} · KV {used}/{total} Block', {
                    accelerator: rank.acceleratorId,
                    engine: rank.engineId,
                    used,
                    total,
                  })}
                  onClick={() => selectEntity({ kind: 'device', id: rank.acceleratorId, label: t('设备 {id}', { id: rank.acceleratorId }) })}
                >
                  <span>{rank.acceleratorId.split('-').slice(-1)[0]!.padStart(2, '0')}</span>
                  <span className="rank-mini-bar">
                    <i style={{ width: `${percentOf(used, Math.max(1, total)) * 100}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="memory-main">
          <div className="memory-card">
            <div className="card-head">
              <div>
                <div className="eyebrow">{t('HBM · 外层账本')}</div>
                <h3>{selectedRank.acceleratorId}</h3>
                <p className="caption">
                  {selectedRank.nodeId} · {selectedRank.engineId} · {selectedRank.dpReplicaId}
                </p>
              </div>
              <span
                className={`quality-tag ${qualityClass(selectedRank.capacityQuality)}`}
                title={lt(QUALITY_TITLE[selectedRank.capacityQuality])}
                data-testid="hbm-capacity-quality"
              >
                {capacityUnavailable ? 'UNKNOWN' : QUALITY_LABEL[selectedRank.capacityQuality]}
              </span>
            </div>
            {capacityUnavailable ? (
              <p className="na-note">
                {syntheticKvReservation
                  ? t('权重为 Unknown，HBM 总构成不可验证；KV 预留 {bytes} 来自显式 kv_cache_memory_bytes，仅用于合成运行。', {
                      bytes: formatBytes(selectedRank.kvPoolReservedBytes),
                    })
                  : t('权重或 KV 布局为 Unknown，HBM 构成与 KV 预留不可计算；不显示猜测容量。')}
              </p>
            ) : (
              <HbmBar rank={selectedRank} />
            )}
            <p className="caption note-line">
              {t('KV Pool 是 HBM 预算中的已预留段；请求新增 Block 只增加下层 used，不会重复增加外层 HBM 承诺。')}
            </p>
          </div>

          <div className="memory-card">
            <div className="card-head">
              <div>
                <div className="eyebrow">{t('KV 池 · 内层账本')}</div>
                <h3>{kvUnavailable ? 'KV Cache · N/A' : t('KV Cache · {count} 块', { count: totalBlocks })}</h3>
                <p className="caption">
                  block_size={scenario.runtime.blockSize} ·{' '}
                  {kvUnavailable ? t('KV 布局 Unknown') : `${formatBytes(selectedRank.kvBytesPerBlock)} / block`}
                </p>
              </div>
              <span
                className={`quality-tag ${qualityClass(selectedRank.kvQuality)}`}
                title={lt(QUALITY_TITLE[selectedRank.kvQuality])}
                data-testid="kv-quality"
              >
                {QUALITY_LABEL[selectedRank.kvQuality]}
              </span>
            </div>
            {kvUnavailable ? (
              <p className="na-note">{t('KV 布局为 Unknown，无法计算 Block 数、每 Token 字节与池容量。')}</p>
            ) : (
              <>
                <div className="kv-bar" role="img" aria-label={t('KV Pool 使用率')}>
                  <span className="kv-used" style={{ width: `${percentOf(kvUsed, Math.max(1, kvTotal)) * 100}%` }} />
                </div>
                <div className="kv-stats">
                  <div>
                    <span>{t('已用')}</span>
                    <b className="mono">{formatBytes(kvUsed)}</b>
                  </div>
                  <div>
                    <span>{t('空闲')}</span>
                    <b className="mono">{formatBytes(Math.max(0, kvTotal - kvUsed))}</b>
                  </div>
                  <div>
                    <span>{t('块数')}</span>
                    <b className="mono">{usedBlocks} / {totalBlocks}</b>
                  </div>
                  <div>
                    <span>{t('每 Token 字节')}</span>
                    <b className="mono" data-testid="kv-bytes-per-token">
                      {formatBytes(selectedRank.kvBytesPerToken)}
                    </b>
                  </div>
                  <div>
                    <span>{t('峰值（运行）')}</span>
                    <b className="mono">{formatBytes(kvPeak)}</b>
                  </div>
                </div>

                <div className="block-grid" aria-label={t('KV Block 状态')}>
                  {sortedBlocks.slice(0, 160).map((block) => (
                    <button
                      key={block.id}
                      className={`block-cell ${BLOCK_STATE_CLASS[block.state] ?? ''} ${selectedBlockId === block.id ? 'selected' : ''}`}
                      title={`#${block.blockIndex} · ${t(BLOCK_STATE_LABEL[block.state] ?? block.state)} · ${lt(block.location)} · refs=${block.refCount} · ${shortHash(block.hash)}`}
                      aria-label={t('Block {index}，状态 {state}，位置 {location}，引用 {refs}', {
                        index: block.blockIndex,
                        state: t(BLOCK_STATE_LABEL[block.state] ?? block.state),
                        location: lt(block.location),
                        refs: block.refCount,
                      })}
                      data-state={block.state}
                      onClick={() => selectEntity({ kind: 'block', id: block.id, label: `KV Block #${block.blockIndex}` })}
                    >
                      <span>{block.blockIndex}</span>
                      {block.refCount > 0 && <i>{block.refCount}</i>}
                    </button>
                  ))}
                  {freeBlocks > 0 && (
                    <div className="block-cell block-free block-free-summary" title={t('{count} 个空闲 Block', { count: freeBlocks })}>
                      +{freeBlocks}
                    </div>
                  )}
                  {hiddenNonFreeBlocks > 0 && <div className="queue-more">{t('+{count} 条', { count: hiddenNonFreeBlocks })}</div>}
                  {sortedBlocks.length === 0 && freeBlocks === 0 && (
                    <p className="na-note">{t('KV 池为空：block_size 或显式预算不足以容纳一个 Block。')}</p>
                  )}
                </div>
                <div className="block-legend">
                  <span><i className="block-reserved" aria-hidden="true" /> {t('预留')}</span>
                  <span><i className="block-complete" aria-hidden="true" /> {t('已完成')}</span>
                  <span><i className="block-cached" aria-hidden="true" /> {t('已缓存')}</span>
                  <span><i className="block-reusable" aria-hidden="true" /> {t('可复用')}</span>
                  <span><i className="block-host" aria-hidden="true" /> {t('主机')}</span>
                  <span><i className="block-loading" aria-hidden="true" /> {t('加载中')}</span>
                </div>
              </>
            )}
          </div>

          {plan.pipeline && (
            <div
              className="memory-card pipeline-card"
              data-pp-size={plan.pipeline.ppSize}
              data-bubble={plan.pipeline.bubbleFraction}
            >
              <div className="card-head">
                <div>
                  <div className="eyebrow">{t('PP · 流水线 Stage')}</div>
                  <h3>{t('PP{size} · {count} 个 Stage', { size: plan.pipeline.ppSize, count: plan.pipeline.stages.length })}</h3>
                  <p className="caption">
                    {selectedRank.ppStageIndex !== undefined
                      ? t('本 Rank 属于 Stage {stage}：层 {layers}', {
                          stage: selectedRank.ppStageIndex,
                          layers:
                            plan.pipeline.stages
                              .find((stage) => stage.stageIndex === selectedRank.ppStageIndex)
                              ?.layerRange.join('–') ?? 'N/A',
                        })
                      : t('按连续层范围切分；Activation 在 Stage 间传递。')}
                  </p>
                </div>
                <span className="quality-tag">{t('M4 · 假设')}</span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>{t('气泡')}</span>
                  <b className="mono">{formatPercent(plan.pipeline.bubbleFraction, 1)}</b>
                </div>
                <div>
                  <span>{t('Activation / Token')}</span>
                  <b className="mono">{formatBytes(plan.pipeline.activationBytesPerToken)}</b>
                </div>
                <div>
                  <span>{t('Stage 层数')}</span>
                  <b className="mono">
                    {plan.pipeline.stages[0] ? plan.pipeline.stages[0].layerRange[1] - plan.pipeline.stages[0].layerRange[0] : 0}
                  </b>
                </div>
                <div>
                  <span>{t('本 Rank 分片')}</span>
                  <b className="mono">{formatBytes(selectedRank.activationBytesPerRank ?? 0)}</b>
                </div>
              </div>
              <p className="caption note-line">{lt(plan.pipeline.note)}</p>
            </div>
          )}

          {plan.sequenceParallel && (
            <div
              className="memory-card sp-card"
              data-sp-size={plan.sequenceParallel.spSize}
              data-sp-collective={plan.sequenceParallel.collectiveCostUs}
            >
              <div className="card-head">
                <div>
                  <div className="eyebrow">{t('SP · Activation 分片')}</div>
                  <h3>{t('SP{size} · {count} 个组', { size: plan.sequenceParallel.spSize, count: plan.sequenceParallel.groupIds.length })}</h3>
                  <p className="caption">{t('复用 TP Rank，只沿序列维切分 Activation；Workspace 不随之切分，与 PCP/DCP 的上下文 KV 切分不同。')}</p>
                </div>
                <span className="quality-tag">{t('M4 · 假设')}</span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>{t('分片系数')}</span>
                  <b className="mono">{plan.sequenceParallel.activationShardFactor}×</b>
                </div>
                <div>
                  <span>{t('每步 Collective')}</span>
                  <b className="mono">{plan.sequenceParallel.collectiveCostUs} µs</b>
                </div>
                <div>
                  <span>{t('本 Rank Activation')}</span>
                  <b className="mono">{formatBytes(selectedRank.activationBytesPerRank ?? 0)}</b>
                </div>
                <div>
                  <span>{t('设备增量')}</span>
                  <b className="mono">0</b>
                </div>
              </div>
              <p className="caption note-line">{lt(plan.sequenceParallel.note)}</p>
            </div>
          )}

          {plan.speculative && (
            <div className="memory-card speculative-card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">{t('投机解码 · {method}', { method: plan.speculative.method.toUpperCase() })}</div>
                  <h3>{t('{count} 个 Draft · 接受率 {rate}', { count: plan.speculative.draftTokens, rate: formatPercent(plan.speculative.acceptanceRate, 0) })}</h3>
                  <p className="caption">
                    {speculativeSupport === 'unknown'
                      ? t('适配器未声明支持该方法；接受率仍是场景输入，但不能作为已验证收益。')
                      : speculativeSupport === 'unsupported'
                        ? t('适配器明确不支持该方法；场景输入仅用于结构展示，不产生可运行收益。')
                        : t('接受率是场景假设；收益随任务与采样参数变化，不是固定加速比。')}
                  </p>
                </div>
                <span
                  className={`quality-tag ${qualityClass(
                    speculativeKnown ? 'assumption' : 'unavailable',
                  )}`}
                  data-testid="spec-support"
                >
                  {speculativeSupportLabel}
                </span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>{t('期望接受 / 步')}</span>
                  <b className="mono">
                    {speculativeKnown
                      ? plan.speculative.expectedAcceptedTokensPerStep.toFixed(2)
                      : 'N/A'}
                  </b>
                </div>
                <div>
                  <span>{t('期望加速比')}</span>
                  <b className="mono" data-testid="spec-speedup">
                    {speculativeKnown
                      ? `${plan.speculative.expectedDecodeSpeedup.toFixed(2)}×`
                      : 'N/A'}
                  </b>
                </div>
                <div>
                  <span>{t('Draft 成本比')}</span>
                  <b className="mono">
                    {speculativeKnown
                      ? plan.speculative.draftCostRatio.toFixed(2)
                      : 'N/A'}
                  </b>
                </div>
                <div>
                  <span>{t('Token 预算')}</span>
                  <b className="mono">+{plan.speculative.draftTokens}</b>
                </div>
              </div>
              <p className="caption note-line">{lt(plan.speculative.note)}</p>
            </div>
          )}

          {expertPlacement && (
            <div className="memory-card moe-card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">{t('MoE · 专家驻留')}</div>
                  <h3>{t('EP{size} · {count} 个专家 · top-{topK}', { size: expertPlacement.epSize, count: expertPlacement.expertCount, topK: expertPlacement.topK })}</h3>
                  <p className="caption">
                    {t('每 Rank 基础 {base} 个 + 冗余 {redundant} 个； 冗余副本增加 HBM，不增加逻辑专家数。', {
                      base: expertPlacement.expertsPerRank,
                      redundant: expertPlacement.redundantExpertsPerRank,
                    })}
                  </p>
                </div>
                <span className="quality-tag">{t('M4 · 假设')}</span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>{t('本 Rank 专家')}</span>
                  <b className="mono">{rankExpertAssignments.length}</b>
                </div>
                <div>
                  <span>{t('专家权重')}</span>
                  <b className="mono">{formatBytes(rankExpertBytes)}</b>
                </div>
                <div>
                  <span>{t('总专家权重')}</span>
                  <b className="mono">{formatBytes(expertPlacement.totalExpertBytes)}</b>
                </div>
                <div>
                  <span>{t('热点比')}</span>
                  <b className="mono">{moe ? `${moe.hotspotRatio.toFixed(2)}×` : t('运行后更新')}</b>
                </div>
              </div>
              {topExpertLoads.length > 0 && (
                <div className="expert-loads" aria-label={t('专家负载 Top 8')}>
                  {topExpertLoads.map((load) => (
                    <div className="expert-load-row" key={load.expertId}>
                      <span className="mono">{load.expertId}</span>
                      <span className="expert-load-bar">
                        <i style={{ width: `${percentOf(load.tokens, Math.max(1, maxExpertLoad)) * 100}%` }} />
                      </span>
                      <b className="mono">{load.tokens}</b>
                    </div>
                  ))}
                </div>
              )}
              {!moe && <p className="na-note">{t('运行后可观察 topK 路由后的专家负载与 All-to-All 估算。')}</p>}
              <p className="caption note-line">
                {t('专家路由为带偏斜的合成教学模型；A2A 字节/耗时按共享互联容量估算，不是实测。')}
              </p>
            </div>
          )}

          {scenario.runtime.enableCpuOffload && (
            <div className="memory-card host-card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">{t('主机 · DRAM 层')}</div>
                  <h3>{t('CPU Offload 缓存')}</h3>
                  <p className="caption">{t('仅建模完整 Block 的主机驻留/回迁；不做逐层流水。')}</p>
                </div>
                <span className="quality-tag">{t('M3 · 部分')}</span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>{t('主机已用')}</span>
                  <b className="mono">{formatBytes(hostUsedBytes)}</b>
                </div>
                <div>
                  <span>{t('主机缓存')}</span>
                  <b className="mono">{formatBytes(hostBytes)}</b>
                </div>
                <div>
                  <span>{t('主机 Block 数')}</span>
                  <b className="mono">{hostBlocks.length}</b>
                </div>
                <div>
                  <span>{t('卸载 / 加载')}</span>
                  <b className="mono">{activeRun ? `${offloads ?? 0} / ${hostLoads ?? 0}` : t('运行后更新')}</b>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
