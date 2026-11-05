import type { ReactNode } from 'react';
import type {
  KvBlockView,
  Metric,
  RequestView,
  SimEvent,
} from '@inferencelab/core';
import { useLabStore } from '../store/useLabStore';
import { useI18n } from '../i18n';
import { hardwareFor, modelFor } from '../lib/scenario';
import { ENTITY_KIND_LABEL, entityLabel, type EntityRef } from '../lib/entities';
import {
  formatBytes,
  formatGbps,
  formatPercent,
  formatUs,
  percentOf,
  QUALITY_LABEL,
  QUALITY_TITLE,
  qualityClass,
  shortHash,
} from '../lib/format';

function DataRow({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }): ReactNode {
  return (
    <div className="data-row">
      <span>{label}</span>
      <b className={mono ? 'mono' : ''}>{value}</b>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="inspector-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function eventMatches(event: SimEvent, entity: EntityRef): boolean {
  switch (entity.kind) {
    case 'device':
      return event.resourceIds.includes(entity.id) || event.targetId === entity.id;
    case 'node':
      return event.resourceIds.some((id) => id.includes(entity.id)) || event.targetId === entity.id;
    case 'engine':
      return event.targetId === entity.id || event.resourceIds.includes(entity.id);
    case 'request':
      return event.requestId === entity.id;
    case 'block':
      return event.detail.blockId === entity.id;
    case 'link':
      return event.resourceIds.includes(entity.id) || (event.detail.linkIds as string[] | undefined)?.includes(entity.id) === true;
    case 'group':
      return event.resourceIds.some((id) => id.includes(entity.id));
    case 'metric':
      return false;
    default:
      return false;
  }
}

function statusBadge(text: string, tone: string): ReactNode {
  return <span className={`entity-status status-${tone}`}>{text}</span>;
}

const PLAN_STATUS_LABEL: Record<string, string> = {
  idle: '空闲',
  planning: '规划中',
  ready: '可行',
  invalid: '无效',
  unknown: '未知',
};

const ENGINE_ROLE_LABEL: Record<string, string> = {
  prefill: 'Prefill',
  decode: 'Decode',
  mixed: '混合',
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

const WAITING_REASON_LABEL: Record<string, string> = {
  WAITING_FOR_KV_AFTER_PREEMPTION: '抢占后等待 KV',
  WAITING_FOR_REMOTE_KV: '等待远端 KV',
  HOST_KV_LOADING: '主机 KV 加载中',
  REMOTE_KV_READY: '远端 KV 就绪',
  PD_ENGINE_MISSING: '缺少 PD 引擎',
  PREEMPTED_RECOMPUTE: '抢占后重算',
  BUDGET_TOO_SMALL_FOR_PREFILL: '预算不足以 Prefill',
  BUDGET_TOO_SMALL_FOR_DECODE: '预算不足以 Decode',
  KV_ALLOC_BLOCKED: 'KV 分配阻塞',
  SCHEDULER_STALLED: '调度停滞',
  REJECTED: '已拒绝',
};

const DUPLEX_LABEL: Record<string, string> = {
  full: '全双工',
  half: '半双工',
};

const METRIC_GROUP_LABEL: Record<string, string> = {
  requests: '请求组',
  latency: '延迟组',
  throughput: '吞吐组',
  cache: '缓存组',
  scheduler: '调度组',
  transport: '传输组',
  moe: 'MoE 组',
  observed: '观测组',
};

const METRIC_UNIT_LABEL: Record<string, string> = {
  requests: '请求数',
  blocks: 'Block',
  bytes: '字节',
  tokens: 'Token',
  steps: '步',
  events: '事件数',
  routings: '路由次数',
  x: '×',
};

function Overview(): ReactNode {
  const { t, lt } = useI18n();
  const scenario = useLabStore((state) => state.scenario);
  const plan = useLabStore((state) => state.planPreview);
  const planStatus = useLabStore((state) => state.planStatus);
  const activeRun = useLabStore((state) => state.activeRun);
  const hardware = hardwareFor(scenario);
  const model = modelFor(scenario);

  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2>{t('全局视图')}</h2>
        </div>
        {statusBadge(t(PLAN_STATUS_LABEL[planStatus] ?? planStatus.toUpperCase()), planStatus === 'ready' ? 'ok' : planStatus === 'invalid' ? 'blocked' : 'unknown')}
      </div>
      <p className="entity-sub">{lt(scenario.title)}</p>

      <SectionBlock title={t('当前系统')}>
        <DataRow label={t('硬件')} value={hardware?.id ?? scenario.hardwareProfileId} />
        <DataRow label={t('模型')} value={model ? `${model.id} · ${model.architectureFamily}` : scenario.modelProfileId} />
        <DataRow label={t('加速卡')} value={plan?.totals.acceleratorCount ?? 0} mono />
        <DataRow label={t('节点 / 副本')} value={`${plan?.totals.nodeCount ?? 0} / ${plan?.totals.replicaCount ?? 0}`} mono />
        <DataRow label={t('KV 池总量')} value={formatBytes(plan?.totals.kvPoolBytesTotal ?? null)} mono />
        <DataRow label={t('运行')} value={activeRun ? t('{count} 个事件', { count: activeRun.events.length }) : t('尚未运行')} mono />
      </SectionBlock>

      <SectionBlock title={t('如何阅读')}>
        <p className="why-text">
          {t('选择画布中的设备、请求、KV Block 或链路，这里会解释它是什么、在 T 时刻处于什么状态、为什么，以及关联到哪些实体与事件。切换 Lens 不会丢失选择。')}
        </p>
      </SectionBlock>

      <SectionBlock title={t('后续操作')}>
        <div className="related-buttons">
          <button onClick={() => useLabStore.getState().setLens('topology')}>{t('↗ 拓扑')}</button>
          <button onClick={() => useLabStore.getState().setLens('memory')}>↗ HBM / KV</button>
          <button onClick={() => useLabStore.getState().setLens('scheduler')}>{t('↗ 调度')}</button>
          <button onClick={() => useLabStore.getState().setLens('metrics')}>{t('↗ 指标')}</button>
        </div>
      </SectionBlock>
    </>
  );
}

function DeviceInspector({ entity }: { entity: EntityRef }): ReactNode {
  const { t, lt } = useI18n();
  const scenario = useLabStore((state) => state.scenario);
  const plan = useLabStore((state) => state.planPreview);
  const viewState = useLabStore((state) => state.viewState);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const hardware = hardwareFor(scenario);
  if (!plan) return <Overview />;
  const rank = plan.ranks.find((item) => item.acceleratorId === entity.id);
  const resolved = plan.resolvedRanks.find((item) => item.acceleratorId === entity.id);
  if (!rank || !resolved) return <MissingEntity entity={entity} />;
  const accelerator = hardware?.accelerators.find((item) => item.id === entity.id);
  const node = hardware?.nodes.find((item) => item.id === rank.nodeId);
  const engine = plan.engines.find((item) => item.id === rank.engineId);
  const engineView = viewState?.engines[rank.engineId];
  const group = plan.groups.find((item) => item.kind === 'TP' && item.memberRankIds.includes(rank.rankId));
  const running = engineView?.running.length ?? 0;
  const waiting = engineView?.waiting.length ?? 0;

  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2>{accelerator?.label ?? entity.id}</h2>
        </div>
        {statusBadge(lt(running > 0 ? 'BUSY' : 'IDLE'), running > 0 ? 'ok' : 'neutral')}
      </div>
      <p className="entity-sub">
        {node?.label ?? rank.nodeId} · Rank {rank.rankId} · {rank.dpReplicaId}
      </p>

      <SectionBlock title={t('是什么')}>
        <DataRow label={t('加速卡')} value={entity.id} mono />
        <DataRow label={t('节点')} value={node?.label ?? rank.nodeId} />
        <DataRow label={t('厂商 / 系列')} value={`${accelerator?.vendor ?? '?'} / ${accelerator?.family ?? '?'}`} />
        <DataRow label={t('引擎')} value={rank.engineId} mono />
        <DataRow
          label={t('TP 组')}
          value={group ? `${group.id} · ${t('{count} 个 Rank 成员', { count: group.memberRankIds.length })}` : '—'}
          mono
        />
        <DataRow label={t('DP 副本')} value={rank.dpReplicaId} mono />
        {resolved.epGroupIds && resolved.epGroupIds.length > 0 && (
          <DataRow label={t('EP 组')} value={resolved.epGroupIds.join(', ')} mono />
        )}
      </SectionBlock>

      <SectionBlock title={t('T 时刻状态 · HBM / KV')}>
        <DataRow label={t('HBM 预算')} value={formatBytes(rank.hbmBudgetBytes)} mono />
        <DataRow label={t('权重')} value={formatBytes(rank.weightBytes)} mono />
        <DataRow
          label={t('运行时 / 工作区')}
          value={formatBytes(rank.runtimeBytes + rank.workspacePeakBytes + rank.graphCaptureBytes + rank.commBufferBytes)}
          mono
        />
        <DataRow label={t('KV Pool 预留')} value={formatBytes(rank.kvPoolReservedBytes)} mono />
        <DataRow label={t('余量')} value={formatBytes(rank.hbmSlackBytes)} mono />
        <DataRow
          label={t('KV 使用')}
          value={`${formatBytes(engineView?.kvPoolBytesUsed ?? 0)} / ${formatBytes(engineView?.kvPoolBytesTotal ?? rank.kvPoolReservedBytes)}`}
          mono
        />
        <DataRow label={t('Block 使用')} value={`${engineView?.kvBlocksUsed ?? 0} / ${engineView?.kvBlocksTotal ?? rank.maxKvBlocks}`} mono />
        <DataRow label={t('运行中 / 等待')} value={`${running} / ${waiting}`} mono />
        <div className="meter-line">
          <span style={{ width: `${percentOf(engineView?.kvPoolBytesUsed ?? 0, Math.max(1, rank.kvPoolReservedBytes)) * 100}%` }} />
        </div>
      </SectionBlock>

      <SectionBlock title={t('约束与来源')}>
        <p className="why-text">
          {t('HBM 预算 = 容量 × 利用率 − 外部预留；权重来自 Tensor Inventory，KV 池是预算扣除固定占用后的预留段。KV 使用增长不会重复增加外层 HBM 承诺。')}
        </p>
        <div className="quality-row">
          <span className={`quality-tag ${qualityClass(rank.weightQuality)}`}>{t('权重 {tag}', { tag: QUALITY_LABEL[rank.weightQuality] })}</span>
          <span className={`quality-tag ${qualityClass(rank.kvQuality)}`}>{t('KV {tag}', { tag: QUALITY_LABEL[rank.kvQuality] })}</span>
          <span className={`quality-tag ${rank.hbmReadBytesPerSecond === null ? 'quality-unavailable' : 'quality-assumption'}`}>
            {t('HBM 带宽 {value}', { value: rank.hbmReadBytesPerSecond === null ? 'N/A' : formatGbps(rank.hbmReadBytesPerSecond * 8) })}
          </span>
        </div>
        {rank.hbmReadBytesPerSecond === null && <p className="na-note">{t('缺少 HBM 带宽：不产生时间预测。')}</p>}
      </SectionBlock>

      <SectionBlock title={t('关联实体')}>
        <div className="related-buttons">
          {group && <button onClick={() => selectEntity({ kind: 'group', id: group.id }, { focus: true })}>{t('↗ TP 组')}</button>}
          {engine && <button onClick={() => selectEntity({ kind: 'engine', id: engine.id }, { focus: true })}>{t('↗ 引擎')}</button>}
          <button onClick={() => useLabStore.getState().setLens('memory')}>{t('↗ HBM / KV')}</button>
          <button onClick={() => useLabStore.getState().setLens('scheduler')}>{t('↗ 调度 Lens')}</button>
        </div>
      </SectionBlock>
      <EventHistory entity={entity} />
    </>
  );
}

