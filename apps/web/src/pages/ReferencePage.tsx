import { useState, type ChangeEvent, type ReactNode } from 'react';
import { scenarioPresets } from '@inferencelab/profiles';
import { useLabStore } from '../store/useLabStore';
import type { ValidationIssue } from '@inferencelab/core';
import { readJsonFile } from '../lib/import';
import { useI18n, type MessageParams } from '../i18n';

const QUALITY_ROWS = [
  {
    level: 'EXACT',
    meaning: '来自显式配置或事件计数，可精确复现。',
    examples: '请求数、完成数、KV Block 数、抢占次数、事件时间。',
  },
  {
    level: 'CALIBRATED',
    meaning: '来自已测量或校准的 Profile。',
    examples: '导入的校准曲线；仅硬件/模型/框架/dtype/范围全部匹配时生效。',
  },
  {
    level: 'SYNTHETIC',
    meaning: '由标注过的合成成本模型推导。',
    examples: 'TTFT、TPOT、吞吐、传输时长。',
  },
  {
    level: 'N/A',
    meaning: '缺少可计算样本，UI 不显示猜测值。',
    examples: '输出 ≤1 token 时的 TPOT、缺少带宽时的传输时间。',
  },
];

const FORMULAS = [
  {
    title: 'HBM 预算',
    formula: 'capacity × utilization − externalReserved',
    note: 'KV Pool 是预算内已预留段；Block 分配只改变内层 used/free。',
  },
  {
    title: 'KV Block 大小',
    formula: 'layers × kvHeads × headDim × blockSize × dtypeBytes × 2(K/V)',
    note: '按 Rank 的 TP/DP 放置计算；不把 TP 与 DP 相乘。',
  },
  {
    title: '调度预算',
    formula: 'Σ(新 Prefill Token) + Σ(Decode Token) ≤ max_num_batched_tokens',
    note: 'Running 优先，Waiting 按 FCFS 准入；max_num_seqs 同时约束序列数。',
  },
  {
    title: '传输时间',
    formula: 'latency + bytes × 8 ÷ (nominal × effectiveRatio)',
    note: '共享竞争域串行排队；PD 的 TTFT 包含 Prefill 到 Decode 的 KV 传输。',
  },
  {
    title: 'PP 气泡',
    formula: '(pp − 1) ÷ (microbatches + pp − 1)',
    note: '按 max_num_seqs 个理想微批估算；跨 Stage Activation 另计结构传输成本。',
  },
  {
    title: 'MLA KV',
    formula: 'layers × (kvLatentDim + ropeDim) × dtypeBytes ÷ DCP',
    note: 'MLA 使用 latent + RoPE 布局，不套用 GQA/MHA 头公式；未启用 DCP 时每 Rank 复制。',
  },
  {
    title: 'SFA / DSA KV',
    formula: 'explicit cacheGroup × storage(full | window | compressed)',
    note: '窗口/压缩缓存必须由 Profile 显式声明；缺失布局时显示 unavailable，不猜数。',
  },
  {
    title: '投机解码',
    formula: 'accepted = 1 + draftTokens × acceptanceRate；speedup = accepted ÷ (1 + draftCostRatio × draftTokens)',
    note: '接受率是场景假设；Draft Token 计入 Token Budget，收益随任务变化。',
  },
];

const METRIC_DEFINITIONS = [
  {
    metric: 'TTFT · 服务端',
    definition: '请求到达调度器 → 首个输出 Token 生成；包含排队、Prefill 与 PD KV 传输。',
    excludes: '不含客户端上传、网络 RTT、tokenizer 与首 Token 回传。',
  },
  {
    metric: 'TTFT · 客户端',
    definition: 'server TTFT + 请求上传/网络 + 首 Token 回传。',
    excludes: '本应用不建模客户端网络，因此不显示 client TTFT；导入 Trace 的 observed 值按其自带口径展示。',
  },
  {
    metric: 'TPOT · 服务端',
    definition: '(finish − firstToken) ÷ (outputTokens − 1)；输出 ≤1 Token 时为 N/A。',
    excludes: '不含客户端流式间隔与网络抖动。',
  },
  {
    metric: 'E2E · 服务端',
    definition: 'arrival → finish，覆盖排队、Prefill、KV 传输与 Decode。',
    excludes: '不含客户端侧时间。',
  },
];

