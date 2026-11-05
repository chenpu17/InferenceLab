import { useMemo, type ReactNode } from 'react';
import { resolveHostCacheBytes, type RankPlan } from '@inferencelab/core';
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

function HbmBar({ rank }: { rank: RankPlan }): ReactNode {
  const budget = rank.hbmBudgetBytes;
  const runtime = rank.runtimeBytes + rank.workspacePeakBytes + rank.graphCaptureBytes + rank.commBufferBytes;
  const segments = [
    { key: 'weights', label: 'Weights', value: rank.weightBytes, color: 'var(--compute)' },
    { key: 'runtime', label: 'Runtime / Workspace', value: runtime, color: 'var(--unknown)' },
    { key: 'kv', label: 'KV Pool 预留', value: rank.kvPoolReservedBytes, color: 'var(--kv)' },
    { key: 'slack', label: 'Slack', value: Math.max(0, rank.hbmSlackBytes), color: 'var(--surface-hi)' },
  ];
  if (budget <= 0) {
    return <p className="na-note">HBM 预算不可计算（容量或利用率未知）。</p>;
  }
  return (
    <>
      <div className="hbm-bar" role="img" aria-label="HBM 预算组成">
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
        <span>HBM 预算</span>
        <b className="mono">{formatBytes(budget)}</b>
      </div>
    </>
  );
}