function NodeInspector({ entity }: { entity: EntityRef }): ReactNode {
  const { t } = useI18n();
  const scenario = useLabStore((state) => state.scenario);
  const plan = useLabStore((state) => state.planPreview);
  const viewState = useLabStore((state) => state.viewState);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const hardware = hardwareFor(scenario);
  const node = hardware?.nodes.find((item) => item.id === entity.id);
  if (!plan || !node) return <MissingEntity entity={entity} />;
  const ranks = plan.ranks.filter((rank) => rank.nodeId === node.id);
  const engines = [...new Set(ranks.map((rank) => rank.engineId))];
  const running = engines.reduce((sum, id) => sum + (viewState?.engines[id]?.running.length ?? 0), 0);
  const waiting = engines.reduce((sum, id) => sum + (viewState?.engines[id]?.waiting.length ?? 0), 0);
  const hbm = ranks.reduce((sum, rank) => sum + rank.hbmCapacityBytes, 0);

  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2>{node.label ?? node.id}</h2>
        </div>
        {statusBadge(t('{count} 个 Rank', { count: ranks.length }), 'neutral')}
      </div>
      <p className="entity-sub">{t('{count} 个 CPU 核 · DRAM 池 {pool}', { count: node.cpuCores, pool: node.dramPoolId })}</p>

      <SectionBlock title={t('是什么')}>
        <DataRow label={t('节点 ID')} value={node.id} mono />
        <DataRow label={t('加速卡')} value={ranks.length} mono />
        <DataRow label={t('引擎列表')} value={engines.join(', ')} mono />
        <DataRow label={t('HBM 总容量')} value={formatBytes(hbm)} mono />
      </SectionBlock>
      <SectionBlock title={t('T 时刻状态')}>
        <DataRow label={t('运行中 / 等待')} value={`${running} / ${waiting}`} mono />
        <DataRow label={t('已用 KV')} value={formatBytes(engines.reduce((sum, id) => sum + (viewState?.engines[id]?.kvPoolBytesUsed ?? 0), 0))} mono />
      </SectionBlock>
      <SectionBlock title={t('为什么')}>
        <p className="why-text">
          {t('节点只是物理容器；调度与 KV 池按 Engine / Rank 计算。TP 组可能跨节点，跨节点通信会经过共享 Fabric，其竞争在 Transport Lens 中显示。')}
        </p>
      </SectionBlock>
      <SectionBlock title={t('关联')}>
        <div className="related-buttons">
          {ranks.slice(0, 4).map((rank) => (
            <button key={rank.rankId} onClick={() => selectEntity({ kind: 'device', id: rank.acceleratorId }, { focus: true })}>
              ↗ {rank.acceleratorId.split('-').slice(-1)[0]}
            </button>
          ))}
        </div>
      </SectionBlock>
      <EventHistory entity={entity} />
    </>
  );
}

