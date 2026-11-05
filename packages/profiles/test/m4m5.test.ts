import { describe, expect, it } from 'vitest';
import {
  generateContextParallelDeployment,
  planScenario,
  runSimulation,
  type CalibrationCurve,
} from '@inferencelab/core';
import { getProfileBundle, getScenarioPreset, hardwareProfiles } from '../src/index.js';

function inputsFor(id: string) {
  const preset = getScenarioPreset(id);
  if (!preset) throw new Error(`missing preset ${id}`);
  return { scenario: preset.scenario, ...getProfileBundle(preset.scenario) };
}

describe('M4 MoE / EP / CP', () => {
  it('EP groups overlay TP/DP without adding accelerators', () => {
    const plan = planScenario(inputsFor('moe-ep-demo'));
    expect(plan.totals.acceleratorCount).toBe(4);
    expect(plan.groups.filter((group) => group.kind === 'EP')).toHaveLength(2);
    expect(plan.expertPlacement?.epSize).toBe(2);
    expect(plan.expertPlacement?.expertsPerRank).toBe(32);
    expect(plan.ranks.every((rank) => rank.expertCount === 32)).toBe(true);
  });

  it('redundant experts increase per-rank HBM without changing logical experts', () => {
    const base = planScenario(inputsFor('moe-ep-demo'));
    const redundant = planScenario(inputsFor('moe-redundant-demo'));
    expect(redundant.totals.acceleratorCount).toBe(base.totals.acceleratorCount);
    expect(redundant.expertPlacement?.expertCount).toBe(base.expertPlacement?.expertCount);
    expect(redundant.expertPlacement?.redundantExpertsPerRank).toBe(4);
    const delta = redundant.ranks[0]!.weightBytes - base.ranks[0]!.weightBytes;
    expect(delta).toBe(4 * 64_000_000);
    expect(redundant.ranks[0]!.redundantExpertCount).toBe(4);
  });

  it('skewed routing creates a hotspot and A2A cost', () => {
    const result = runSimulation(inputsFor('moe-redundant-demo'));
    expect(result.moe).toBeDefined();
    expect(result.moe!.loads).toHaveLength(64);
    expect(result.moe!.hotspotRatio).toBeGreaterThan(1.05);
    expect(result.moe!.a2aBytes).toBeGreaterThan(0);
    expect(result.moe!.a2aUs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.find((metric) => metric.key === 'moe.hotspotRatio')?.quality).toBe('assumption');
  });

  it('DCP reuses TP ranks and PCP adds explicit ranks', () => {
    const hardware = hardwareProfiles.find((item) => item.id === 'hw-toy-4gpu')!;
    const dcp = generateContextParallelDeployment(hardware, { tp: 4, dp: 1, dcp: 2 });
    expect(dcp.deployment.placement.ranks).toHaveLength(4);
    expect(new Set(dcp.deployment.placement.ranks.map((rank) => rank.dcpGroupId)).size).toBe(2);
    const pcp = generateContextParallelDeployment(hardware, { tp: 2, dp: 1, pcp: 2, dcp: 2 });
    expect(pcp.deployment.placement.ranks).toHaveLength(4);
    expect(new Set(pcp.deployment.placement.ranks.map((rank) => rank.pcpGroupId)).size).toBe(1);
    const tooMuch = generateContextParallelDeployment(hardware, { tp: 4, dp: 1, pcp: 2 });
    expect(tooMuch.issues.some((issue) => issue.code === 'PCP_INSUFFICIENT_DEVICES')).toBe(true);

    // The dense preset declares DCP topology but its GQA layers are
    // head-sharded-tp, so the plan must say that KV is not split by DCP.
    const plan = planScenario(inputsFor('cp-demo'));
    expect(
      plan.limitations.some(
        (line) => line.includes('DCP=2') && line.includes('未声明 context-sharded'),
      ),
    ).toBe(true);
  });
});