export function MemoryLens(): ReactNode {
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
        <h3>尚无内存账本</h3>
        <p>需要可计算的权重与 KV 布局；Unknown 模板不会显示猜测容量。</p>
      </div>
    );
  }

  const capacityUnavailable = selectedRank.capacityQuality === 'unavailable';
  const kvUnavailable = selectedRank.kvQuality === 'unavailable';
  const syntheticKvReservation = capacityUnavailable && !kvUnavailable && selectedRank.kvPoolReservedBytes > 0;
  const speculativeSupport = plan.speculative?.frameworkSupport;
  const speculativeKnown = speculativeSupport === 'supported' || speculativeSupport === 'partial';
  const speculativeSupportLabel =
    speculativeSupport === 'unknown' ? 'UNKNOWN' : speculativeSupport === 'unsupported' ? 'UNSUPPORTED' : 'SYNTHETIC';

  const engine = plan.engines.find((item) => item.id === selectedRank.engineId);
  const engineView = engine && viewState ? viewState.engines[engine.id] : null;
  const blocks = engineView
    ? Object.values(viewState?.blocks ?? {}).filter((block) => block.engineId === engine?.id)
    : [];
  const sortedBlocks = [...blocks].sort((a, b) => a.blockIndex - b.blockIndex);
  const usedBlocks = engineView?.kvBlocksUsed ?? 0;
  const totalBlocks = engineView?.kvBlocksTotal ?? engine?.maxKvBlocksPerRank ?? selectedRank.maxKvBlocks;
  const freeBlocks = Math.max(0, totalBlocks - usedBlocks);
  const kvUsed = engineView?.kvPoolBytesUsed ?? 0;
  const kvTotal = selectedRank.kvPoolReservedBytes;
  const hostBlocks = Object.values(viewState?.blocks ?? {}).filter(
    (block) => block.engineId === engine?.id && block.location === 'DRAM',
  );
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
          所选实体不在当前 Plan，已显示 Rank 0；切换回 Topology 可重新选择。
        </p>
      )}
      <div className="memory-layout">
        <aside className="rank-list" aria-label="Rank 列表">
          <div className="subhead">RANKS · {plan.ranks.length}</div>
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
                  title={`${rank.acceleratorId} · ${rank.engineId} · KV ${used}/${total} blocks`}
                  onClick={() => selectEntity({ kind: 'device', id: rank.acceleratorId, label: `设备 ${rank.acceleratorId}` })}
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
                <div className="eyebrow">HBM · EXTERNAL LEDGER</div>
                <h3>{selectedRank.acceleratorId}</h3>
                <p className="caption">
                  {selectedRank.nodeId} · {selectedRank.engineId} · {selectedRank.dpReplicaId}
                </p>
              </div>
              <span
                className={`quality-tag ${qualityClass(selectedRank.capacityQuality)}`}
                title={QUALITY_TITLE[selectedRank.capacityQuality]}
                data-testid="hbm-capacity-quality"
              >
                {capacityUnavailable ? 'UNKNOWN' : QUALITY_LABEL[selectedRank.capacityQuality]}
              </span>
            </div>
            {capacityUnavailable ? (
              <p className="na-note">
                {syntheticKvReservation
                  ? `权重为 Unknown，HBM 总构成不可验证；KV 预留 ${formatBytes(selectedRank.kvPoolReservedBytes)} 来自显式 kv_cache_memory_bytes，仅用于合成运行。`
                  : '权重或 KV 布局为 Unknown，HBM 构成与 KV 预留不可计算；不显示猜测容量。'}
              </p>
            ) : (
              <HbmBar rank={selectedRank} />
            )}
            <p className="caption note-line">
              KV Pool 是 HBM 预算中的已预留段；请求新增 Block 只增加下层 used，不会重复增加外层 HBM 承诺。
            </p>
          </div>

          <div className="memory-card">
            <div className="card-head">
              <div>
                <div className="eyebrow">KV POOL · INTERNAL LEDGER</div>
                <h3>KV Cache · {kvUnavailable ? 'N/A' : `${totalBlocks} blocks`}</h3>
                <p className="caption">
                  block_size={scenario.runtime.blockSize} ·{' '}
                  {kvUnavailable ? 'KV 布局 Unknown' : `${formatBytes(selectedRank.kvBytesPerBlock)} / block`}
                </p>
              </div>
              <span
                className={`quality-tag ${qualityClass(selectedRank.kvQuality)}`}
                title={QUALITY_TITLE[selectedRank.kvQuality]}
                data-testid="kv-quality"
              >
                {QUALITY_LABEL[selectedRank.kvQuality]}
              </span>
            </div>
            {kvUnavailable ? (
              <p className="na-note">KV 布局为 Unknown，无法计算 Block 数、每 Token 字节与池容量。</p>
            ) : (
              <>
                <div className="kv-bar" role="img" aria-label="KV Pool 使用率">
                  <span className="kv-used" style={{ width: `${percentOf(kvUsed, Math.max(1, kvTotal)) * 100}%` }} />
                </div>
                <div className="kv-stats">
                  <div>
                    <span>Used</span>
                    <b className="mono">{formatBytes(kvUsed)}</b>
                  </div>
                  <div>
                    <span>Free</span>
                    <b className="mono">{formatBytes(Math.max(0, kvTotal - kvUsed))}</b>
                  </div>
                  <div>
                    <span>Blocks</span>
                    <b className="mono">{usedBlocks} / {totalBlocks}</b>
                  </div>
                  <div>
                    <span>Bytes / token</span>
                    <b className="mono" data-testid="kv-bytes-per-token">
                      {formatBytes(selectedRank.kvBytesPerToken)}
                    </b>
                  </div>
                  <div>
                    <span>Peak (run)</span>
                    <b className="mono">{formatBytes(kvPeak)}</b>
                  </div>
                </div>

                <div className="block-grid" aria-label="KV Block 状态">
                  {sortedBlocks.slice(0, 160).map((block) => (
                    <button
                      key={block.id}
                      className={`block-cell ${BLOCK_STATE_CLASS[block.state] ?? ''} ${selectedBlockId === block.id ? 'selected' : ''}`}
                      title={`#${block.blockIndex} · ${block.state} · ${block.location} · refs=${block.refCount} · ${shortHash(block.hash)}`}
                      aria-label={`Block ${block.blockIndex}, ${block.state}, ${block.location}, refs ${block.refCount}`}
                      data-state={block.state}
                      onClick={() => selectEntity({ kind: 'block', id: block.id, label: `KV Block #${block.blockIndex}` })}
                    >
                      <span>{block.blockIndex}</span>
                      {block.refCount > 0 && <i>{block.refCount}</i>}
                    </button>
                  ))}
                  {freeBlocks > 0 && (
                    <div className="block-cell block-free block-free-summary" title={`${freeBlocks} free blocks`}>
                      +{freeBlocks}
                    </div>
                  )}
                  {sortedBlocks.length === 0 && freeBlocks === 0 && (
                    <p className="na-note">KV 池为空：block_size 或显式预算不足以容纳一个 Block。</p>
                  )}
                </div>
                <div className="block-legend">
                  <span><i className="block-reserved" aria-hidden="true" /> reserved</span>
                  <span><i className="block-complete" aria-hidden="true" /> complete</span>
                  <span><i className="block-cached" aria-hidden="true" /> cached</span>
                  <span><i className="block-reusable" aria-hidden="true" /> reusable</span>
                  <span><i className="block-host" aria-hidden="true" /> host</span>
                  <span><i className="block-loading" aria-hidden="true" /> loading</span>
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
                  <div className="eyebrow">PP · PIPELINE STAGES</div>
                  <h3>PP{plan.pipeline.ppSize} · {plan.pipeline.stages.length} stages</h3>
                  <p className="caption">
                    {selectedRank.ppStageIndex !== undefined
                      ? `本 Rank 属于 Stage ${selectedRank.ppStageIndex}：层 ${plan.pipeline.stages.find((stage) => stage.stageIndex === selectedRank.ppStageIndex)?.layerRange.join('–') ?? 'n/a'}`
                      : '按连续层范围切分；Activation 在 Stage 间传递。'}
                  </p>
                </div>
                <span className="quality-tag">M4 · assumption</span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>Bubble</span>
                  <b className="mono">{formatPercent(plan.pipeline.bubbleFraction, 1)}</b>
                </div>
                <div>
                  <span>Activation / token</span>
                  <b className="mono">{formatBytes(plan.pipeline.activationBytesPerToken)}</b>
                </div>
                <div>
                  <span>Stage 层数</span>
                  <b className="mono">
                    {plan.pipeline.stages[0] ? plan.pipeline.stages[0].layerRange[1] - plan.pipeline.stages[0].layerRange[0] : 0}
                  </b>
                </div>
                <div>
                  <span>本 Rank 分片</span>
                  <b className="mono">{formatBytes(selectedRank.activationBytesPerRank ?? 0)}</b>
                </div>
              </div>
              <p className="caption note-line">{plan.pipeline.note}</p>
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
                  <div className="eyebrow">SP · ACTIVATION SHARD</div>
                  <h3>SP{plan.sequenceParallel.spSize} · {plan.sequenceParallel.groupIds.length} groups</h3>
                  <p className="caption">复用 TP Rank，只沿序列维切分 Activation；Workspace 不随之切分，与 PCP/DCP 的上下文 KV 切分不同。</p>
                </div>
                <span className="quality-tag">M4 · assumption</span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>Shard factor</span>
                  <b className="mono">{plan.sequenceParallel.activationShardFactor}×</b>
                </div>
                <div>
                  <span>Collective / step</span>
                  <b className="mono">{plan.sequenceParallel.collectiveCostUs} µs</b>
                </div>
                <div>
                  <span>本 Rank Activation</span>
                  <b className="mono">{formatBytes(selectedRank.activationBytesPerRank ?? 0)}</b>
                </div>
                <div>
                  <span>设备增量</span>
                  <b className="mono">0</b>
                </div>
              </div>
              <p className="caption note-line">{plan.sequenceParallel.note}</p>
            </div>
          )}

          {plan.speculative && (
            <div className="memory-card speculative-card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">SPECULATIVE · {plan.speculative.method.toUpperCase()}</div>
                  <h3>{plan.speculative.draftTokens} draft · accept {formatPercent(plan.speculative.acceptanceRate, 0)}</h3>
                  <p className="caption">
                    {speculativeSupport === 'unknown'
                      ? '适配器未声明支持该方法；接受率仍是场景输入，但不能作为已验证收益。'
                      : speculativeSupport === 'unsupported'
                        ? '适配器明确不支持该方法；场景输入仅用于结构展示，不产生可运行收益。'
                        : '接受率是场景假设；收益随任务与采样参数变化，不是固定加速比。'}
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
                  <span>期望接受 / 步</span>
                  <b className="mono">
                    {speculativeKnown
                      ? plan.speculative.expectedAcceptedTokensPerStep.toFixed(2)
                      : 'N/A'}
                  </b>
                </div>
                <div>
                  <span>期望加速比</span>
                  <b className="mono" data-testid="spec-speedup">
                    {speculativeKnown
                      ? `${plan.speculative.expectedDecodeSpeedup.toFixed(2)}×`
                      : 'N/A'}
                  </b>
                </div>
                <div>
                  <span>Draft 成本比</span>
                  <b className="mono">
                    {speculativeKnown
                      ? plan.speculative.draftCostRatio.toFixed(2)
                      : 'N/A'}
                  </b>
                </div>
                <div>
                  <span>Token Budget</span>
                  <b className="mono">+{plan.speculative.draftTokens}</b>
                </div>
              </div>
              <p className="caption note-line">{plan.speculative.note}</p>
            </div>
          )}

          {expertPlacement && (
            <div className="memory-card moe-card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">MoE · EXPERT RESIDENCY</div>
                  <h3>EP{expertPlacement.epSize} · {expertPlacement.expertCount} experts · top-{expertPlacement.topK}</h3>
                  <p className="caption">
                    每 Rank 基础 {expertPlacement.expertsPerRank} 个 + 冗余 {expertPlacement.redundantExpertsPerRank} 个；
                    冗余副本增加 HBM，不增加逻辑专家数。
                  </p>
                </div>
                <span className="quality-tag">M4 · assumption</span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>本 Rank 专家</span>
                  <b className="mono">{rankExpertAssignments.length}</b>
                </div>
                <div>
                  <span>专家权重</span>
                  <b className="mono">{formatBytes(rankExpertBytes)}</b>
                </div>
                <div>
                  <span>总专家权重</span>
                  <b className="mono">{formatBytes(expertPlacement.totalExpertBytes)}</b>
                </div>
                <div>
                  <span>热点比</span>
                  <b className="mono">{moe ? `${moe.hotspotRatio.toFixed(2)}×` : '运行后更新'}</b>
                </div>
              </div>
              {topExpertLoads.length > 0 && (
                <div className="expert-loads" aria-label="专家负载 Top 8">
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
              {!moe && <p className="na-note">运行后可观察 topK 路由后的专家负载与 All-to-All 估算。</p>}
              <p className="caption note-line">
                专家路由为带偏斜的合成教学模型；A2A 字节/耗时按共享互联容量估算，不是实测。
              </p>
            </div>
          )}

          {scenario.runtime.enableCpuOffload && (
            <div className="memory-card host-card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">HOST · DRAM TIER</div>
                  <h3>CPU Offload Cache</h3>
                  <p className="caption">仅建模完整 Block 的主机驻留/回迁；不做逐层流水。</p>
                </div>
                <span className="quality-tag">M3 · partial</span>
              </div>
              <div className="kv-stats">
                <div>
                  <span>Host Used</span>
                  <b className="mono">{formatBytes(hostUsedBytes)}</b>
                </div>
                <div>
                  <span>Host Cache</span>
                  <b className="mono">{formatBytes(hostBytes)}</b>
                </div>
                <div>
                  <span>Host Blocks</span>
                  <b className="mono">{hostBlocks.length}</b>
                </div>
                <div>
                  <span>Offload / Load</span>
                  <b className="mono">{activeRun ? `${offloads ?? 0} / ${hostLoads ?? 0}` : '运行后更新'}</b>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