function EngineInspector({ entity }: { entity: EntityRef }): ReactNode {
  const { t, lt } = useI18n();
  const plan = useLabStore((state) => state.planPreview);
  const viewState = useLabStore((state) => state.viewState);
  const selectEntity = useLabStore((state) => state.selectEntity);
  if (!plan) return <Overview />;
  const engine = plan.engines.find((item) => item.id === entity.id);
  if (!engine) return <MissingEntity entity={entity} />;
  const view = viewState?.engines[engine.id];
  const ranks = plan.ranks.filter((rank) => engine.rankIds.includes(rank.rankId));

  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2>{engine.id}</h2>
        </div>
        {statusBadge(t(ENGINE_ROLE_LABEL[engine.role] ?? engine.role), engine.role === 'decode' ? 'ok' : 'neutral')}
      </div>
      <p className="entity-sub">{t('{count} 个 Rank 成员', { count: ranks.length })} · {engine.dpReplicaId}</p>
      <SectionBlock title={t('是什么')}>
        <DataRow label={t('角色')} value={lt(engine.role)} />
        <DataRow label={t('Rank 列表')} value={engine.rankIds.join(', ')} mono />
        <DataRow label={t('每 Block KV 字节')} value={formatBytes(engine.kvBytesPerBlock)} mono />
        <DataRow label={t('每 Rank 最大 Block 数')} value={engine.maxKvBlocksPerRank} mono />
      </SectionBlock>
      <SectionBlock title={t('T 时刻状态')}>
        <DataRow label={t('运行中')} value={view?.running.length ?? 0} mono />
        <DataRow label={t('等待中')} value={view?.waiting.length ?? 0} mono />
        <DataRow label={t('被抢占')} value={view?.preempted.length ?? 0} mono />
        <DataRow label={t('KV Block 数')} value={`${view?.kvBlocksUsed ?? 0} / ${view?.kvBlocksTotal ?? engine.maxKvBlocksPerRank}`} mono />
        <DataRow label={t('预算')} value={`${view?.lastBudgetUsed ?? 0} / ${view?.lastBudgetTotal ?? 0}`} mono />
      </SectionBlock>
      <SectionBlock title={t('为什么')}>
        <p className="why-text">
          {t('Engine 拥有独立的 KV Pool 与调度队列。DP 副本之间不共享 KV；PD 分离时 Prefill 与 Decode 是不同 Engine，KV 通过 Transfer 事件交接。')}
        </p>
      </SectionBlock>
      <SectionBlock title={t('关联')}>
        <div className="related-buttons">
          <button onClick={() => useLabStore.getState().setLens('scheduler')}>{t('↗ 调度 Lens')}</button>
          <button onClick={() => useLabStore.getState().setLens('memory')}>{t('↗ KV 池')}</button>
          {ranks.slice(0, 3).map((rank) => (
            <button key={rank.rankId} onClick={() => selectEntity({ kind: 'device', id: rank.acceleratorId }, { focus: true })}>
              ↗ {rank.acceleratorId.split('-').slice(-1)[0]}
            </button>
          ))}
        </div>
      </SectionBlock>
      <EventHistory entity={entity} />
    </>
  );
}

