import { useRef, useState, type ReactNode } from 'react';
import { resolveHostCacheBytes, validateScenarioStructure, type Scenario, type ValidationIssue } from '@inferencelab/core';
import { hardwareProfiles, modelProfiles } from '@inferencelab/profiles';
import { useLabStore } from '../store/useLabStore';
import { useI18n } from '../i18n';
import {
  hardwareFor,
  isPdScenario,
  modelFor,
  pdDimsOf,
  tpDpOf,
  workloadSummary,
} from '../lib/scenario';
import { formatBytes, formatCount } from '../lib/format';
import { readJsonFile } from '../lib/import';

function Section({
  index,
  title,
  children,
  defaultOpen = false,
}: {
  index: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`config-section ${open ? 'open' : ''}`}>
      <button className="section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <span className="section-index">{index}</span> {title}
        </span>
        <span className="chevron" aria-hidden="true">
          {open ? '⌃' : '⌄'}
        </span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

function ParamRow({
  label,
  help,
  children,
  quality,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  quality?: string;
}): ReactNode {
  return (
    <div className="param-row">
      <div className="param-label">
        <span title={help}>{label}</span>
        {help && (
          <span className="param-help" title={help} aria-label={help}>
            ?
          </span>
        )}
        {quality && <span className="param-quality">{quality}</span>}
      </div>
      <div className="param-control">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
  why,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  why?: string;
}): ReactNode {
  const { t } = useI18n();
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`} title={why}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">{checked ? t('开') : t('关')}</span>
    </label>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }): ReactNode {
  const { t, lt } = useI18n();
  if (issues.length === 0) {
    return <p className="plan-ok">{t('✓ 结构校验与语义校验未发现问题。')}</p>;
  }
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  return (
    <div className="issue-list" data-testid="plan-issues">
      <div className="issue-summary">
        {errors > 0 && <span className="issue-count error">{t('{count} 个错误', { count: errors })}</span>}
        {warnings > 0 && <span className="issue-count warning">{t('{count} 个警告', { count: warnings })}</span>}
        {errors === 0 && warnings === 0 && (
          <span className="issue-count info">{t('{count} 条信息', { count: issues.length })}</span>
        )}
      </div>
      {issues.slice(0, 6).map((issue) => (
        <div key={`${issue.code}-${issue.path}-${issue.message}`} className={`issue-item ${issue.severity}`}>
          <div className="issue-code">
            <span>{issue.severity === 'error' ? '✕' : '!'}</span> {issue.code}
          </div>
          <div className="issue-message">{lt(issue.message)}</div>
          <div className="issue-path mono">{issue.path}</div>
          {issue.suggestedFix && <div className="issue-fix">→ {lt(issue.suggestedFix)}</div>}
        </div>
      ))}
      {issues.length > 6 && (
        <p className="helper">{t('另有 {count} 条问题未展开。', { count: issues.length - 6 })}</p>
      )}
    </div>
  );
}

const GB = 1_000_000_000;

export function ConfigPanel(): ReactNode {
  const { t, lt } = useI18n();
  const scenario = useLabStore((state) => state.scenario);
  const planPreview = useLabStore((state) => state.planPreview);
  const planStatus = useLabStore((state) => state.planStatus);
  const planIssues = useLabStore((state) => state.planIssues);
  const activeRun = useLabStore((state) => state.activeRun);
  const setTp = useLabStore((state) => state.setTp);
  const setPdDims = useLabStore((state) => state.setPdDims);
  const setKvTransferStrategy = useLabStore((state) => state.setKvTransferStrategy);
  const setHardware = useLabStore((state) => state.setHardware);
  const setModel = useLabStore((state) => state.setModel);
  const setRuntime = useLabStore((state) => state.setRuntime);
  const setWorkloadFixed = useLabStore((state) => state.setWorkloadFixed);
  const restoreDraftToRun = useLabStore((state) => state.restoreDraftToRun);
  const patchScenario = useLabStore((state) => state.patchScenario);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const hardware = hardwareFor(scenario);
  const model = modelFor(scenario);
  const pd = isPdScenario(scenario);
  const { tp, dp } = tpDpOf(scenario);
  const pdDims = pdDimsOf(scenario);
  const deviceCount = hardware?.accelerators.length ?? 0;
  const tpOptions = [1, 2, 4, 8, 16].filter((value) => value <= Math.max(1, deviceCount));
  const fixedWorkload = scenario.workload.kind === 'fixed' ? scenario.workload : null;

  const exportScenario = () => {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${scenario.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importScenario = async (file: File) => {
    setImportError(null);
    try {
      const parsed = await readJsonFile(file);
      const structural = validateScenarioStructure(parsed);
      if (!structural.ok) {
        setImportError(structural.issues[0]?.message ?? '结构不合法');
        return;
      }
      patchScenario(structural.scenario as Scenario);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside className="config-panel" aria-label={t('实验配置')} data-testid="config-panel">
      <div className="panel-label">{t('控制面板')}</div>
      <h1 className="panel-title">{t('实验配置')}</h1>
      <p className="panel-intro">
        {t('改变参数，观察系统如何重新组织。编辑只更新 Draft，不篡改已冻结的 Run。')}
      </p>

      <Section index="01" title={t('模型与硬件')} defaultOpen>
        <ParamRow label={t('模型画像')} help={t('模型 Profile 决定权重、KV 布局与专家结构。')}>
          <select
            className="select"
            value={scenario.modelProfileId}
            onChange={(event) => setModel(event.target.value)}
            data-testid="model-select"
          >
            {modelProfiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} · {item.architectureFamily}
              </option>
            ))}
          </select>
        </ParamRow>
        <ParamRow label={t('硬件拓扑')} help={t('硬件 Profile 决定节点、加速卡、HBM 容量与链路。')}>
          <select
            className="select"
            value={scenario.hardwareProfileId}
            onChange={(event) => setHardware(event.target.value)}
            data-testid="hardware-select"
          >
            {hardwareProfiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </select>
        </ParamRow>
        <div className="mini-stats">
          <div className="mini-stat">
            <b>{deviceCount}</b>
            <small>{t('加速卡')}</small>
          </div>
          <div className="mini-stat">
            <b>{hardware?.nodes.length ?? 0}</b>
            <small>{t('节点')}</small>
          </div>
          <div className="mini-stat">
            <b>{model?.attentionLayers.length ?? 0}</b>
            <small>{t('Attention 层')}</small>
          </div>
        </div>
        {hardware?.provenance.kind === 'unknown' && (
          <p className="hint-box">
            <b>{t('未知 Profile')}</b>
            <br />
            {t('该硬件只提供结构模板；算力/带宽未知，Run 需要显式选择合成参数。')}
          </p>
        )}
      </Section>

      <Section index="02" title={t('并行拓扑')} defaultOpen>
        {!pd ? (
          <>
            <ParamRow label={t('张量并行（TP）')} help={t('TP 组内协作处理同一批 Token；改变 TP 会重新生成显式 Device→Rank 放置。')}>
              <div className="segmented" role="group" aria-label={t('TP 大小')}>
                {tpOptions.map((value) => (
                  <button
                    key={value}
                    className={tp === value ? 'active' : ''}
                    onClick={() => setTp(value)}
                    data-testid={`tp-${value}`}
                  >
                    TP {value}
                  </button>
                ))}
              </div>
            </ParamRow>
            <ParamRow label={t('数据并行（DP）')} help={t('每个 DP 副本有独立 Engine 与 KV Pool；总卡数不变时 TP 与 DP 互相调整。')}>
              <span className="read-value mono" data-testid="dp-value">
                {dp}
              </span>
            </ParamRow>
            <div className="mini-stats">
              <div className="mini-stat">
                <b>{tp}</b>
                <small>{t('TP 组')}</small>
              </div>
              <div className="mini-stat">
                <b>{dp}</b>
                <small>{t('副本')}</small>
              </div>
              <div className="mini-stat">
                <b>{deviceCount}</b>
                <small>{t('总卡数')}</small>
              </div>
            </div>
            <p className="helper">
              {t('保持物理卡总数不变，TP 调整会改变组边界与副本数；不能仅凭副本更多就断定吞吐增加。')}
            </p>
          </>
        ) : (
          <>
            <div className="pd-grid">
              <span />
              <span className="pd-head">TP</span>
              <span className="pd-head">DP</span>
              <span className="pd-label">Prefill</span>
              <input
                className="number-input"
                type="number"
                min={1}
                max={deviceCount}
                value={pdDims.prefillTp}
                onChange={(event) => setPdDims({ prefillTp: Number(event.target.value) })}
              />
              <input
                className="number-input"
                type="number"
                min={1}
                max={deviceCount}
                value={pdDims.prefillDp}
                onChange={(event) => setPdDims({ prefillDp: Number(event.target.value) })}
              />
              <span className="pd-label">Decode</span>
              <input
                className="number-input"
                type="number"
                min={1}
                max={deviceCount}
                value={pdDims.decodeTp}
                onChange={(event) => setPdDims({ decodeTp: Number(event.target.value) })}
              />
              <input
                className="number-input"
                type="number"
                min={1}
                max={deviceCount}
                value={pdDims.decodeDp}
                onChange={(event) => setPdDims({ decodeDp: Number(event.target.value) })}
              />
            </div>
            <ParamRow label={t('KV Transfer 策略')} help={t('PD_PULL 由 Decode 拉取；LAYERWISE 为同一物理路径的分层推送（当前只按整段计时）；HOST_STAGING 经本地 Host 两段传输。')}>
              <select
                className="select"
                value={scenario.deployment.kvTransfer?.strategy ?? 'PD_PULL'}
                onChange={(event) =>
                  setKvTransferStrategy(
                    event.target.value as 'PD_PULL' | 'PD_LAYERWISE_PUSH' | 'PD_HOST_STAGING',
                  )
                }
                data-testid="pd-strategy"
              >
                <option value="PD_PULL">PD_PULL</option>
                <option value="PD_LAYERWISE_PUSH">PD_LAYERWISE_PUSH</option>
                <option value="PD_HOST_STAGING">PD_HOST_STAGING</option>
              </select>
            </ParamRow>
            <p className="helper">
              {t('PD 分离：Prefill Engine 完成后通过共享 Fabric 将 KV 传给 Decode Engine。策略：')}{' '}
              <span className="mono">{scenario.deployment.kvTransfer?.strategy ?? 'PD_PULL'}</span>
              {t(' · 传输完成前 Decode 侧不会进入 Decode。')}
            </p>
          </>
        )}
        <ParamRow label="EP / CP" help={t('EP 需要 MoE 模型；DCP 复用 TP Rank，PCP 在显式放置中增加 Rank。')}>
          <div className="parallel-badges">
            <span className="mini-badge">EP {scenario.deployment.logicalParallelism.ep ?? 1}</span>
            <span className="mini-badge">PCP {scenario.runtime.pcpSize ?? 1}</span>
            <span className="mini-badge">DCP {scenario.runtime.dcpSize ?? 1}</span>
            {planPreview?.expertPlacement && (
              <span className="mini-badge">
                {t('{count} 个专家 · top-{topK}', {
                  count: planPreview.expertPlacement.expertCount,
                  topK: planPreview.expertPlacement.topK,
                })}
              </span>
            )}
          </div>
        </ParamRow>
        <p className="helper">
          {planPreview?.expertPlacement
            ? t(
                '每 Rank 驻留 {perRank} 个基础专家 + {redundant} 个冗余副本；Topology 显示 EP/PCP/DCP 叠加，Memory 显示专家权重与负载。',
                {
                  perRank: planPreview.expertPlacement.expertsPerRank,
                  redundant: planPreview.expertPlacement.redundantExpertsPerRank,
                },
              )
            : t('当前模型为 Dense；EP/CP 结构仅对 MoE 或显式 CP Preset 生效。')}
        </p>
      </Section>

      <Section index="03" title={t('内存与 KV')} defaultOpen>
        <ParamRow label={t('显式 KV 预算')} help={t('留空表示使用 HBM 预算扣除固定占用后的全部余量。')}>
          <div className="input-with-unit">
            <input
              className="number-input"
              type="number"
              min={0}
              step={1}
              placeholder={t('自动')}
              value={scenario.runtime.kvCacheMemoryBytes ? Math.round(scenario.runtime.kvCacheMemoryBytes / GB) : ''}
              onChange={(event) =>
                setRuntime({
                  kvCacheMemoryBytes: event.target.value === '' ? undefined : Number(event.target.value) * GB,
                })
              }
            />
            <span>GB</span>
          </div>
        </ParamRow>
        <ParamRow label={t('GPU 显存利用率')} help={t('HBM 预算 = 容量 × 利用率 − 外部预留。')}>
          <div className="range-row">
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.01}
              value={scenario.runtime.gpuMemoryUtilization ?? 0.9}
              onChange={(event) => setRuntime({ gpuMemoryUtilization: Number(event.target.value) })}
            />
            <span className="mono">{((scenario.runtime.gpuMemoryUtilization ?? 0.9) * 100).toFixed(0)}%</span>
          </div>
        </ParamRow>
        <ParamRow label={t('KV Block 大小')} help={t('影响 KV 池块数与 Prefix 匹配粒度。')}>
          <select
            className="select"
            value={scenario.runtime.blockSize}
            onChange={(event) => setRuntime({ blockSize: Number(event.target.value) })}
          >
            {[16, 32, 64, 128].map((value) => (
              <option key={value} value={value}>
                {t('{value} 个 Token', { value })}
              </option>
            ))}
          </select>
        </ParamRow>
        <ParamRow label={t('前缀缓存')} help={t('保留完整块的哈希；只做连续前缀匹配。')}>
          <Toggle
            checked={scenario.runtime.enablePrefixCaching}
            onChange={(value) => setRuntime({ enablePrefixCaching: value })}
            label={t('前缀缓存')}
          />
        </ParamRow>
        <ParamRow label={t('分块 Prefill')} help={t('允许长 Prompt 跨多个调度迭代分块计算。')}>
          <Toggle
            checked={scenario.runtime.enableChunkedPrefill}
            onChange={(value) => setRuntime({ enableChunkedPrefill: value })}
            label={t('分块 Prefill')}
          />
        </ParamRow>
        <ParamRow label={t('CPU 卸载')} help={t('M3：完整 Block 的主机驻留/回迁；不做逐层流水。')}>
          <Toggle
            checked={Boolean(scenario.runtime.enableCpuOffload)}
            onChange={(value) => setRuntime({ enableCpuOffload: value })}
            label={t('CPU 卸载')}
          />
        </ParamRow>
        {scenario.runtime.enableCpuOffload && (
          <ParamRow label={t('主机缓存')} help={t('主机侧 KV 缓存容量上界。')}>
            <div className="input-with-unit">
              <input
                className="number-input"
                type="number"
                min={0}
                value={Math.round(resolveHostCacheBytes(scenario) / GB)}
                onChange={(event) => setRuntime({ hostCacheBytes: Number(event.target.value) * GB })}
              />
              <span>GB</span>
            </div>
          </ParamRow>
        )}
        {planPreview && planPreview.ranks[0] && (
          <div className="line-field">
            <span>{t('每卡 KV 池预留')}</span>
            <b className="mono">{formatBytes(planPreview.ranks[0].kvPoolReservedBytes)}</b>
          </div>
        )}
      </Section>

      <Section index="04" title={t('调度参数')}>
        <ParamRow label="max_num_batched_tokens" help={t('一次调度迭代可处理的 Prefill + Decode Token 上限。')}>
          <input
            className="number-input wide"
            type="number"
            min={1}
            value={scenario.runtime.maxNumBatchedTokens}
            onChange={(event) => setRuntime({ maxNumBatchedTokens: Math.max(1, Number(event.target.value)) })}
            data-testid="token-budget"
          />
        </ParamRow>
        <ParamRow label="max_num_seqs" help={t('一次迭代可同时调度的序列数上限；不是 TCP 连接数。')}>
          <input
            className="number-input wide"
            type="number"
            min={1}
            value={scenario.runtime.maxNumSeqs}
            onChange={(event) => setRuntime({ maxNumSeqs: Math.max(1, Number(event.target.value)) })}
          />
        </ParamRow>
        <ParamRow label={t('抢占策略')} help={t('recompute 会释放受害者 KV 并重算；none 表示 KV 不足时等待/拒绝。')}>
          <select
            className="select"
            value={scenario.runtime.preemptionPolicy}
            onChange={(event) =>
              setRuntime({ preemptionPolicy: event.target.value as Scenario['runtime']['preemptionPolicy'] })
            }
          >
            <option value="recompute">recompute</option>
            <option value="none">none</option>
            <option value="backend-specific" disabled>
              {t('backend-specific（未建模）')}
            </option>
          </select>
        </ParamRow>
        <p className="helper">
          {t('这是 vLLM V1 的机制子集，并非逐行复刻源码；调度顺序与预算扣减可由事件日志复核。')}
        </p>
      </Section>

      <Section index="05" title={t('负载')}>
        {fixedWorkload ? (
          <>
            <ParamRow label={t('请求数')} help={t('同时到达的固定负载请求数。')}>
              <input
                className="number-input wide"
                type="number"
                min={0}
                value={fixedWorkload.count}
                onChange={(event) => setWorkloadFixed({ count: Math.max(0, Number(event.target.value)) })}
              />
            </ParamRow>
            <ParamRow label={t('输入 Token 数')} help={t('每个请求的输入长度。')}>
              <input
                className="number-input wide"
                type="number"
                min={0}
                value={fixedWorkload.promptTokens}
                onChange={(event) => setWorkloadFixed({ promptTokens: Math.max(0, Number(event.target.value)) })}
              />
            </ParamRow>
            <ParamRow label={t('输出 Token 数')} help={t('每个请求的输出长度；≤1 时 TPOT 为 N/A。')}>
              <input
                className="number-input wide"
                type="number"
                min={0}
                value={fixedWorkload.outputTokens}
                onChange={(event) => setWorkloadFixed({ outputTokens: Math.max(0, Number(event.target.value)) })}
              />
            </ParamRow>
            <div className="line-field">
              <span>{t('请求数 × 长度')}</span>
              <b className="mono">
                {formatCount(fixedWorkload.count)} × ({fixedWorkload.promptTokens}+{fixedWorkload.outputTokens})
              </b>
            </div>
          </>
        ) : (
          <div className="hint-box">
            <b>{lt(workloadSummary(scenario))}</b>
            <br />
            {t('当前负载来自 Preset 的显式 Trace / Agent 配置。M2 通过 JSON 导入修改；表单编辑将在后续里程碑开放。')}
          </div>
        )}
      </Section>

      <Section index="06" title={t('校验与证据')}>
        <div className="line-field">
          <span>{t('Plan 状态')}</span>
          <b className={`plan-badge plan-${planStatus}`}>
            {planStatus === 'ready'
              ? t('可行')
              : planStatus === 'unknown'
                ? t('未知')
                : planStatus === 'invalid'
                  ? t('无效')
                  : planStatus === 'planning'
                    ? t('规划中')
                    : lt('IDLE')}
          </b>
        </div>
        <IssueList issues={planIssues} />
        {importError && (
          <p className="import-error">{t('导入失败：{message}', { message: lt(importError) })}</p>
        )}
      </Section>

      <div className="config-actions">
        <button
          className="btn"
          onClick={restoreDraftToRun}
          disabled={!activeRun}
          title={activeRun ? t('用当前 Run 的冻结 Scenario 覆盖 Draft') : t('尚无 Run')}
        >
          {t('↺ 回到 Run')}
        </button>
        <button className="btn" onClick={exportScenario}>
          {t('↧ 导出')}
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          {t('↥ 导入')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importScenario(file);
            event.target.value = '';
          }}
        />
      </div>
      <p className="panel-footnote">
        {t('数据来源：{model} Model / {hardware} Hardware', {
          model: model?.provenance.kind === 'unknown' ? t('未知') : t('合成'),
          hardware: hardware?.provenance.kind === 'unknown' ? t('未知') : t('合成'),
        })}
        <br />
        {t('不用于真实 TTFT、TPOT 或吞吐预测。')}
      </p>
    </aside>
  );
}
