import { useMemo, type ReactNode } from 'react';
import { useLabStore } from '../../store/useLabStore';
import { hardwareFor } from '../../lib/scenario';
import { formatBytes, formatGbps, formatUs } from '../../lib/format';

interface TransferView {
  eventId: string;
  requestId?: string;
  kind: string;
  fromId: string;
  toId: string;
  bytes: number;
  startUs: number;
  endUs: number;
  durationUs: number;
  linkIds: string[];
  domains: string[];
  status: 'pending' | 'active' | 'done';
}

export function TransportLens(): ReactNode {
  const scenario = useLabStore((state) => state.scenario);
  const activeRun = useLabStore((state) => state.activeRun);
  const virtualTimeUs = useLabStore((state) => state.virtualTimeUs);
  const selectedEntity = useLabStore((state) => state.selectedEntity);
  const selectEntity = useLabStore((state) => state.selectEntity);
  const hardware = hardwareFor(scenario);

  const transfers = useMemo<TransferView[]>(() => {
    if (!activeRun) return [];
    return activeRun.events
      .filter((event) => event.type === 'TRANSFER_STARTED')
      .map((event) => {
        const detail = event.detail;
        const startUs = event.timeUs;
        const durationUs = Number(detail.durationUs ?? 0);
        const endUs = startUs + durationUs;
        return {
          eventId: event.id,
          requestId: event.requestId,
          kind: String(detail.kind ?? 'PD_KV_TRANSFER'),
          fromId: String(detail.fromId ?? ''),
          toId: String(detail.toId ?? ''),
          bytes: Number(detail.bytes ?? 0),
          startUs,
          endUs,
          durationUs,
          linkIds: (detail.linkIds as string[] | undefined) ?? [],
          domains: (detail.contentionDomainIds as string[] | undefined) ?? [],
          status: virtualTimeUs < startUs ? 'pending' : virtualTimeUs < endUs ? 'active' : 'done',
        };
      });
  }, [activeRun, virtualTimeUs]);

  const selectedLinkId = selectedEntity?.kind === 'link' ? selectedEntity.id : null;
  const selectedLink = hardware?.links.find((link) => link.id === selectedLinkId) ?? null;
  const selectedDomain = selectedLink?.contentionDomainId ?? null;

  const domainSummary = useMemo(() => {
    if (!hardware) return [];
    return hardware.contentionDomains.map((domain) => {
      const links = hardware.links.filter((link) => link.contentionDomainId === domain.id);
      const active = transfers.filter((transfer) => transfer.domains.includes(domain.id) && transfer.status === 'active').length;
      const completed = transfers.filter((transfer) => transfer.domains.includes(domain.id) && transfer.status === 'done').length;
      return { domain, links, active, completed };
    });
  }, [hardware, transfers]);

  if (!hardware) {
    return (
      <div className="lens-empty">
        <h3>尚无硬件链路</h3>
        <p>选择硬件 Profile 后显示物理 Link 与竞争域。</p>
      </div>
    );
  }

  return (
    <div className="transport-lens">
      <div className="transport-summary">
        <div>
          <span className="eyebrow">PHYSICAL LINKS</span>
          <b className="mono">{hardware.links.length}</b>
        </div>
        <div>
          <span className="eyebrow">CONTENTION DOMAINS</span>
          <b className="mono">{hardware.contentionDomains.length}</b>
        </div>
        <div>
          <span className="eyebrow">TRANSFERS IN RUN</span>
          <b className="mono">{transfers.length}</b>
        </div>
        <div>
          <span className="eyebrow">STRATEGY</span>
          <b className="mono">{scenario.deployment.kvTransfer?.strategy ?? (scenario.runtime.enableCpuOffload ? 'CPU_OFFLOAD' : '—')}</b>
        </div>
        <div>
          <span className="eyebrow">AT VIRTUAL TIME</span>
          <b className="mono">{formatUs(virtualTimeUs)}</b>
        </div>
      </div>

      <div className="transport-grid">
        <div className="transport-paths">
          <div className="subhead">KV TRANSFERS · EVENT-DRIVEN</div>
          {transfers.length === 0 && (
            <div className="lens-empty small">
              <h3>当前 Run 没有 KV 传输事件</h3>
              <p>
                只有 PD 分离或 CPU Offload 场景会产生 Transfer。UI 不会在没有物理路径时凭空画流；
                选择 `pd-demo` 或 `offload-demo` 预设并运行后查看。
              </p>
            </div>
          )}
          {transfers.slice(0, 12).map((transfer) => (
            <div key={transfer.eventId} className={`transfer-card transfer-${transfer.status}`}>
              <div className="transfer-head">
                <span className={`transfer-status ${transfer.status}`}>{transfer.status.toUpperCase()}</span>
                <span className="transfer-kind mono">{transfer.kind}</span>
                <span className="mono">
                  {transfer.fromId} → {transfer.toId}
                </span>
                {transfer.requestId && <span className="transfer-req mono">{transfer.requestId}</span>}
              </div>
              <div className="transfer-path">
                <span className="path-node">{transfer.fromId.split('-').slice(-1)[0]}</span>
                {transfer.linkIds.slice(0, 4).map((linkId) => (
                  <span key={linkId} className="path-link" title={linkId}>
                    → <span className="mono">{linkId}</span>
                  </span>
                ))}
                <span className="path-node dest">{transfer.toId.split('-').slice(-1)[0]}</span>
              </div>
              <div className="transfer-meta">
                <span>{formatBytes(transfer.bytes)}</span>
                <span>{formatUs(transfer.startUs)} → {formatUs(transfer.endUs)}</span>
                <span>{formatUs(transfer.durationUs)}</span>
                <span className="mono">{transfer.domains.join(' · ') || 'no shared domain'}</span>
              </div>
              <button
                className="text-link"
                onClick={() => {
                  if (transfer.linkIds[0]) selectEntity({ kind: 'link', id: transfer.linkIds[0] }, { focus: true });
                  else if (transfer.requestId) selectEntity({ kind: 'request', id: transfer.requestId }, { focus: true });
                }}
              >
                定位链路 / 请求 →
              </button>
            </div>
          ))}
        </div>

        <div className="transport-domains">
          <div className="subhead">CONTENTION DOMAINS</div>
          {domainSummary.map(({ domain, links, active, completed }) => (
            <div
              key={domain.id}
              className={`domain-card ${selectedDomain === domain.id ? 'selected' : ''}`}
            >
              <div className="domain-head">
                <span className="mono">{domain.id}</span>
                <span className="domain-cap">{formatGbps(domain.capacityBitsPerSecond)}</span>
              </div>
              <div className="domain-meta">
                <span>{links.length} links</span>
                <span>arbitration: {domain.arbitration}</span>
                <span>{domain.duplex}</span>
              </div>
              <div className="domain-state">
                <span className={active > 0 ? 'busy' : ''}>{active} active</span>
                <span>{completed} done</span>
              </div>
              {links[0] && (
                <button className="text-link" onClick={() => selectEntity({ kind: 'link', id: links[0]!.id })}>
                  查看代表链路 →
                </button>
              )}
            </div>
          ))}
          <p className="helper">
            共享域内的传输串行排队，不把双向带宽相加。选中链路后 Inspector 显示端点、有效带宽与共享域。
          </p>
        </div>
      </div>

      {selectedLink && (
        <div className="selected-link-strip">
          <span className="mono">{selectedLink.id}</span>
          <span>{selectedLink.fromId} → {selectedLink.toId}</span>
          <span>{selectedLink.kind}</span>
          <span>{formatGbps(selectedLink.nominalBitsPerSecond)} × {selectedLink.effectiveRatio} effective</span>
          <span>domain {selectedLink.contentionDomainId}</span>
        </div>
      )}
    </div>
  );
}