function GroupInspector({ entity }: { entity: EntityRef }): ReactNode {
  const { t, lt } = useI18n();
  const plan = useLabStore((state) => state.planPreview);
  const selectEntity = useLabStore((state) => state.selectEntity);
  if (!plan) return <Overview />;
  const group = plan.groups.find((item) => item.id === entity.id);
  if (!group) return <MissingEntity entity={entity} />;
  const ranks = plan.ranks.filter((rank) => group.memberRankIds.includes(rank.rankId));
  const engines = [...new Set(ranks.map((rank) => rank.engineId))];
  const hbm = ranks.reduce((sum, rank) => sum + rank.hbmBudgetBytes, 0);
  const kv = ranks.reduce((sum, rank) => sum + rank.kvPoolReservedBytes, 0);
  const kindWhy: Record<string, string> = {
    TP: 'TP 组内的 Rank 协作计算同一批 Token；权重按 TP 分片，KV 头也按 TP 分片。',
    DP: 'DP 副本是独立 Engine，拥有独立 KV Pool；副本数增加不等于单请求更快。',
    EP: 'EP 按专家分片权重；当前只做结构与容量视图，不模拟 All-to-All 延迟细节。',
    PD: 'PD 组是角色分组：Prefill 与 Decode 使用不同 Engine，KV 通过显式传输交接。',
  };

  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2>{t('{kind} 组', { kind: group.kind })}</h2>
        </div>
        {statusBadge(t('{count} 个 Rank', { count: group.memberRankIds.length }), 'neutral')}
      </div>
      <p className="entity-sub mono">{group.id}</p>
      <SectionBlock title={t('是什么')}>
        <DataRow label={t('类型')} value={lt(group.kind)} />
        <DataRow label={t('成员数')} value={group.memberRankIds.length} mono />
        <DataRow label={t('引擎列表')} value={engines.join(', ')} mono />
        {group.replicaId && <DataRow label={t('副本 ID')} value={group.replicaId} mono />}
      </SectionBlock>
      <SectionBlock title={t('T 时刻状态')}>
        <DataRow label={t('HBM 预算合计')} value={formatBytes(hbm)} mono />
        <DataRow label={t('KV 池预留合计')} value={formatBytes(kv)} mono />
      </SectionBlock>
      <SectionBlock title={t('为什么')}>
        <p className="why-text">
          {kindWhy[group.kind] ? lt(kindWhy[group.kind]) : t('该组由显式放置生成；不在 UI 里用乘法推断。')}
        </p>
      </SectionBlock>
      <SectionBlock title={t('关联')}>
        <div className="related-buttons">
          {ranks.slice(0, 6).map((rank) => (
            <button key={rank.rankId} onClick={() => selectEntity({ kind: 'device', id: rank.acceleratorId }, { focus: true })}>
              ↗ {rank.acceleratorId.split('-').slice(-1)[0]}
            </button>
          ))}
        </div>
      </SectionBlock>
      <EventHistory entity={entity} />
    </>
  );
}

