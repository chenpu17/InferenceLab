import { describe, expect, it } from 'vitest';
import {
  KvCacheManager,
  generateDeployment,
  parseCalibrationBundle,
  planScenario,
  validateScenarioSemantics,
} from '../src/index.js';
import { pdTestScenario, testFramework, testHardware, testModel, testScenario } from './fixtures.js';

function kvManager(capacity = 8): KvCacheManager {
  return new KvCacheManager({
    engineId: 'engine-0',
    poolId: 'pool-0',
    capacityBlocks: capacity,
    blockSize: 4,
    bytesPerBlock: 1024,
  });
}

describe('placement', () => {
  it('generates explicit ranks instead of multiplying parallel dims blindly', () => {
    const generated = generateDeployment(testHardware(), { tp: 2, dp: 2 });
    expect(generated.deployment.placement.ranks).toHaveLength(4);
    expect(generated.deployment.engines).toHaveLength(2);
    const accelerators = generated.deployment.placement.ranks.map((r) => r.acceleratorId);
    expect(new Set(accelerators).size).toBe(4);
  });

  it('reports insufficient devices', () => {
    const generated = generateDeployment(testHardware(), { tp: 4, dp: 2 });
    expect(generated.issues.some((i) => i.code === 'PLACEMENT_INSUFFICIENT_DEVICES')).toBe(true);
  });

  it('adds PP stages while SP reuses TP ranks', () => {
    const generated = generateDeployment(testHardware(), { tp: 2, dp: 1, pp: 2, sp: 2 });
    expect(generated.deployment.placement.ranks).toHaveLength(4);
    expect(generated.deployment.placement.ranks.map((rank) => rank.ppStageIndex)).toEqual([0, 0, 1, 1]);
    const spGroups = new Set(generated.deployment.placement.ranks.map((rank) => rank.spGroupId));
    expect(spGroups.size).toBe(2);
    for (const rank of generated.deployment.placement.ranks) {
      expect(rank.spGroupId).toBeDefined();
    }
  });

  it('rejects SP larger than TP', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { tp: 2 },
    );
    scenario.runtime.spSize = 4;
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    });
    expect(issues.some((issue) => issue.code === 'SP_EXCEEDS_TP')).toBe(true);
  });

  it('validates PP stage count, stage size and unused stage ids', () => {
    const base = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const registry = {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    };
    const countScenario = structuredClone(base);
    countScenario.deployment.logicalParallelism.pp = 2;
    expect(
      validateScenarioSemantics(countScenario, registry).some((issue) => issue.code === 'PP_STAGE_COUNT'),
    ).toBe(true);

    const generated = generateDeployment(testHardware(), { tp: 2, dp: 1, pp: 2 });
    const sizeScenario = { ...structuredClone(base), deployment: generated.deployment };
    sizeScenario.deployment.logicalParallelism.pp = 2;
    sizeScenario.deployment.placement.ranks[0]!.ppStageId = 'pp-solo';
    expect(
      validateScenarioSemantics(sizeScenario, registry).some((issue) => issue.code === 'PP_STAGE_SIZE'),
    ).toBe(true);

    const unusedScenario = structuredClone(base);
    unusedScenario.deployment.placement.ranks[0]!.ppStageId = 'pp-0';
    expect(
      validateScenarioSemantics(unusedScenario, registry).some((issue) => issue.code === 'PP_STAGE_UNUSED'),
    ).toBe(true);
  });

  it('rejects PP combined with PD or PCP', () => {
    const registry = {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    };
    const pd = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    pd.deployment.engines = [
      { id: 'p-engine', role: 'prefill', rankIds: ['r0'], schedulerId: 'p-s', cacheManagerId: 'p-c' },
      { id: 'd-engine', role: 'decode', rankIds: ['r1'], schedulerId: 'd-s', cacheManagerId: 'd-c' },
    ];
    pd.deployment.logicalParallelism = { prefillTp: 1, prefillDp: 1, decodeTp: 1, decodeDp: 1, pp: 2 };
    expect(
      validateScenarioSemantics(pd, registry).some((issue) => issue.code === 'PP_PD_COMBINATION_UNSUPPORTED'),
    ).toBe(true);

    const pcp = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    pcp.deployment.logicalParallelism.pp = 2;
    pcp.runtime.pcpSize = 2;
    expect(
      validateScenarioSemantics(pcp, registry).some((issue) => issue.code === 'PP_PCP_COMBINATION_UNSUPPORTED'),
    ).toBe(true);
  });

  it('validates SP group presence, size and TP membership', () => {
    const registry = {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    };
    const missing = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    missing.runtime.spSize = 2;
    expect(
      validateScenarioSemantics(missing, registry).some((issue) => issue.code === 'SP_GROUPS_MISSING'),
    ).toBe(true);

    const generated = generateDeployment(testHardware(), { tp: 4, dp: 1, sp: 2 });
    const size = { ...testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 }), deployment: generated.deployment };
    size.runtime.spSize = 2;
    size.deployment.placement.ranks[0]!.spGroupId = 'sp-solo';
    expect(
      validateScenarioSemantics(size, registry).some((issue) => issue.code === 'SP_GROUP_SIZE'),
    ).toBe(true);

    const crossing = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { tp: 2, dp: 2 },
    );
    crossing.runtime.spSize = 2;
    crossing.deployment.placement.ranks[0]!.spGroupId = 'sp-cross';
    crossing.deployment.placement.ranks[2]!.spGroupId = 'sp-cross';
    expect(
      validateScenarioSemantics(crossing, registry).some((issue) => issue.code === 'SP_GROUP_CROSSES_TP'),
    ).toBe(true);
  });
});

