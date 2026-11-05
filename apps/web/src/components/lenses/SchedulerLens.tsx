import { useMemo, type ReactNode } from 'react';
import type { RequestView } from '@inferencelab/core';
import { useLabStore } from '../../store/useLabStore';
import { formatCount, percentOf } from '../../lib/format';

function RequestChip({
  request,
  selected,
  onSelect,
}: {
  request: RequestView;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
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
      {request.waitingReason && <span className="request-reason">{request.waitingReason}</span>}
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
        {ids.length === 0 && <div className="queue-empty">空</div>}
        {ids.length > 24 && <div className="queue-more">+{ids.length - 24} more</div>}
      </div>
    </div>
  );
}

export function SchedulerLens(): ReactNode {
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
        <h3>尚无调度结构</h3>
        <p>配置可用后，这里会显示 Waiting / Running / Preempted 与 Token Budget。</p>
      </div>
    );
  }

  return (
    <div className="scheduler-lens">
      <div className="engine-tabs" role="tablist" aria-label="Engine 选择">
        {engines.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={item.id === engine.id}
            className={item.id === engine.id ? 'active' : ''}
            onClick={() => selectEntity({ kind: 'engine', id: item.id })}
          >
            {item.id}
            <span className="engine-role">{item.role}</span>
          </button>
        ))}
      </div>

      <div className="budget-ribbon">
        <div className="budget-label">
          <span>Per-iteration budget</span>
          <b className="mono">
            {formatCount(budgetUsed)} / {formatCount(budgetTotal)} tokens
          </b>
        </div>
        <div className="budget-bar" role="img" aria-label="Token Budget 使用">
          <span className="budget-used" style={{ width: `${percentOf(budgetUsed, Math.max(1, budgetTotal)) * 100}%` }} />
          <span className="budget-rest" />
        </div>
        <div className="budget-meta">
          <span>iteration {engineView?.lastIteration ?? 0}</span>
          <span>max_num_seqs={scenario.runtime.maxNumSeqs}</span>
          <span>preemptions={preemptions}</span>
          <span>steps={steps}</span>
        </div>
      </div>

      {!activeRun ? (
        <div className="scheduler-static">
          <div className="queue-column">
            <div className="queue-head">
              <span>WAITING</span>
              <b className="mono">—</b>
            </div>
            <p className="queue-hint">运行后按 FCFS 显示等待队列。</p>
            <div className="queue-empty">尚无事件</div>
          </div>
          <div className="queue-column">
            <div className="queue-head">
              <span>RUNNING</span>
              <b className="mono">—</b>
            </div>
            <p className="queue-hint">调度迭代会更新 Running 与预算扣减。</p>
            <div className="queue-empty">尚无事件</div>
          </div>
          <div className="queue-column">
            <div className="queue-head">
              <span>PREEMPTED</span>
              <b className="mono">—</b>
            </div>
            <p className="queue-hint">KV 不足时 recompute 抢占会进入此列。</p>
            <div className="queue-empty">尚无事件</div>
          </div>
        </div>
      ) : (
        <div className="scheduler-queues">
          <QueueColumn
            title="WAITING"
            hint="FCFS 等待；预算或 KV 不足时停留。"
            ids={engineView?.waiting ?? []}
            requests={requestMap}
            selectedId={selectedId}
            onSelect={(id) => selectEntity({ kind: 'request', id })}
            tone="waiting"
          />
          <QueueColumn
            title="RUNNING"
            hint="本迭代已获预算的序列。"
            ids={engineView?.running ?? []}
            requests={requestMap}
            selectedId={selectedId}
            onSelect={(id) => selectEntity({ kind: 'request', id })}
            tone="running"
          />
          <QueueColumn
            title="PREEMPTED"
            hint="被释放 KV 后等待重算的请求。"
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
          <span>{activeRequest.status}</span>
          <span>
            cached {activeRequest.cachedInputTokens} tok · computed {activeRequest.computedPrefillTokens}/{activeRequest.promptTokens}
          </span>
          <span>generated {activeRequest.numGeneratedTokens}/{activeRequest.outputTokens}</span>
          <span>preemptions {activeRequest.preemptions}</span>
          {activeRequest.waitingReason && <span className="reason">{activeRequest.waitingReason}</span>}
        </div>
      )}

      <p className="helper scheduler-note">
        这是 vLLM V1 的机制子集：Token Budget、max_num_seqs、Running 优先与 FCFS Waiting 准入。不是逐行复刻源码，
        也不代表真实后端的所有策略。选择请求后可在 Inspector 使用 Focus Cause 追踪 KV / 链路。
      </p>
    </div>
  );
}