function RequestInspector({ entity }: { entity: EntityRef }): ReactNode {
  const { t, lt } = useI18n();
  const plan = useLabStore((state) => state.planPreview);
  const viewState = useLabStore((state) => state.viewState);
  const activeRun = useLabStore((state) => state.activeRun);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const setLens = useLabStore((state) => state.setLens);
  const request: RequestView | undefined = viewState?.requests[entity.id];
  const trace = activeRun?.requests.find((item) => item.id === entity.id);
  if (!request && !trace) return <MissingEntity entity={entity} />;

  const engineId = request?.engineId ?? trace?.engineId ?? '';
  const engine = plan?.engines.find((item) => item.id === engineId);
  const blocks = viewState
    ? Object.values(viewState.blocks).filter((block) => block.requestId === entity.id)
    : [];
  const firstBlock = blocks[0];
  const transferEvent = activeRun?.events.find(
    (event) => event.requestId === entity.id && event.type === 'TRANSFER_STARTED',
  );
  const transferDurationUs = transferEvent ? Number(transferEvent.detail.durationUs ?? 0) : null;
  const transferBytes = trace?.transferBytes ?? (transferEvent ? Number(transferEvent.detail.bytes ?? 0) : 0);
  const waitingReason = request?.waitingReason ?? trace?.waitingReason ?? null;
  const reasonText: Record<string, string> = {
    WAITING_FOR_KV: 'KV Pool 无足够 Block：需要等待释放、淘汰或抢占。',
    WAITING_FOR_KV_AFTER_PREEMPTION: '请求已被抢占并释放 KV，等待重新获得空间后重算。',
    WAITING_FOR_REMOTE_KV: 'Decode 端尚未收到完整 KV 传输；传输完成前不会进入 Decode。',
    HOST_KV_LOADING: '命中主机 DRAM 中的 KV Block，正在经 PCIe 加载回 HBM；加载完成前不能命中或计算。',
    REMOTE_KV_READY: 'KV 传输已完成，请求已进入 Decode Engine 队列，等待 Token Budget。',
    PD_ENGINE_MISSING: '场景缺少请求所需的 Prefill 或 Decode Engine，无法完成 PD 交接。',
    PREEMPTED_RECOMPUTE: 'KV 不足触发 recompute 抢占；已计算 Token 作废，需重算。',
    BUDGET_TOO_SMALL_FOR_PREFILL: 'Token Budget 小于单个未缓存 Token 的 Prefill 需求。',
    BUDGET_TOO_SMALL_FOR_DECODE: 'Token Budget 小于单个未缓存 Token 的 Decode 需求。',
    KV_ALLOC_BLOCKED: 'KV Block 分配被阻塞；等待释放、淘汰或抢占。',
    SCHEDULER_STALLED: '调度器连续无进展，请求被拒绝。',
    REJECTED: '请求被拒绝；查看事件原因。',
  };
  const reasonLabel = waitingReason ? (WAITING_REASON_LABEL[waitingReason] ?? waitingReason) : null;

  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2 className="mono">{entity.id}</h2>
        </div>
        {statusBadge(lt(request?.status ?? trace?.status ?? 'UNKNOWN'), request?.status === 'RUNNING' ? 'ok' : waitingReason ? 'blocked' : 'neutral')}
      </div>
      <p className="entity-sub">{engineId} · {request?.dpReplicaId ?? trace?.dpReplicaId ?? '—'}</p>

      <SectionBlock title={t('是什么')}>
        <DataRow
          label={t('输入 / 输出 Token 数')}
          value={t('{input} / {output} Token', {
            input: request?.promptTokens ?? trace?.promptTokens ?? 0,
            output: request?.outputTokens ?? trace?.outputTokens ?? 0,
          })}
          mono
        />
        <DataRow label={t('到达时刻')} value={formatUs(request?.arrivalUs ?? trace?.arrivalUs ?? 0)} mono />
        <DataRow label={t('引擎')} value={engineId} mono />
        {(trace?.prefillEngineId || trace?.decodeEngineId) && (
          <DataRow label="Prefill → Decode" value={`${trace.prefillEngineId ?? '—'} → ${trace.decodeEngineId ?? '—'}`} mono />
        )}
        <DataRow
          label={t('会话')}
          value={trace?.conversationId ? t('{id} · 第 {turn} 轮', { id: trace.conversationId, turn: trace.turnIndex ?? 0 }) : '—'}
          mono
        />
      </SectionBlock>

      <SectionBlock title={t('T 时刻状态')}>
        <DataRow label={t('状态')} value={lt(request?.status ?? trace?.status ?? '—')} />
        <DataRow label={t('Prefill 已计算')} value={`${request?.computedPrefillTokens ?? trace?.computedPrefillTokens ?? 0} / ${request?.promptTokens ?? trace?.promptTokens ?? 0}`} mono />
        <DataRow label={t('已生成')} value={`${request?.numGeneratedTokens ?? trace?.generatedTokens ?? 0} / ${request?.outputTokens ?? trace?.outputTokens ?? 0}`} mono />
        <DataRow label={t('缓存前缀')} value={t('{count} 个 Token', { count: request?.cachedInputTokens ?? trace?.cachedInputTokens ?? 0 })} mono />
        {transferBytes > 0 && (
          <DataRow
            label={t('KV 传输')}
            value={`${formatBytes(transferBytes)}${transferDurationUs !== null ? ` · ${formatUs(transferDurationUs)}` : ''}`}
            mono
          />
        )}
        <DataRow label={t('抢占次数')} value={request?.preemptions ?? trace?.preemptions ?? 0} mono />
        <DataRow label={t('KV Block 数')} value={`${request?.kvBlockIds.length ?? blocks.length}`} mono />
        <DataRow label="TTFT" value={trace ? formatUs(trace.ttftUs) : t('运行完成后计算')} mono />
        <DataRow
          label="TPOT"
          value={trace ? (trace.tpotUs === null ? t('N/A · 输出 ≤1 token') : formatUs(trace.tpotUs)) : t('运行完成后计算')}
          mono
        />
        {trace?.observed && (trace.observed.ttftUs !== undefined || trace.observed.tpotUs !== undefined) && (
          <>
            <DataRow
              label={t('实测 TTFT')}
              value={trace.observed.ttftUs !== undefined ? `${formatUs(trace.observed.ttftUs)} · ${t('实测')}` : 'N/A'}
              mono
            />
            <DataRow
              label={t('实测 TPOT')}
              value={trace.observed.tpotUs !== undefined ? `${formatUs(trace.observed.tpotUs)} · ${t('实测')}` : 'N/A'}
              mono
            />
          </>
        )}
        {reasonLabel && <DataRow label={t('等待原因')} value={lt(reasonLabel)} mono />}
      </SectionBlock>

      <SectionBlock title={t('为什么')}>
        <p className="why-text">
          {waitingReason
            ? reasonText[waitingReason]
              ? lt(reasonText[waitingReason])
              : WAITING_REASON_LABEL[waitingReason]
                ? t('等待原因：{code}。', { code: lt(WAITING_REASON_LABEL[waitingReason]) })
                : lt(waitingReason)
            : request?.status === 'FINISHED'
              ? t('请求已完成；KV Block 按保留策略可能仍可复用，后续请求可命中连续前缀。')
              : request?.status === 'RUNNING'
                ? t('请求已获得 Token Budget，正在 Prefill / Decode。')
                : t('请求已到达，等待调度准入。')}
        </p>
        {trace && trace.preemptions > 0 && (
          <p className="na-note">{t('发生 {count} 次抢占；重算 Token 会反映在 Prefill 计算量中。', { count: trace.preemptions })}</p>
        )}
        {trace && trace.cachedInputTokens > 0 && (
          <p className="why-text">{t('Prefix Cache 命中 {count} tokens，来自连续完整 Block。', { count: trace.cachedInputTokens })}</p>
        )}
        {trace?.observed && (
          <p className="na-note">{t('Observed 行来自导入 Trace 的显式字段；仿真 TTFT / TPOT 仍由事件日志推断，不混用观测值。')}</p>
        )}
      </SectionBlock>

      <SectionBlock title={t('追因果')}>
        <div className="related-buttons">
          {firstBlock && (
            <button onClick={() => selectEntity({ kind: 'block', id: firstBlock.id }, { lens: 'memory', focus: true })}>
              {t('↗ 首个 KV Block')}
            </button>
          )}
          {engine && <button onClick={() => selectEntity({ kind: 'engine', id: engine.id }, { focus: true })}>{t('↗ 引擎')}</button>}
          <button onClick={() => setLens('scheduler')}>{t('↗ 回到队列')}</button>
          {transferEvent && (
            <button
              onClick={() => {
                const linkId = (transferEvent.detail.linkIds as string[] | undefined)?.[0];
                if (linkId) selectEntity({ kind: 'link', id: linkId }, { lens: 'transport', focus: true });
                else setLens('transport');
              }}
            >
              {t('↗ KV 传输链路')}
            </button>
          )}
          {waitingReason && <button onClick={() => setLens('memory')}>{t('↗ 查看 KV Pool')}</button>}
        </div>
      </SectionBlock>
      <EventHistory entity={entity} />
    </>
  );
}