describe('M4 PP / SP / MLA / sparse / speculative', () => {
  it('PP adds stages while SP reuses the same TP ranks', () => {
    const plan = planScenario(inputsFor('pp-sp-demo'));
    expect(plan.totals.acceleratorCount).toBe(4);
    expect(plan.pipeline?.ppSize).toBe(2);
    expect(plan.pipeline?.stages).toHaveLength(2);
    expect(plan.pipeline?.stages.map((stage) => stage.layerRange)).toEqual([
      [0, 12],
      [12, 24],
    ]);
    expect(plan.pipeline?.bubbleFraction).toBeGreaterThan(0);
    expect(plan.sequenceParallel?.spSize).toBe(2);
    expect(plan.sequenceParallel?.groupIds).toHaveLength(2);
    expect(plan.sequenceParallel?.collectiveCostUs).toBeGreaterThan(0);
    expect(plan.groups.filter((group) => group.kind === 'PP')).toHaveLength(2);
    expect(plan.groups.filter((group) => group.kind === 'SP')).toHaveLength(2);
    for (const rank of plan.ranks) {
      expect(rank.ppStageIndex).toBeDefined();
      expect(rank.spGroupId).toBeDefined();
      expect(rank.activationBytesPerRank).toBeLessThanOrEqual(3072 * 2);
    }
    // SP groups never cross TP group boundaries.
    for (const spGroup of plan.groups.filter((group) => group.kind === 'SP')) {
      const tpGroups = new Set(
        spGroup.memberRankIds.map((rankId) => plan.ranks.find((rank) => rank.rankId === rankId)?.tpGroupId),
      );
      expect(tpGroups.size).toBe(1);
    }
  });

  it('PP/SP contribute explicit pipeline metrics', () => {
    const result = runSimulation(inputsFor('pp-sp-demo'));
    expect(result.plan.pipeline?.ppSize).toBe(2);
    expect(result.metrics.find((metric) => metric.key === 'pipeline.bubbleFraction')?.quality).toBe('assumption');
    expect(result.metrics.find((metric) => metric.key === 'sp.collectiveUs')?.value).toBeGreaterThan(0);
    expect(result.requests.every((request) => request.status === 'FINISHED')).toBe(true);
  });

  it('splits sharded weights across TP and PP without inflating per-rank residency', () => {
    // Both presets use the same dense model and the same TP×PP product (4), so
    // a PP-aware split must land on nearly the same per-rank weight bytes. If PP
    // were ignored, the TP2×PP2 rank would hold roughly twice as much.
    const tp4 = planScenario(inputsFor('toy-4gpu-tp4-basic'));
    const pp2sp2 = planScenario(inputsFor('pp-sp-demo'));
    const ratio = pp2sp2.ranks[0]!.weightBytes / tp4.ranks[0]!.weightBytes;
    expect(ratio).toBeGreaterThan(0.99);
    expect(ratio).toBeLessThan(1.01);
  });

  it('MLA uses latent + RoPE bytes and DCP sharding, not the GQA head formula', () => {
    const plan = planScenario(inputsFor('mla-dcp-demo'));
    const expected = (24 * (512 + 64) * 2) / 2;
    expect(plan.ranks[0]?.kvBytesPerToken).toBe(expected);
    expect(plan.ranks[0]?.kvQuality).toBe('assumption');
    expect(plan.limitations.some((line) => line.includes('MLA'))).toBe(true);
  });

  it('SFA/DSA require an explicit cache layout and expose its assumptions', () => {
    const plan = planScenario(inputsFor('sfa-dsa-demo'));
    // TP=4: SFA keeps ceil(4/4)=1 KV head per rank; DSA splits latent 256 by 4.
    const expected = 12 * (1 * 128 * 2 * 2) + 12 * (Math.ceil(256 / 4) * 2);
    expect(plan.ranks[0]?.kvBytesPerToken).toBe(expected);
    expect(plan.ranks[0]?.kvQuality).toBe('assumption');
    expect(plan.limitations.some((line) => line.includes('SFA'))).toBe(true);
    expect(plan.limitations.some((line) => line.includes('DSA'))).toBe(true);
  });

  it('the GLM template stays unavailable instead of borrowing GQA numbers', () => {
    const plan = planScenario(inputsFor('ascend-a3-glm53-template'));
    expect(plan.feasibility).toBe('unknown');
    expect(plan.ranks.every((rank) => rank.kvQuality === 'unavailable')).toBe(true);
  });

  it('MTP raises accepted tokens per step and charges draft tokens to the budget', () => {
    const speculativeInputs = inputsFor('speculative-mtp-demo');
    const baselineInputs = inputsFor('speculative-mtp-demo');
    const baselineScenario = JSON.parse(JSON.stringify(baselineInputs.scenario)) as typeof baselineInputs.scenario;
    delete baselineScenario.runtime.speculative;
    baselineScenario.id = 'baseline-no-speculative';

    const speculative = runSimulation(speculativeInputs);
    const baseline = runSimulation({ ...baselineInputs, scenario: baselineScenario });
    const specPlan = speculative.plan.speculative;
    expect(specPlan?.method).toBe('mtp');
    expect(specPlan?.expectedAcceptedTokensPerStep).toBeCloseTo(3.4, 5);
    expect(specPlan?.expectedDecodeSpeedup).toBeCloseTo(3.4 / 1.6, 5);
    expect(speculative.metrics.find((metric) => metric.key === 'speculative.expectedDecodeSpeedup')?.quality).toBe(
      'assumption',
    );

    const specSteps = speculative.metrics.find((metric) => metric.key === 'scheduler.steps')?.value ?? 0;
    const baseSteps = baseline.metrics.find((metric) => metric.key === 'scheduler.steps')?.value ?? 0;
    const specTokens = speculative.requests.reduce((sum, request) => sum + request.generatedTokens, 0);
    const baseTokens = baseline.requests.reduce((sum, request) => sum + request.generatedTokens, 0);
    expect(specTokens).toBe(baseTokens);
    expect(specSteps).toBeLessThan(baseSteps);
  });

  it('DSpark is supported structurally but reported as unknown by the adapter', () => {
    const plan = planScenario(inputsFor('speculative-dspark-demo'));
    expect(plan.speculative?.method).toBe('dspark');
    expect(plan.issues.some((issue) => issue.code === 'FEATURE_UNKNOWN' && issue.message.includes('DSPARK'))).toBe(true);
  });

  it('treats an explicitly unsupported speculative method as unavailable', () => {
    const inputs = inputsFor('speculative-dspark-demo');
    const plan = planScenario({
      ...inputs,
      framework: {
        ...inputs.framework,
        supportedFeatures: { ...inputs.framework.supportedFeatures, dspark: 'unsupported' },
      },
    });
    expect(plan.speculative?.frameworkSupport).toBe('unsupported');
    expect(plan.issues.some((issue) => issue.code === 'FEATURE_UNSUPPORTED')).toBe(true);
    expect(plan.speculative?.note).toContain('明确不支持');
  });
});