const LIMITATIONS = [
  '不是性能预测器：合成成本模型只用于比较机制，不能回答“真实硬件上 TTFT 是多少”。',
  '不模拟 GPU 内核级并行与真实流水线调度；PP 只按均匀层切分与理想微批估算 bubble。',
  'vLLM 调度器只实现 V1 的机制子集：Token Budget、max_num_seqs、Running 优先、FCFS、Prefix Cache、recompute 抢占。',
  'EP / CP / PP / SP 以结构与容量视图为主；SP 复用 TP Rank，不新增设备；不声称覆盖所有 All-to-All 或流水线重叠细节。',
  'MLA 只支持显式 latent + RoPE 布局；SFA/DSA/HYBRID 必须声明 cache group 与 storage，否则显示 unavailable。',
  'MTP/DSpark 使用场景显式给出的 Draft 数与接受率；接受率不是实测承诺，DSpark 在教学适配器中仍为 unknown。',
  'CPU Offload 只建模完整 Block 的主机驻留/回迁，不做逐层流水。',
  '所有数字都可追溯到 Plan、Profile 或事件；未知数据显式显示 N/A 或 Unknown。',
];

export function ReferencePage(): ReactNode {
  const { t, lt } = useI18n();
  const navigate = useLabStore((state) => state.navigate);
  const loadPreset = useLabStore((state) => state.loadPreset);
  const calibrationCurves = useLabStore((state) => state.calibrationCurves);
  const calibrationIssues = useLabStore((state) => state.calibrationIssues);
  const importCalibrationCurves = useLabStore((state) => state.importCalibrationCurves);
  const clearCalibrationCurves = useLabStore((state) => state.clearCalibrationCurves);
  const traceInfo = useLabStore((state) => state.traceInfo);
  const importTrace = useLabStore((state) => state.importTrace);
  const [importMessage, setImportMessage] = useState<{ source: string; params?: MessageParams } | null>(null);
  const [importIssues, setImportIssues] = useState<ValidationIssue[]>([]);
  const severityLabel = (severity: ValidationIssue['severity']): string =>
    t(severity === 'error' ? '错误' : severity === 'warning' ? '警告' : '提示');

  const readJson = async (event: ChangeEvent<HTMLInputElement>, kind: 'calibration' | 'trace') => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = await readJsonFile(file);
      const issues = kind === 'calibration' ? importCalibrationCurves(parsed) : importTrace(parsed);
      setImportIssues(issues);
      setImportMessage(
        issues.some((issue) => issue.severity === 'error')
          ? { source: '导入被拒绝：{file}', params: { file: file.name } }
          : kind === 'calibration'
            ? { source: '已导入校准曲线：{file}', params: { file: file.name } }
            : { source: '已导入 Trace：{file}（可在“实测复盘”模式查看）', params: { file: file.name } },
      );
    } catch (error) {
      setImportIssues([
        {
          severity: 'error',
          code: 'JSON_PARSE',
          path: '',
          message: error instanceof Error ? error.message : String(error),
        },
      ]);
      setImportMessage({ source: '无法解析 {file}', params: { file: file.name } });
    }
  };

  return (
    <main className="page-shell reference-page">
      <div className="page-head page-masthead">
        <div>
          <div className="eyebrow">{t('参考')} · MECHANISM MANUAL</div>
          <h1>{t('机制参考')}</h1>
          <p>
            {t(
              'InferenceLab 是纯前端、无后端的推理机制实验台。它把“放置 → 容量 → 调度 → KV → 传输 → 指标” 串成一条可回放的事件链，并明确标注每个数字的来源。',
            )}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate('lab')}>{t('← 回到工作台')}</button>
        </div>
      </div>

      <nav className="reference-section-nav" aria-label={t('参考章节导航')}>
        {[
          ['01', '三个核心区分'],
          ['02', '指标质量等级'],
          ['03', '关键公式与约束'],
          ['04', '场景预设'],
          ['05', '数据导入 · 校准曲线 / Trace'],
          ['06', '观察 Lens'],
          ['07', '已知限制'],
        ].map(([index, label]) => (
          <button
            key={index}
            type="button"
            onClick={() => document.getElementById(`reference-section-${index}`)?.scrollIntoView({ block: 'start' })}
          >
            <span className="mono">{index}</span>
            {t(label)}
          </button>
        ))}
      </nav>

      <section className="ref-section" id="reference-section-01">
        <div className="ref-section-head">
          <span className="eyebrow">01</span>
          <h2>{t('三个核心区分')}</h2>
        </div>
        <div className="ref-grid three">
          <div className="ref-card">
            <h3>Draft / Plan / Run</h3>
            <p>
              {t(
                'Draft 是正在编辑的 Scenario；Plan 是结构预览；Run 冻结 Scenario 并生成事件日志。 修改 Draft 不会篡改已经冻结的 Run。',
              )}
            </p>
          </div>
          <div className="ref-card">
            <h3>{t('HBM 账本 / KV 账本')}</h3>
            <p>
              {t(
                '外层 HBM 预算扣除权重、运行时、Workspace、通信缓冲与 KV 预留；内层 KV Pool 单独跟踪 used/free。两层不重复计算。',
              )}
            </p>
          </div>
          <div className="ref-card">
            <h3>{t('物理放置 / 逻辑并行')}</h3>
            <p>
              {t(
                '设备先按 Node → Rank 显式放置，再划分 TP / DP / EP / PD 组。没有隐式的 TP×DP 乘法， 也没有“看不见的卡”。',
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="ref-section" id="reference-section-02">
        <div className="ref-section-head">
          <span className="eyebrow">02</span>
          <h2>{t('指标质量等级')}</h2>
        </div>
        <div className="ref-table" role="table" aria-label={t('指标质量等级')}>
          <div className="ref-tr ref-th" role="row">
            <span role="columnheader">{t('等级')}</span>
            <span role="columnheader">{t('含义')}</span>
            <span role="columnheader">{t('典型指标')}</span>
          </div>
          {QUALITY_ROWS.map((row) => (
            <div className="ref-tr" role="row" key={row.level}>
              <span role="cell"><span className={`quality-tag quality-${row.level === 'EXACT' ? 'exact' : row.level === 'CALIBRATED' ? 'calibrated' : row.level === 'SYNTHETIC' ? 'assumption' : 'unavailable'}`}>{row.level}</span></span>
              <span role="cell">{t(row.meaning)}</span>
              <span role="cell">{t(row.examples)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ref-section" id="reference-section-03">
        <div className="ref-section-head">
          <span className="eyebrow">03</span>
          <h2>{t('关键公式与约束')}</h2>
        </div>
        <div className="ref-grid two">
          {FORMULAS.map((item) => (
            <div className="ref-card" key={item.title}>
              <h3>{t(item.title)}</h3>
              <code className="ref-formula">{t(item.formula)}</code>
              <p>{t(item.note)}</p>
            </div>
          ))}
        </div>
        <div className="ref-table metric-definitions" role="table" aria-label={t('指标口径')}>
          <div className="ref-tr ref-th" role="row">
            <span role="columnheader">{t('指标口径')}</span>
            <span role="columnheader">{t('定义')}</span>
            <span role="columnheader">{t('不包含')}</span>
          </div>
          {METRIC_DEFINITIONS.map((row) => (
            <div className="ref-tr" role="row" key={row.metric}>
              <span role="cell"><b>{t(row.metric)}</b></span>
              <span role="cell">{t(row.definition)}</span>
              <span role="cell">{t(row.excludes)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ref-section" id="reference-section-04">
        <div className="ref-section-head">
          <span className="eyebrow">04</span>
          <h2>{t('场景预设')}</h2>
        </div>
        <div className="preset-list">
          {scenarioPresets.map((preset) => (
            <div className="preset-row" key={preset.id}>
              <div>
                <b>{lt(preset.title)}</b>
                <span className="mono">{preset.scenario.id}</span>
              </div>
              <button
                className="btn small"
                onClick={() => {
                  loadPreset(preset.id);
                  navigate('lab');
                }}
              >
                {t('加载 →')}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="ref-section" id="reference-section-05">
        <div className="ref-section-head">
          <span className="eyebrow">05</span>
          <h2>{t('数据导入 · 校准曲线 / Trace')}</h2>
        </div>
        <div className="ref-grid two">
          <div className="ref-card">
            <h3>{t('校准曲线')}</h3>
            <p>
              {t(
                '导入结构化 Benchmark 曲线：op + hardware + model + framework + dtype + batch/seqLen 范围 → 实测耗时。 仅在匹配范围内插值；超范围会降级为 assumption。',
              )}
            </p>
            <div className="import-row">
              <label className="btn small">
                {t('导入曲线 JSON')}
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => void readJson(event, 'calibration')}
                  data-testid="calibration-file"
                />
              </label>
              <button className="btn small" onClick={clearCalibrationCurves} disabled={calibrationCurves.length === 0}>
                {t('清空')}
              </button>
              <span className="mono">{t('{count} 条曲线', { count: calibrationCurves.length })}</span>
            </div>
            {calibrationCurves.length > 0 && (
              <div className="calibration-list">
                {calibrationCurves.slice(0, 8).map((curve) => (
                  <div key={curve.id} className="calibration-row">
                    <b>{curve.id}</b>
                    <span className="mono">
                      {curve.op} · {curve.hardwareProfileId} · {curve.dtype} ·{' '}
                      {t('序列 {min}–{max}', { min: curve.seqLenMin, max: curve.seqLenMax })} ·{' '}
                      {curve.timeUs.toFixed(1)} µs
                      {curve.uncertaintyPct !== undefined ? ` · ±${curve.uncertaintyPct}%` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {calibrationIssues.length > 0 && (
              <ul className="import-issues">
                {calibrationIssues.slice(0, 5).map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className={issue.severity}>
                    [{severityLabel(issue.severity)}] {lt(issue.message)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="ref-card">
            <h3>{t('标准 Trace')}</h3>
            <p>
              {t(
                '导入项目标准 JSON Trace，驱动请求到达与 Token 计数。只有文件内显式提供的 ttftUs/tpotUs 才会标为 Observed；即使文件带 events 字段，当前也不解析，Prefill/Decode 阶段仍显示为仿真推断。',
              )}
            </p>
            <div className="import-row">
              <label className="btn small">
                {t('导入 Trace JSON')}
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => void readJson(event, 'trace')}
                  data-testid="trace-file"
                />
              </label>
              {traceInfo && (
                <span className="mono">
                  {t('{count} 个请求 · {observed} 条观测', {
                    count: traceInfo.requests.length,
                    observed: traceInfo.observedRequestCount,
                  })}
                </span>
              )}
            </div>
            {traceInfo && (
              <p className="caption">
                {t('来源 {source} · {detail} · 当前模式： 实测复盘', {
                  source: lt(traceInfo.source),
                  detail: t(
                    traceInfo.hasEventDetails
                      ? '检测到 events，但当前不用于阶段时序'
                      : '仅请求级观测',
                  ),
                })}
              </p>
            )}
            {importMessage && (
              <p className="caption import-message">{t(importMessage.source, importMessage.params)}</p>
            )}
            {importIssues.length > 0 && (
              <ul className="import-issues">
                {importIssues.slice(0, 6).map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className={issue.severity}>
                    [{severityLabel(issue.severity)}] {lt(issue.message)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="ref-section" id="reference-section-06">
        <div className="ref-section-head">
          <span className="eyebrow">06</span>
          <h2>{t('观察 Lens')}</h2>
        </div>
        <div className="ref-grid five">
          <div className="ref-card"><h3>{t('拓扑')}</h3><p>{t('物理卡、Node、TP/DP/EP/PD 组边界；回答“卡在哪、如何分组”。')}</p></div>
          <div className="ref-card"><h3>{t('显存')}</h3><p>{t('HBM 预算组成、KV Pool、Block 状态与主机缓存；回答“空间是否足够”。')}</p></div>
          <div className="ref-card"><h3>{t('调度器')}</h3><p>{t('Waiting/Running/Preempted 与 Token Budget；回答“谁先算、为什么等”。')}</p></div>
          <div className="ref-card"><h3>{t('传输')}</h3><p>{t('物理链路、KV 传输与竞争域；回答“数据走哪条路、是否排队”。')}</p></div>
          <div className="ref-card"><h3>{t('指标')}</h3><p>{t('关键路径、分布与质量等级；回答“结果是什么、证据有多强”。')}</p></div>
        </div>
      </section>

      <section className="ref-section" id="reference-section-07">
        <div className="ref-section-head">
          <span className="eyebrow">07</span>
          <h2>{t('已知限制')}</h2>
        </div>
        <ul className="ref-limits">
          {LIMITATIONS.map((limitation) => (
            <li key={limitation}>{t(limitation)}</li>
          ))}
        </ul>
      </section>

      <p className="caption page-note">
        {t('InferenceLab v1.1 · 静态浏览器应用 · 无后端、无上传、无遥测。所有实验数据仅存在于当前页面会话。')}
      </p>
    </main>
  );
}