function BlockInspector({ entity }: { entity: EntityRef }): ReactNode {
  const { t, lt } = useI18n();
  const viewState = useLabStore((state) => state.viewState);
  const plan = useLabStore((state) => state.planPreview);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const block: KvBlockView | undefined = viewState?.blocks[entity.id];
  if (!block) {
    return (
      <>
        <div className="entity-title">
          <div>
            <div className="panel-label">{t('资源检查器')}</div>
            <h2>KV Block</h2>
          </div>
          {statusBadge(t('T 时刻不存在'), 'neutral')}
        </div>
        <p className="entity-sub mono">{entity.id}</p>
        <SectionBlock title={t('T 时刻状态')}>
          <p className="why-text">{t('该 Block 在当前虚拟时间不存在（已释放、淘汰或尚未分配）。向前/向后 Step 可查看生命周期。')}</p>
        </SectionBlock>
      </>
    );
  }
  const engine = plan?.engines.find((item) => item.id === block.engineId);
  const stateWhy: Record<string, string> = {
    RESERVED: 'Block 已预留但尚未完成计算，不能作为 Prefix 命中。',
    PARTIAL: 'Block 只写入了部分 Token；完整后才能进入哈希链。',
    COMPLETE: 'Block 已完成计算，等待或已经缓存。',
    CACHED_ACTIVE: 'Block 在 HBM 中且哈希有效，可被连续前缀命中。',
    REUSABLE: 'Block 已无引用但保留哈希，等待 LRU 淘汰或复用。',
    HOST_RESIDENT: 'Block 位于主机 DRAM；读取前需要 Load 回 HBM。',
    LOADING: 'Block 正在从主机加载；完成前不能 Read/Decode。',
    OFFLOADING: 'Block 正在写回主机；目标未 Ready。',
    EVICTING: 'Block 正被淘汰。',
    FREE: 'Block 空闲。',
  };

  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2>KV Block #{block.blockIndex}</h2>
        </div>
        {statusBadge(`${lt(BLOCK_STATE_LABEL[block.state] ?? block.state)} · ${lt(block.location)}`, block.state === 'LOADING' ? 'unknown' : 'neutral')}
      </div>
      <p className="entity-sub mono">{block.id}</p>

      <SectionBlock title={t('是什么')}>
        <DataRow label={t('池 / 引擎')} value={`${block.poolId} · ${block.engineId}`} mono />
        <DataRow label={t('Block 索引')} value={block.blockIndex} mono />
        <DataRow label={t('哈希')} value={shortHash(block.hash)} mono />
        <DataRow label={t('父哈希')} value={shortHash(block.parentHash)} mono />
        <DataRow label={t('请求')} value={block.requestId ?? '—'} mono />
        <DataRow label={t('字节数')} value={formatBytes(block.bytes)} mono />
      </SectionBlock>

      <SectionBlock title={t('T 时刻状态')}>
        <DataRow label={t('Block 状态')} value={lt(BLOCK_STATE_LABEL[block.state] ?? block.state)} />
        <DataRow label={t('位置')} value={lt(block.location)} />
        <DataRow label={t('引用计数')} value={block.refCount} mono />
        <DataRow label={t('代次')} value={block.generation} mono />
        <DataRow label={t('最近使用')} value={formatUs(block.lastUsedUs)} mono />
      </SectionBlock>

      <SectionBlock title={t('状态含义')}>
        <p className="why-text">{stateWhy[block.state] ? lt(stateWhy[block.state]) : t('状态由 KV Cache 事件更新。')}</p>
        {block.state === 'LOADING' && <p className="na-note">{t('LOADING 不是 READY：UI 不会提前把它显示为可读。')}</p>}
        {block.refCount > 1 && <p className="why-text">{t('refCount > 1 表示多个请求共享该缓存 Block。')}</p>}
      </SectionBlock>

      <SectionBlock title={t('关联')}>
        <div className="related-buttons">
          {block.requestId && (
            <button onClick={() => selectEntity({ kind: 'request', id: block.requestId! }, { focus: true })}>{t('↗ 请求')}</button>
          )}
          {engine && <button onClick={() => selectEntity({ kind: 'engine', id: engine.id }, { focus: true })}>{t('↗ 引擎')}</button>}
          <button onClick={() => useLabStore.getState().setLens('memory')}>{t('↗ 显存 Lens')}</button>
        </div>
      </SectionBlock>
      <EventHistory entity={entity} />
    </>
  );
}