describe('memory planning', () => {
  it('separates HBM budget, fixed occupancy and KV pool', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { kvCacheMemoryBytes: 2_000_000 },
    );
    const plan = planScenario({ scenario, hardware: testHardware(), model: testModel(), framework: testFramework() });
    expect(plan.feasibility).toBe('feasible');
    const rank = plan.ranks[0]!;
    expect(rank.hbmBudgetBytes).toBeGreaterThan(rank.hbmCommittedBytes - rank.kvPoolReservedBytes);
    expect(rank.kvPoolReservedBytes).toBe(2_000_000);
    expect(rank.maxKvBlocks).toBeGreaterThan(0);
    expect(rank.kvBytesPerBlock).toBe(rank.kvBytesPerToken * scenario.runtime.blockSize);
  });

  it('marks unknown model layouts as unknown, not feasible', () => {
    const model = testModel();
    model.tensorInventory = [{ id: 'opaque', logicalBytes: 0, rule: 'opaque' }];
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const plan = planScenario({ scenario, hardware: testHardware(), model, framework: testFramework() });
    expect(plan.feasibility).toBe('unknown');
  });

  it('does not fabricate KV capacity when weight bytes are unknown', () => {
    const model = testModel();
    model.tensorInventory = [{ id: 'opaque', logicalBytes: 0, rule: 'opaque' }];
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { kvCacheMemoryBytes: 2_000_000 },
    );
    const plan = planScenario({ scenario, hardware: testHardware(), model, framework: testFramework() });
    const rank = plan.ranks[0]!;
    expect(plan.feasibility).toBe('unknown');
    expect(rank.capacityQuality).toBe('unavailable');
    // The explicit KV budget is still a declared input, not a derived capacity.
    expect(rank.kvPoolReservedBytes).toBe(2_000_000);
    expect(rank.maxKvBlocks).toBeGreaterThan(0);
    expect(plan.issues.some((issue) => issue.code === 'CAPACITY_UNKNOWN_EXPLICIT_KV')).toBe(true);
  });

  it('reports zero KV blocks when the KV layout itself is opaque', () => {
    const model = testModel();
    model.attentionLayers = model.attentionLayers.map((layer) => ({ ...layer, kvLayout: 'opaque' }));
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { kvCacheMemoryBytes: 2_000_000 },
    );
    const plan = planScenario({ scenario, hardware: testHardware(), model, framework: testFramework() });
    const rank = plan.ranks[0]!;
    expect(plan.feasibility).toBe('unknown');
    expect(rank.capacityQuality).toBe('unavailable');
    expect(rank.kvQuality).toBe('unavailable');
    expect(rank.kvPoolReservedBytes).toBe(0);
    expect(rank.maxKvBlocks).toBe(0);
  });

  it('uses an explicit sparse layout for WINDOW attention', () => {
    const model = testModel();
    model.numLayers = 1;
    model.attentionLayers = [
      {
        layerIndex: 0,
        kind: 'WINDOW',
        kvLayout: 'head-sharded-tp',
        sparseKV: {
          cacheGroup: 'window-cache',
          storage: 'window',
          nKVHeads: 8,
          headDim: 16,
          dtypeBytes: 2,
          windowTokens: 64,
        },
      },
    ];
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const plan = planScenario({ scenario, hardware: testHardware(), model, framework: testFramework() });
    // TP=4: 2 of 8 KV heads per rank, K and V at 2 bytes each.
    expect(plan.ranks[0]!.kvBytesPerToken).toBe(2 * 16 * 2 * 2);
  });

  it('honors an explicit sparse layout on a GQA layer', () => {
    const model = testModel();
    model.numLayers = 1;
    model.attentionLayers = [
      {
        layerIndex: 0,
        kind: 'GQA',
        kvLayout: 'head-sharded-tp',
        sparseKV: {
          cacheGroup: 'compressed-cache',
          storage: 'compressed',
          kvLatentDim: 64,
          dtypeBytes: 2,
        },
      },
    ];
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const plan = planScenario({ scenario, hardware: testHardware(), model, framework: testFramework() });
    // Explicit compressed layout wins over the dense GQA formula; TP=4 shards
    // the latent dimension: 16 * 2 bytes per token.
    expect(plan.ranks[0]!.kvBytesPerToken).toBe(32);
    expect(plan.limitations.some((limitation) => limitation.includes('compressed'))).toBe(true);
  });

  it('marks HYBRID attention without an explicit cache layout as unavailable', () => {
    const model = testModel();
    model.numLayers = 1;
    model.attentionLayers = [{ layerIndex: 0, kind: 'HYBRID', kvLayout: 'head-sharded-tp' }];
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const plan = planScenario({ scenario, hardware: testHardware(), model, framework: testFramework() });
    expect(plan.ranks[0]!.kvQuality).toBe('unavailable');
    expect(plan.limitations.some((limitation) => limitation.includes('HYBRID'))).toBe(true);
  });

  it('detects HBM over-budget', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { kvCacheMemoryBytes: 100_000_000 },
    );
    const model = testModel({ weightBytes: 8_000_000_000 });
    const plan = planScenario({ scenario, hardware: testHardware(), model, framework: testFramework() });
    expect(plan.feasibility).toBe('infeasible');
    expect(plan.issues.some((i) => i.code === 'HBM_OVER_BUDGET')).toBe(true);
  });

  it('validates framework feature support', () => {
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    scenario.runtime.enableExpertParallel = true;
    scenario.deployment.logicalParallelism.ep = 2;
    const framework = testFramework();
    framework.supportedFeatures.expert_parallel = 'unsupported';
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => framework,
    });
    expect(issues.some((i) => i.code === 'FEATURE_UNSUPPORTED')).toBe(true);
  });

  it('requires a MoE model before enabling expert parallelism', () => {
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    scenario.runtime.enableExpertParallel = true;
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    });
    expect(issues.some((i) => i.code === 'EP_REQUIRES_MOE')).toBe(true);
  });

  it('rejects EP larger than the explicit rank set', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { tp: 2, dp: 1 },
    );
    scenario.runtime.enableExpertParallel = true;
    scenario.deployment.logicalParallelism.ep = 4;
    const model = testModel();
    model.moe = { expertCount: 8, topK: 2, expertBytes: 1_000_000 };
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => model,
      getFramework: () => testFramework(),
    });
    expect(issues.some((i) => i.code === 'EP_EXCEEDS_RANKS')).toBe(true);
  });

  it('rejects DCP larger than TP because DCP cannot add ranks', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { tp: 4, dp: 1 },
    );
    scenario.runtime.dcpSize = 8;
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    });
    expect(issues.some((i) => i.code === 'DCP_EXCEEDS_TP')).toBe(true);
  });

  it('treats windowed attention as sparse support for feature checks', () => {
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    const model = testModel();
    model.attentionLayers = model.attentionLayers.map((layer) => ({
      ...layer,
      kind: 'WINDOW' as const,
      windowTokens: 4,
    }));
    const framework = testFramework();
    framework.supportedFeatures.sparse_attention = 'unsupported';
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => model,
      getFramework: () => framework,
    });
    expect(issues.some((i) => i.code === 'FEATURE_UNSUPPORTED' && i.path === 'modelProfileId')).toBe(true);
  });

  it('checks scheduler features that the run actually uses', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { enablePrefixCaching: true },
    );
    const framework = testFramework();
    framework.supportedFeatures.prefix_caching = 'unsupported';
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => framework,
    });
    expect(issues.some((i) => i.code === 'FEATURE_UNSUPPORTED' && i.path === 'runtime.enablePrefixCaching')).toBe(true);
  });

  it('surfaces partial feature support without blocking the plan', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 },
      { enableChunkedPrefill: true },
    );
    const framework = testFramework();
    framework.supportedFeatures.chunked_prefill = 'partial';
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => framework,
    });
    expect(
      issues.some((i) => i.code === 'FEATURE_PARTIAL' && i.path === 'runtime.enableChunkedPrefill'),
    ).toBe(true);
    expect(issues.some((i) => i.code === 'FEATURE_UNSUPPORTED')).toBe(false);
  });

  it('warns when a fixed workload exceeds max_model_len', () => {
    const scenario = testScenario(
      { kind: 'fixed', count: 1, promptTokens: 32, outputTokens: 8, atUs: 0 },
      { maxModelLen: 32 },
    );
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    });
    expect(
      issues.some((i) => i.code === 'WORKLOAD_EXCEEDS_MODEL_LEN' && i.path === 'workload'),
    ).toBe(true);
  });

  it('checks the agent last turn against the simulator prompt growth', () => {
    const scenario = testScenario(
      {
        kind: 'agent',
        conversations: 1,
        turns: 3,
        baseSystemTokens: 100,
        turnIncrementTokens: 50,
        outputTokens: 10,
        toolWaitUs: 0,
      },
      { maxModelLen: 220 },
    );
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    });
    // Last prompt = 100 + 2*(50+10) = 220, plus 10 output = 230 > 220.
    expect(issues.some((i) => i.code === 'AGENT_EXCEEDS_MODEL_LEN')).toBe(true);
    expect(issues.some((i) => i.code === 'WORKLOAD_EXCEEDS_MODEL_LEN')).toBe(false);
  });

  it('rejects links that reference an undeclared contention domain', () => {
    const hardware = testHardware();
    hardware.links[0]!.contentionDomainId = 'dom-missing';
    const issues = validateScenarioSemantics(
      testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 }),
      {
        getHardware: () => hardware,
        getModel: () => testModel(),
        getFramework: () => testFramework(),
      },
    );
    expect(
      issues.some(
        (i) =>
          i.code === 'LINK_DOMAIN_MISSING' &&
          i.path === `hardware.links.${hardware.links[0]!.id}.contentionDomainId`,
      ),
    ).toBe(true);
  });

  it('rejects CPU_OFFLOAD as a PD engine transfer strategy', () => {
    const scenario = pdTestScenario(
      { kind: 'trace', requests: [{ id: 'A', atUs: 0, promptTokens: 8, outputTokens: 2 }] },
      { blockSize: 4, maxNumBatchedTokens: 64, maxNumSeqs: 2 },
    );
    scenario.deployment.kvTransfer = { ...scenario.deployment.kvTransfer!, strategy: 'CPU_OFFLOAD' };
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => testFramework(),
    });
    expect(issues.some((i) => i.code === 'PD_STRATEGY_INVALID')).toBe(true);
  });

  it('models backend-specific preemption as recompute and checks the feature', () => {
    const scenario = testScenario({ kind: 'fixed', count: 1, promptTokens: 8, outputTokens: 2, atUs: 0 });
    scenario.runtime.preemptionPolicy = 'backend-specific';
    const framework = testFramework();
    framework.supportedFeatures.preemption_recompute = 'unsupported';
    const issues = validateScenarioSemantics(scenario, {
      getHardware: () => testHardware(),
      getModel: () => testModel(),
      getFramework: () => framework,
    });
    expect(issues.some((i) => i.code === 'PREEMPTION_BACKEND_SPECIFIC')).toBe(true);
    expect(
      issues.some(
        (i) => i.code === 'FEATURE_UNSUPPORTED' && i.path === 'runtime.preemptionPolicy',
      ),
    ).toBe(true);
  });
});