describe('M5 calibration scope', () => {
  it('uses matching curves and marks timing calibrated', () => {
    const inputs = inputsFor('toy-4gpu-tp4-basic');
    const dtype = String(inputs.scenario.assumptions.dtype ?? 'bf16');
    const curves: CalibrationCurve[] = [
      {
        id: 'cal-prefill',
        op: 'prefill',
        hardwareProfileId: inputs.hardware.id,
        modelProfileId: inputs.model.id,
        frameworkVersion: inputs.framework.versionTagOrCommit,
        dtype,
        batchMin: 1,
        batchMax: 8,
        seqLenMin: 1,
        seqLenMax: 4096,
        timeUs: 500,
        uncertaintyPct: 8,
      },
      {
        id: 'cal-decode',
        op: 'decode',
        hardwareProfileId: inputs.hardware.id,
        modelProfileId: inputs.model.id,
        frameworkVersion: inputs.framework.versionTagOrCommit,
        dtype,
        batchMin: 1,
        batchMax: 8,
        seqLenMin: 1,
        seqLenMax: 8192,
        timeUs: 40,
        uncertaintyPct: 12,
      },
    ];
    const result = runSimulation(inputs, { calibrationCurves: curves });
    expect(result.calibration?.timingQuality).toBe('calibrated');
    expect(result.calibration?.appliedCurveIds).toEqual(expect.arrayContaining(['cal-prefill', 'cal-decode']));
    expect(result.calibration?.uncertaintyPct).toBe(12);
    const ttft = result.metrics.find((metric) => metric.key === 'ttft.p50');
    expect(ttft?.quality).toBe('calibrated');
    expect(ttft?.reason).toContain('±12%');
  });

  it('rejects curves for another hardware profile', () => {
    const inputs = inputsFor('toy-4gpu-tp4-basic');
    const result = runSimulation(inputs, {
      calibrationCurves: [
        {
          id: 'cal-other-hw',
          op: 'prefill',
          hardwareProfileId: 'hw-does-not-exist',
          modelProfileId: 'model-toy-dense-4b',
          frameworkVersion: 'educational-subset/0.1.0',
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 8,
          seqLenMin: 1,
          seqLenMax: 4096,
          timeUs: 10,
        },
      ],
    });
    expect(result.calibration?.appliedCurveIds).toHaveLength(0);
    expect(result.calibration?.timingQuality).toBe('assumption');
    expect(result.calibration?.note).toContain('没有曲线匹配');
    expect(result.metrics.find((metric) => metric.key === 'ttft.p50')?.quality).toBe('assumption');
  });

  it('matches the prefill curve batch against the actual scheduled sequences', () => {
    const inputs = inputsFor('toy-4gpu-tp4-basic');
    inputs.scenario.runtime.enablePrefixCaching = false;
    const result = runSimulation(inputs, {
      calibrationCurves: [
        {
          id: 'cal-prefill-batch1',
          op: 'prefill',
          hardwareProfileId: inputs.hardware.id,
          modelProfileId: inputs.model.id,
          frameworkVersion: inputs.framework.versionTagOrCommit,
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 1,
          seqLenMin: 1,
          seqLenMax: 4096,
          timeUs: 500,
        },
      ],
    });
    // Four requests are prefilled in the same step, so a batch-1-only curve
    // must not be treated as an exact scope match.
    expect(result.calibration?.appliedCurveIds).not.toContain('cal-prefill-batch1');
    expect(result.calibration?.timingQuality).toBe('assumption');
  });

  it('matches decode curve seqLen per sequence, not aggregate step context', () => {
    const inputs = inputsFor('toy-4gpu-tp4-basic');
    inputs.scenario.runtime.enablePrefixCaching = false;
    const result = runSimulation(inputs, {
      calibrationCurves: [
        {
          id: 'cal-decode-per-seq',
          op: 'decode',
          hardwareProfileId: inputs.hardware.id,
          modelProfileId: inputs.model.id,
          frameworkVersion: inputs.framework.versionTagOrCommit,
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 8,
          seqLenMin: 1,
          seqLenMax: 1500,
          timeUs: 40,
        },
      ],
    });
    // Each sequence is ~1K tokens even though the step's aggregate context is
    // ~4K; the curve applies because its scope is per sequence.
    expect(result.calibration?.appliedCurveIds).toContain('cal-decode-per-seq');
    expect(result.calibration?.outOfScope).toBe(false);
  });

  it('marks out-of-scope curves instead of extrapolating', () => {
    const inputs = inputsFor('toy-4gpu-tp4-basic');
    const result = runSimulation(inputs, {
      calibrationCurves: [
        {
          id: 'cal-decode-too-short',
          op: 'decode',
          hardwareProfileId: inputs.hardware.id,
          modelProfileId: inputs.model.id,
          frameworkVersion: inputs.framework.versionTagOrCommit,
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 8,
          seqLenMin: 1,
          seqLenMax: 100,
          timeUs: 40,
        },
      ],
    });
    expect(result.calibration?.outOfScope).toBe(true);
    expect(result.calibration?.appliedCurveIds).toHaveLength(0);
    expect(result.calibration?.timingQuality).toBe('assumption');
  });
});