function LinkInspector({ entity }: { entity: EntityRef }): ReactNode {
  const { t, lt } = useI18n();
  const scenario = useLabStore((state) => state.scenario);
  const activeRun = useLabStore((state) => state.activeRun);
  const virtualTimeUs = useLabStore((state) => state.virtualTimeUs);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const hardware = hardwareFor(scenario);
  const link = hardware?.links.find((item) => item.id === entity.id);
  if (!link) return <MissingEntity entity={entity} />;
  const domain = hardware?.contentionDomains.find((item) => item.id === link.contentionDomainId);
  const peers = hardware?.links.filter((item) => item.contentionDomainId === link.contentionDomainId && item.id !== link.id) ?? [];
  const transfers = activeRun?.events
    .filter((event) => event.type === 'TRANSFER_STARTED')
    .filter((event) => (event.detail.linkIds as string[] | undefined)?.includes(link.id))
    .map((event) => {
      const start = event.timeUs;
      const end = start + Number(event.detail.durationUs ?? 0);
      return {
        id: event.id,
        requestId: event.requestId,
        start,
        end,
        bytes: Number(event.detail.bytes ?? 0),
        active: virtualTimeUs >= start && virtualTimeUs < end,
        done: virtualTimeUs >= end,
      };
    }) ?? [];

  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2>{t('{kind} 链路', { kind: link.kind })}</h2>
        </div>
        {statusBadge(lt(transfers.some((transfer) => transfer.active) ? 'BUSY' : 'IDLE'), transfers.some((transfer) => transfer.active) ? 'ok' : 'neutral')}
      </div>
      <p className="entity-sub mono">{link.id}</p>

      <SectionBlock title={t('是什么')}>
        <DataRow label={t('起点 → 终点')} value={`${link.fromId} → ${link.toId}`} mono />
        <DataRow label={t('类型')} value={link.kind} />
        <DataRow label={t('双工')} value={lt(DUPLEX_LABEL[link.duplex] ?? link.duplex)} />
        <DataRow label={t('标称带宽')} value={formatGbps(link.nominalBitsPerSecond)} mono />
        <DataRow label={t('有效比例')} value={formatPercent(link.effectiveRatio, 0)} mono />
        <DataRow label={t('延迟')} value={formatUs(link.latencyUs)} mono />
        <DataRow label={t('竞争域')} value={link.contentionDomainId} mono />
      </SectionBlock>

      <SectionBlock title={t('T 时刻状态')}>
        <DataRow label={t('有效带宽')} value={formatGbps(link.nominalBitsPerSecond * link.effectiveRatio)} mono />
        <DataRow label={t('竞争域容量')} value={formatGbps(domain?.capacityBitsPerSecond ?? null)} mono />
        <DataRow label={t('传输次数（运行）')} value={transfers.length} mono />
        <DataRow label={t('T 时刻活跃')} value={transfers.filter((transfer) => transfer.active).length} mono />
        <DataRow label={t('共享链路')} value={t('{count} 条链路', { count: peers.length })} mono />
      </SectionBlock>

      <SectionBlock title={t('约束')}>
        <p className="why-text">
          {t('同一竞争域内的传输串行排队，不把双向容量相加。有效带宽 = nominal × effective ratio；没有物理路径时不会画连线。')}
          {domain?.arbitration === 'serialized' && ` ${t('当前域声明为 serialized。')}`}
        </p>
      </SectionBlock>

      <SectionBlock title={t('关联')}>
        <div className="related-buttons">
          <button onClick={() => useLabStore.getState().setLens('transport')}>{t('↗ 传输 Lens')}</button>
          {transfers[0]?.requestId && (
            <button onClick={() => selectEntity({ kind: 'request', id: transfers[0]!.requestId! }, { focus: true })}>
              {t('↗ 使用该链路的请求')}
            </button>
          )}
          {peers.slice(0, 3).map((peer) => (
            <button key={peer.id} onClick={() => selectEntity({ kind: 'link', id: peer.id }, { focus: true })}>
              ↗ {peer.id}
            </button>
          ))}
        </div>
      </SectionBlock>
      <EventHistory entity={entity} />
    </>
  );
}

