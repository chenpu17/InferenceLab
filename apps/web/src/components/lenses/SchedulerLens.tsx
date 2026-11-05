import { useMemo, type ReactNode } from 'react';
import type { RequestView } from '@inferencelab/core';
import { useLabStore } from '../../store/useLabStore';
import { formatCount, percentOf } from '../../lib/format';
import { useI18n } from '../../i18n';

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

function RequestChip({
  request,
  selected,
  onSelect,
}: {
  request: RequestView;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  const { t } = useI18n();
  // Live KV progress: numComputedTokens resets on preemption, while
  // computedPrefillTokens is cumulative work and may exceed promptTokens.
  const prefillDone = Math.min(request.numComputedTokens, request.promptTokens);
  const prefillProgress = percentOf(prefillDone, Math.max(1, request.promptTokens));
  const decodeProgress = percentOf(request.numGeneratedTokens, Math.max(1, request.outputTokens));
  return (
    <button className={`request-chip ${selected ? 'selected' : ''} status-${request.status.toLowerCase()}`} onClick={onSelect}>
      <span className="request-id mono">{request.id}</span>
      <span className="request-progress">
        <span className="progress-track">
          <span className="progress-prefill" style={{ width: `${prefillProgress * 100}%` }} />
          <span className="progress-decode" style={{ width: `${decodeProgress * 100}%` }} />
        </span>
        <span className="request-tokens mono">
          {prefillDone}/{request.promptTokens} + {request.numGeneratedTokens}/{request.outputTokens}
        </span>
      </span>
      {request.waitingReason && (
        <span className="request-reason">{t(WAITING_REASON_LABEL[request.waitingReason] ?? request.waitingReason)}</span>
      )}
      {request.preemptions > 0 && <span className="request-preempt">↺ {request.preemptions}</span>}
    </button>
  );
}

function QueueColumn({
  title,
  hint,
  ids,
  requests,
  selectedId,
  onSelect,
  tone,
}: {
  title: string;
  hint: string;
  ids: string[];
  requests: Record<string, RequestView>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  tone: string;
}): ReactNode {
  const { t } = useI18n();
  return (
    <div className={`queue-column queue-${tone}`}>
      <div className="queue-head">
        <span>{title}</span>
        <b className="mono">{ids.length}</b>
      </div>
      <p className="queue-hint">{hint}</p>
      <div className="queue-list">
        {ids.slice(0, 24).map((id) => {
          const request = requests[id];
          if (!request) return null;
          return (
            <RequestChip
              key={id}
              request={request}
              selected={selectedId === id}
              onSelect={() => onSelect(id)}
            />
          );
        })}
        {ids.length === 0 && <div className="queue-empty">{t('空')}</div>}
        {ids.length > 24 && <div className="queue-more">{t('+{count} 条', { count: ids.length - 24 })}</div>}
      </div>
    </div>
  );
}

export function SchedulerLens(): ReactNode {
  const { t, lt } = useI18n();
  const plan = useLabStore((state) => state.planPreview);
  const scenario = useLabStore((state) => state.scenario);
  const activeRun = useLabStore((state) => state.activeRun);
  const viewState = useLabStore((state) => state.viewState);
  const selectedEntity = useLabStore((state) => state.selectedEntity);
  const selectEntity = useLabStore((state) => state.selectEntity);

  const engines = plan?.engines ?? [];
  const selectedRequestId = selectedEntity?.kind === 'request' ? selectedEntity.id : null;
  const activeRequest = selectedRequestId && viewState ? viewState.requests[selectedRequestId] : null;

  const engineId = useMemo(() => {
    if (!plan) return null;
    if (selectedEntity?.kind === 'engine') return selectedEntity.id;
    if (selectedEntity?.kind === 'request' && activeRequest) return activeRequest.engineId;
    if (selectedEntity?.kind === 'device') {
      const rank = plan.resolvedRanks.find((item) => item.acceleratorId === selectedEntity.id);
      if (rank) return rank.engineId;
    }
    if (selectedEntity?.kind === 'block' && viewState) {
      const block = viewState.blocks[selectedEntity.id];
      if (block) return block.engineId;
    }
    return engines[0]?.id ?? null;
  }, [plan, selectedEntity, activeRequest, viewState, engines]);

  const engine = engines.find((item) => item.id === engineId) ?? engines[0] ?? null;
  const engineView = engine && viewState ? viewState.engines[engine.id] : null;
  const budgetTotal = engineView?.lastBudgetTotal || scenario.runtime.maxNumBatchedTokens;
  const budgetUsed = engineView?.lastBudgetUsed ?? 0;
  const requestMap = viewState?.requests ?? {};
  const selectedId = selectedRequestId;
  const preemptions = activeRun?.metrics.find((metric) => metric.key === 'scheduler.preemptions')?.value ?? 0;
  const steps = activeRun?.metrics.find((metric) => metric.key === 'scheduler.steps')?.value ?? 0;

  if (!plan || !engine) {
    return (
      <div className="lens-empty">
        <h3>{t('尚无调度结构')}</h3>
        <p>{t('配置可用后，这里会显示等待 / 运行 / 被抢占与 Token Budget。')}</p>
      </div>
    );
  }

  return (
    <div className="scheduler-lens">
      <div className="engine-tabs" role="tablist" aria-label={t('Engine 选择')}>
        {engines.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={item.id === engine.id}
            className={item.id === engine.id ? 'active' : ''}
            onClick={() => selectEntity({ kind: 'engine', id: item.id })}
          >
            {item.id}
            <span className="engine-role">{lt(item.role)}</span>
          </button>
        ))}
      </div>

      <div className="budget-ribbon">
        <div className="budget-label">
          <span>{t('每轮预算')}</span>
          <b className="mono">
            {t('{used} / {total} Token', { used: formatCount(budgetUsed), total: formatCount(budgetTotal) })}
          </b>
        </div>
        <div className="budget-bar" role="img" aria-label={t('Token Budget 使用')}>
          <span className="budget-used" style={{ width: `${percentOf(budgetUsed, Math.max(1, budgetTotal)) * 100}%` }} />
          <span className="budget-rest" />
        </div>
        <div className="budget-meta">
          <span>{t('迭代 {n}', { n: engineView?.lastIteration ?? 0 })}</span>
          <span>max_num_seqs={scenario.runtime.maxNumSeqs}</span>
          <span>preemptions={preemptions}</span>
          <span>steps={steps}</span>
        </div>
      </div>

      {!activeRun ? (
        <div className="scheduler-static">
          <div className="queue-column">
            <div className="queue-head">
              <span>{lt('WAITING')}</span>
              <b className="mono">—</b>
            </div>
            <p className="queue-hint">{t('运行后按 FCFS 显示等待队列。')}</p>
            <div className="queue-empty">{t('尚无事件')}</div>
          </div>
          <div className="queue-column">
            <div className="queue-head">
              <span>{lt('RUNNING')}</span>
              <b className="mono">—</b>
            </div>
            <p className="queue-hint">{t('调度迭代会更新运行状态与预算扣减。')}</p>
            <div className="queue-empty">{t('尚无事件')}</div>
          </div>
          <div className="queue-column">
            <div className="queue-head">
              <span>{lt('PREEMPTED')}</span>
              <b className="mono">—</b>
            </div>
            <p className="queue-hint">{t('KV 不足时 recompute 抢占会进入此列。')}</p>
            <div className="queue-empty">{t('尚无事件')}</div>
          </div>
        </div>
      ) : (
        <div className="scheduler-queues">
          <QueueColumn
            title={lt('WAITING')}
            hint={t('FCFS 等待；预算或 KV 不足时停留。')}
            ids={engineView?.waiting ?? []}
            requests={requestMap}
            selectedId={selectedId}
            onSelect={(id) => selectEntity({ kind: 'request', id })}
            tone="waiting"
          />
          <QueueColumn
            title={lt('RUNNING')}
            hint={t('本迭代已获预算的序列。')}
            ids={engineView?.running ?? []}
            requests={requestMap}
            selectedId={selectedId}
            onSelect={(id) => selectEntity({ kind: 'request', id })}
            tone="running"
          />
          <QueueColumn
            title={lt('PREEMPTED')}
            hint={t('被释放 KV 后等待重算的请求。')}
            ids={engineView?.preempted ?? []}
            requests={requestMap}
            selectedId={selectedId}
            onSelect={(id) => selectEntity({ kind: 'request', id })}
            tone="preempted"
          />
        </div>
      )}

      {activeRequest && (
        <div className="request-detail-strip">
          <span className="mono">{activeRequest.id}</span>
          <span>{lt(activeRequest.status)}</span>
          <span>
            {t('已缓存 {cached} tok · 已计算 {computed}/{prompt}', {
              cached: activeRequest.cachedInputTokens,
              computed: activeRequest.computedPrefillTokens,
              prompt: activeRequest.promptTokens,
            })}
          </span>
          <span>{t('已生成 {generated}/{output}', { generated: activeRequest.numGeneratedTokens, output: activeRequest.outputTokens })}</span>
          <span>{t('抢占 {count}', { count: activeRequest.preemptions })}</span>
          {activeRequest.waitingReason && (
            <span className="reason">{t(WAITING_REASON_LABEL[activeRequest.waitingReason] ?? activeRequest.waitingReason)}</span>
          )}
        </div>
      )}

      <p className="helper scheduler-note">
        {t('这是 vLLM V1 的机制子集：Token Budget、max_num_seqs、运行优先与 FCFS 等待准入。不是逐行复刻源码， 也不代表真实后端的所有策略。选择请求后可在 Inspector 查看等待原因并追踪 KV / 链路。')}
      </p>
    </div>
  );
}