describe('KV cache', () => {
  it('matches only contiguous full blocks', () => {
    const kv = kvManager();
    const hashes = ['a', 'b', 'c', 'd'];
    const alloc = kv.allocateFor(
      'req-1',
      4,
      0,
      (i) => hashes[i] ?? null,
      (i) => hashes[i - 1] ?? null,
    );
    expect(alloc.ok).toBe(true);
    kv.completeFullBlocks('req-1', 16, hashes, 0);
    kv.releaseRequest('req-1', 1, true);

    const hit = kv.lookupPrefix(['a', 'b', 'c', 'd'], 2);
    expect(hit.hitTokens).toBe(16);
    expect(hit.hitBlockIds).toHaveLength(4);

    // A hole stops matching even if a later hash exists.
    const partial = kvManager();
    partial.allocateFor('req-2', 4, 0, (i) => hashes[i] ?? null, () => null);
    partial.completeFullBlocks('req-2', 8, hashes, 0);
    partial.releaseRequest('req-2', 1, true);
    const hole = partial.lookupPrefix(['a', 'b', 'c', 'd'], 2);
    expect(hole.hitTokens).toBe(8);
  });

  it('evicts LRU reusable blocks and never evicts referenced blocks', () => {
    const kv = kvManager(2);
    kv.allocateFor('a', 2, 0, () => null, () => null);
    kv.completeFullBlocks('a', 8, ['h0', 'h1'], 0);
    kv.releaseRequest('a', 1, true);
    kv.allocateFor('b', 2, 2, () => null, () => null);
    kv.completeFullBlocks('b', 8, ['h2', 'h3'], 2);
    expect(kv.stats.freeBlocks).toBe(0);
    expect(kv.evict(1, 3)).toHaveLength(0);
    kv.releaseRequest('b', 4, true);
    const evicted = kv.evict(1, 5);
    expect(evicted).toHaveLength(1);
    expect(kv.stats.freeBlocks).toBe(1);
  });

  it('frees partial blocks but retains full hashed blocks', () => {
    const kv = kvManager();
    kv.allocateFor('a', 2, 0, (i) => (i === 0 ? 'h0' : null), () => null);
    kv.completeFullBlocks('a', 4, ['h0'], 0);
    const mutations = kv.releaseRequest('a', 1, true);
    expect(mutations.some((m) => m.detail.retained === true)).toBe(true);
    expect(kv.usedBlocks).toBe(1);
    expect(kv.stats.freeBlocks).toBe(7);
  });
});