function MetricInspector({ entity }: { entity: EntityRef }): ReactNode {
  const { t, lt } = useI18n();
  const activeRun = useLabStore((state) => state.activeRun);
  const metric: Metric | undefined = activeRun?.metrics.find((item) => item.key === entity.id);
  if (!metric) return <MissingEntity entity={entity} />;
  const observed = metric.group === 'observed';
  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('证据检查器')}</div>
          <h2>{lt(metric.label)}</h2>
        </div>
        <span className={`quality-tag ${observed ? 'quality-observed' : qualityClass(metric.quality)}`}>
          {observed ? 'OBSERVED' : QUALITY_LABEL[metric.quality]}
        </span>
      </div>
      <p className="entity-sub mono">{metric.key}</p>
      <SectionBlock title={t('是什么')}>
        <DataRow label={t('单位')} value={t(METRIC_UNIT_LABEL[metric.unit] ?? metric.unit)} />
        <DataRow label={t('分组')} value={metric.group ? lt(METRIC_GROUP_LABEL[metric.group] ?? metric.group) : '—'} />
        <DataRow label={t('数值')} value={metric.value === null ? 'N/A' : String(metric.value)} mono />
      </SectionBlock>
      <SectionBlock title={t('来源与限制')}>
        <p className="why-text">{metric.reason !== undefined ? lt(metric.reason) : lt(QUALITY_TITLE[metric.quality])}</p>
        <p className="why-text">
          {observed
            ? t('该值来自导入 Trace 的显式实测字段；不参与仿真成本模型拟合，也不代表未观测请求。')
            : metric.quality === 'assumption'
              ? t('该值由合成成本模型推导；只能用于机制比较，不能当作真实硬件 TTFT/TPOT。')
              : metric.quality === 'calibrated'
                ? t('该值来自导入的校准曲线；仅当硬件、模型、框架、dtype 与 batch/seqLen 范围全部匹配时生效。')
                : metric.quality === 'exact'
                  ? t('该值来自事件计数或显式配置，可复现。')
                  : t('缺少可计算样本，UI 不显示猜测值。')}
        </p>
        {metric.key.startsWith('ttft.') && (
          <p className="why-text">
            {t('影响路径：到达 → 排队 → Prefill → [PD KV 传输] → 首 Token。可在 Request Waterfall 与 Inspector 中逐段核对。')}
          </p>
        )}
        {metric.key.startsWith('tpot.') && (
          <p className="why-text">
            {t('影响路径：首个 Token → 逐 Token Decode → finish；输出 ≤1 Token 时为 N/A。')}
          </p>
        )}
        {metric.evidenceIds.length > 0 && <p className="mono caption">{t('证据：{ids}', { ids: metric.evidenceIds.join(', ') })}</p>}
      </SectionBlock>
      <SectionBlock title={t('关联')}>
        <div className="related-buttons">
          <button onClick={() => useLabStore.getState().setLens('metrics')}>{t('↗ 指标 Lens')}</button>
        </div>
      </SectionBlock>
    </>
  );
}

function EventHistory({ entity }: { entity: EntityRef }): ReactNode {
  const { t } = useI18n();
  const activeRun = useLabStore((state) => state.activeRun);
  const eventIndex = useLabStore((state) => state.eventIndex);
  const setEventIndex = useLabStore((state) => state.setEventIndex);
  if (!activeRun) {
    return (
      <SectionBlock title={t('相关事件')}>
        <p className="na-note">{t('运行后可查看与该实体关联的事件。')}</p>
      </SectionBlock>
    );
  }
  const matches: Array<{ event: SimEvent; index: number }> = [];
  for (let i = 0; i <= Math.min(eventIndex, activeRun.events.length - 1); i += 1) {
    const event = activeRun.events[i]!;
    if (eventMatches(event, entity)) matches.push({ event, index: i });
  }
  const recent = matches.slice(-6).reverse();
  return (
    <SectionBlock title={t('相关事件')}>
      {recent.length === 0 && <p className="na-note">{t('截至 T 尚无关联事件。')}</p>}
      <div className="event-history">
        {recent.map(({ event, index }) => (
          <button key={event.id} className="event-history-row" onClick={() => setEventIndex(index)} title={t('跳到事件 #{index}', { index })}>
            <span className="mono">{formatUs(event.timeUs)}</span>
            <span className="event-type">{event.type}</span>
            <span className="mono event-id">{event.id}</span>
          </button>
        ))}
      </div>
    </SectionBlock>
  );
}

function MissingEntity({ entity }: { entity: EntityRef }): ReactNode {
  const { t, lt } = useI18n();
  return (
    <>
      <div className="entity-title">
        <div>
          <div className="panel-label">{t('资源检查器')}</div>
          <h2>{t('实体不存在')}</h2>
        </div>
        {statusBadge(t('T 时刻不存在'), 'neutral')}
      </div>
      <p className="entity-sub">
        {entity.kind === 'metric' ? t('指标实体') : lt(ENTITY_KIND_LABEL[entity.kind])} · <span className="mono">{entity.id}</span>
      </p>
      <SectionBlock title={t('为什么')}>
        <p className="why-text">
          {t('当前 Plan / 虚拟时间下找不到该实体。可能已被释放、淘汰，或 Draft 已更改但 Run 仍冻结在旧 Scenario。')}
        </p>
      </SectionBlock>
      <SectionBlock title={t('关联')}>
        <div className="related-buttons">
          <button onClick={() => useLabStore.getState().selectEntity(null)}>{t('↺ 回到全局')}</button>
        </div>
      </SectionBlock>
    </>
  );
}

export function Inspector(): ReactNode {
  const { t, lt } = useI18n();
  const entity = useLabStore((state) => state.selectedEntity);
  return (
    <aside className="inspector" aria-label={t('资源检查器')} data-testid="inspector">
      {!entity && <Overview />}
      {entity?.kind === 'device' && <DeviceInspector entity={entity} />}
      {entity?.kind === 'node' && <NodeInspector entity={entity} />}
      {entity?.kind === 'engine' && <EngineInspector entity={entity} />}
      {entity?.kind === 'group' && <GroupInspector entity={entity} />}
      {entity?.kind === 'request' && <RequestInspector entity={entity} />}
      {entity?.kind === 'block' && <BlockInspector entity={entity} />}
      {entity?.kind === 'link' && <LinkInspector entity={entity} />}
      {entity?.kind === 'metric' && <MetricInspector entity={entity} />}
      {entity?.kind === 'scenario' && <Overview />}
      <div className="inspector-foot">
        <span>{entity ? lt(entityLabel(entity)) : t('全局视图')}</span>
        <span>{t('数据：Plan / Event · 非实测')}</span>
      </div>
    </aside>
  );
}
