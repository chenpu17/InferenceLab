import { useMemo, type ReactNode } from 'react';
import type { PlanResult } from '@inferencelab/core';
import { useLabStore } from '../../store/useLabStore';
import { hardwareFor } from '../../lib/scenario';
import { entityLabel } from '../../lib/entities';

function deviceShortLabel(acceleratorId: string): string {
  const parts = acceleratorId.split('-');
  return parts[parts.length - 1]!.padStart(2, '0');
}

function groupLabel(
  plan: PlanResult,
  replicaId: string,
  ranks: ReadonlyArray<{ tpGroupSize?: number; ppStageIndex?: number }> = plan.ranks,
): string {
  const tp = ranks[0]?.tpGroupSize ?? ranks.length;
  const engine = plan.engines.find((item) => item.dpReplicaId === replicaId);
  const stage = ranks[0]?.ppStageIndex;
  const sp = plan.sequenceParallel?.spSize ?? 1;
  return `Replica ${replicaId.replace(/^dp-?/, '')}${stage !== undefined ? ` · PP Stage ${stage}` : ''} · TP${tp}${sp > 1 ? ` · SP${sp}` : ''}${engine && engine.role !== 'mixed' ? ` · ${engine.role}` : ''}`;
}

export function TopologyLens(): ReactNode {
  const plan = useLabStore((state) => state.planPreview);
  const scenario = useLabStore((state) => state.scenario);
  const planStatus = useLabStore((state) => state.planStatus);
  const viewState = useLabStore((state) => state.viewState);
  const selectedEntity = useLabStore((state) => state.selectedEntity);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const setLens = useLabStore((state) => state.setLens);
  const hardware = hardwareFor(scenario);

  const nodes = useMemo(() => {
    if (!plan || !hardware) return [];
    return hardware.nodes
      .map((node) => {
        const ranks = plan.resolvedRanks.filter((rank) => rank.nodeId === node.id);
        const order = hardware.accelerators
          .filter((accelerator) => accelerator.nodeId === node.id)
          .map((accelerator) => accelerator.id);
        const sorted = [...ranks].sort(
          (a, b) => order.indexOf(a.acceleratorId) - order.indexOf(b.acceleratorId),
        );
        const replicas = [...new Set(sorted.map((rank) => rank.dpReplicaId))];
        return { node, ranks: sorted, replicas };
      })
      .filter((item) => item.ranks.length > 0);
  }, [plan, hardware]);

  if (!plan) {
    return (
      <div className="lens-empty">
        <h3>尚未生成结构预览</h3>
        <p>修改配置后会自动 Plan；或检查右侧的校验错误。</p>
        {planStatus === 'planning' && <p className="mono">planning…</p>}
      </div>
    );
  }

  const selectedId = selectedEntity?.kind === 'device' ? selectedEntity.id : null;
  const selectedNodeId = selectedEntity?.kind === 'node' ? selectedEntity.id : null;
  const epGroups = plan.groups.filter((group) => group.kind === 'EP');
  const ppGroups = plan.groups.filter((group) => group.kind === 'PP');
  const spGroups = plan.groups.filter((group) => group.kind === 'SP');
  const pcpGroups = plan.groups.filter((group) => group.kind === 'PCP');
  const dcpGroups = plan.groups.filter((group) => group.kind === 'DCP');
  const selectedGroup =
    selectedEntity?.kind === 'group' ? plan.groups.find((group) => group.id === selectedEntity.id) ?? null : null;
  const rankTags = (rank: (typeof plan.resolvedRanks)[number]): string[] => {
    const tags: string[] = [];
    for (const groupId of rank.epGroupIds ?? []) {
      const index = epGroups.findIndex((group) => group.id === groupId);
      if (index >= 0) tags.push(`EP${index % 6}`);
    }
    if (rank.ppStageIndex !== undefined) tags.push(`PP${rank.ppStageIndex}`);
    if (rank.spGroupId) tags.push('SP');
    if (rank.pcpGroupId) tags.push('PCP');
    if (rank.dcpGroupId) tags.push('DCP');
    return tags;
  };

  return (
    <div className="topology-lens">
      <div className="topology-meta">
        <span>{plan.totals.nodeCount} NODES / {plan.totals.acceleratorCount} ACCELERATORS</span>
        <span className="mono">
          {epGroups.length > 0 ? `EP groups ${epGroups.length} · ` : ''}
          {ppGroups.length > 0 ? `PP stages ${ppGroups.length} · ` : ''}
          {spGroups.length > 0 ? `SP groups ${spGroups.length} · ` : ''}
          {pcpGroups.length > 0 ? `PCP groups ${pcpGroups.length} · ` : ''}
          {dcpGroups.length > 0 ? `DCP groups ${dcpGroups.length} · ` : ''}
          PHYSICAL LAYOUT · NOT TO SCALE
        </span>
      </div>

      <div className="node-grid">
        {nodes.map(({ node, ranks, replicas }) => (
          <article className={`node-card ${selectedNodeId === node.id ? 'selected' : ''}`} key={node.id}>
            <button className="node-head" onClick={() => selectEntity({ kind: 'node', id: node.id })}>
              <span className="node-name">◫ {node.label ?? node.id}</span>
              <span className="node-meta">{ranks.length} ranks · physical</span>
            </button>
            {replicas.map((replicaId) => {
              const replicaRanks = ranks.filter((rank) => rank.dpReplicaId === replicaId);
              const replicaIndex = Math.max(0, [...new Set(plan.ranks.map((rank) => rank.dpReplicaId))].indexOf(replicaId));
              const ppSize = plan.pipeline?.ppSize ?? 1;
              const stageChunks =
                ppSize > 1
                  ? Array.from({ length: ppSize }, (_, stageIndex) => ({
                      key: `stage-${stageIndex}`,
                      ranks: replicaRanks.filter((rank) => rank.ppStageIndex === stageIndex),
                    })).filter((chunk) => chunk.ranks.length > 0)
                  : [{ key: 'all', ranks: replicaRanks }];
              return stageChunks.map((chunk) => {
                const group = plan.groups.find(
                  (item) => item.kind === 'TP' && item.memberRankIds.some((id) => chunk.ranks.some((rank) => rank.rankId === id)),
                );
                const isGroupSelected = selectedEntity?.kind === 'group' && group?.id === selectedEntity.id;
                return (
                  <div
                    key={`${replicaId}-${chunk.key}`}
                    className={`group-frame group-color-${replicaIndex % 6} ${isGroupSelected ? 'selected' : ''}`}
                  >
                    <button
                      className="group-head"
                      onClick={() => group && selectEntity({ kind: 'group', id: group.id })}
                      title={group ? `TP Group ${group.id} · ${group.memberRankIds.length} ranks` : replicaId}
                    >
                      <span>{groupLabel(plan, replicaId, chunk.ranks)}</span>
                      <span className="group-tag">{chunk.ranks.length} ranks</span>
                    </button>
                    <div className="device-grid">
                      {chunk.ranks.map((rank) => {
                        const engine = viewState?.engines[rank.engineId];
                        const busy = (engine?.running.length ?? 0) > 0;
                        const waiting = (engine?.waiting.length ?? 0) > 0;
                        const accelerator = hardware?.accelerators.find((item) => item.id === rank.acceleratorId);
                        const selected = selectedId === rank.acceleratorId;
                        const tags = rankTags(rank);
                        return (
                          <button
                            key={rank.rankId}
                            className={`device-cell ${selected ? 'selected' : ''} ${busy ? 'busy' : ''} ${waiting ? 'waiting' : ''}`}
                            title={`${accelerator?.label ?? rank.acceleratorId}\nRank ${rank.rankId} · ${replicaId}${rank.tpGroupId ? ` · ${rank.tpGroupId}` : ''}${tags.length > 0 ? `\n${tags.join(' · ')}` : ''}`}
                            aria-label={`${accelerator?.label ?? rank.acceleratorId}，${groupLabel(plan, replicaId, chunk.ranks)}${tags.length > 0 ? `，${tags.join('，')}` : ''}`}
                            onClick={() => selectEntity({ kind: 'device', id: rank.acceleratorId, label: `设备 ${rank.acceleratorId}` })}
                            onDoubleClick={() => {
                              selectEntity({ kind: 'device', id: rank.acceleratorId }, { lens: 'memory' });
                            }}
                            data-testid={`device-${rank.acceleratorId}`}
                          >
                            <span className="device-index">{deviceShortLabel(rank.acceleratorId)}</span>
                            <span className="device-state" aria-hidden="true">
                              {busy ? '●' : waiting ? '◌' : '·'}
                            </span>
                            {tags.length > 0 && (
                              <span className="device-tags">
                                {tags.map((tag) => (
                                  <i key={tag}>{tag}</i>
                                ))}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })}
            <div className="node-foot">
              <span>{node.id}</span>
              <span>DRAM · NIC</span>
            </div>
          </article>
        ))}
      </div>

      <div className="fabric-row">
        <span className="fabric-line" />
        <span className="fabric-tag">
          ⟷ Fabric / Link · {hardware?.links.length ?? 0} links · {hardware?.contentionDomains.length ?? 0} domains
        </span>
        <span className="fabric-line" />
      </div>

      {selectedEntity?.kind === 'device' && (
        <p className="topology-selection">
          已选择 {entityLabel(selectedEntity)}；切换 Lens 会保留该设备与虚拟时间。
        </p>
      )}
      {selectedEntity?.kind === 'group' && selectedGroup && (
        <p className="topology-selection">
          已选择 {entityLabel(selectedEntity)}；{selectedGroup.kind} 组内设备共享该维度通信域，但每张卡仍有独立 HBM 预算。
          {selectedGroup.kind === 'DCP' ? ' DCP 复用 TP Rank，不新增设备。' : ''}
          {selectedGroup.kind === 'PCP' ? ' PCP 是显式放置维度，可能增加 Rank 数。' : ''}
          {selectedGroup.kind === 'PP' ? ' PP Stage 持有连续层范围，Activation 在 Stage 间传递。' : ''}
          {selectedGroup.kind === 'SP' ? ' SP 复用 TP Rank，只沿序列维切分 Activation，不新增设备。' : ''}
        </p>
      )}
      {epGroups.length > 0 && (
        <p className="topology-selection">
          EP 分组与 TP/DP 叠加显示；同一张卡可以同时属于 TP、DP 与 EP 组。专家权重按 EP 分片，而不是再乘一次 TP。
        </p>
      )}
      {plan.pipeline && (
        <p className="topology-selection">
          PP{plan.pipeline.ppSize}：{plan.pipeline.stages.length} 个 Stage 各持有连续层范围；理想 Bubble{' '}
          {(plan.pipeline.bubbleFraction * 100).toFixed(1)}%，跨 Stage Activation 仅按结构成本估算。
        </p>
      )}
      {plan.sequenceParallel && (
        <p className="topology-selection">
          SP{plan.sequenceParallel.spSize} 复用 TP Rank，把 Activation 沿序列维切分；Workspace 不随之切分。它不是
          PCP/DCP 的上下文 KV 切分，也不新增设备。
        </p>
      )}
      {selectedEntity?.kind === 'device' && (
        <button className="text-link" onClick={() => setLens('memory')}>
          查看该设备的 HBM / KV →
        </button>
      )}
    </div>
  );
}