describe('calibration import', () => {
  it('rejects a curve whose scope bounds are inverted', () => {
    const result = parseCalibrationBundle({
      schemaVersion: '1.0',
      curves: [
        {
          id: 'bad-scope',
          op: 'prefill',
          hardwareProfileId: 'hw-test',
          modelProfileId: 'model-test',
          frameworkVersion: '1',
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 1,
          seqLenMin: 10,
          seqLenMax: 5,
          timeUs: 100,
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'CALIBRATION_SCHEMA')).toBe(true);
  });

  it('keeps the first curve when IDs are duplicated', () => {
    const curve = {
      id: 'dup',
      op: 'prefill' as const,
      hardwareProfileId: 'hw-test',
      modelProfileId: 'model-test',
      frameworkVersion: '1',
      dtype: 'bf16',
      batchMin: 1,
      batchMax: 1,
      seqLenMin: 1,
      seqLenMax: 10,
      timeUs: 100,
    };
    const result = parseCalibrationBundle({
      schemaVersion: '1.0',
      curves: [curve, { ...curve, timeUs: 200 }],
    });
    expect(result.ok).toBe(true);
    expect(result.curves).toHaveLength(1);
    expect(result.curves[0]!.timeUs).toBe(100);
    expect(result.issues.some((issue) => issue.code === 'CALIBRATION_DUPLICATE_ID')).toBe(true);
  });

  it('warns when a kv-transfer curve has no achieved bandwidth', () => {
    const result = parseCalibrationBundle({
      schemaVersion: '1.0',
      curves: [
        {
          id: 'kv-no-bps',
          op: 'kv-transfer',
          hardwareProfileId: 'hw-test',
          modelProfileId: 'model-test',
          frameworkVersion: '1',
          dtype: 'bf16',
          batchMin: 1,
          batchMax: 8,
          seqLenMin: 1,
          seqLenMax: 4096,
          timeUs: 1000,
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'CALIBRATION_KV_TRANSFER_BPS_MISSING')).toBe(true);
  });
});
