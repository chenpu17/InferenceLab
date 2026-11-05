import { z } from 'zod';
import type { CalibrationCurve, ValidationIssue } from '../domain/types.js';

const id = z.string().min(1).max(128);

const curveSchema = z
  .object({
    id,
    op: z.enum(['prefill', 'decode', 'kv-transfer']),
    hardwareProfileId: id,
    modelProfileId: id,
    frameworkVersion: z.string().min(1).max(200),
    dtype: z.string().min(1).max(32),
    batchMin: z.number().int().min(1),
    batchMax: z.number().int().min(1),
    seqLenMin: z.number().int().min(1),
    seqLenMax: z.number().int().min(1),
    timeUs: z.number().positive(),
    achievedBytesPerSecond: z.number().positive().optional(),
    uncertaintyPct: z.number().min(0).max(100).optional(),
    sourceUrl: z.string().url().optional(),
    measuredAt: z.string().optional(),
    note: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((curve, ctx) => {
    if (curve.batchMax < curve.batchMin) {
      ctx.addIssue({ code: 'custom', path: ['batchMax'], message: 'batchMax 必须 >= batchMin。' });
    }
    if (curve.seqLenMax < curve.seqLenMin) {
      ctx.addIssue({ code: 'custom', path: ['seqLenMax'], message: 'seqLenMax 必须 >= seqLenMin。' });
    }
  });

export const calibrationBundleSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    curves: z.array(curveSchema).min(1).max(2000),
  })
  .strict();

export interface CalibrationImportResult {
  ok: boolean;
  curves: CalibrationCurve[];
  issues: ValidationIssue[];
}

/**
 * Import structured benchmark curves. A curve is only usable when its
 * hardware/model/framework/dtype/scope matches at run time; importing never
 * upgrades unrelated metrics.
 */
export function parseCalibrationBundle(input: unknown): CalibrationImportResult {
  const parsed = calibrationBundleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      curves: [],
      issues: parsed.error.issues.map((issue) => ({
        severity: 'error',
        code: 'CALIBRATION_SCHEMA',
        path: issue.path.join('.'),
        message: issue.message,
        suggestedFix: '提供 schemaVersion="1.0" 与符合字段定义的 curves 数组。',
      })),
    };
  }
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const curves: CalibrationCurve[] = [];
  for (const curve of parsed.data.curves) {
    if (seen.has(curve.id)) {
      issues.push({
        severity: 'warning',
        code: 'CALIBRATION_DUPLICATE_ID',
        path: `curves.${curve.id}`,
        message: `校准曲线 ID ${curve.id} 重复，仅保留第一条。`,
      });
      continue;
    }
    seen.add(curve.id);
    if (curve.op === 'kv-transfer' && curve.achievedBytesPerSecond === undefined) {
      issues.push({
        severity: 'warning',
        code: 'CALIBRATION_KV_TRANSFER_BPS_MISSING',
        path: `curves.${curve.id}.achievedBytesPerSecond`,
        message: `kv-transfer 曲线 ${curve.id} 缺少 achievedBytesPerSecond；timeUs 无法脱离具体 payload 字节数套用，该曲线不会生效。`,
        suggestedFix: '补充实测 achievedBytesPerSecond，或移除该曲线。',
      });
    }
    curves.push(curve);
  }
  return { ok: issues.every((issue) => issue.severity !== 'error'), curves, issues };
}
