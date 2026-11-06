import type { Lens } from '../store/useLabStore';

export interface LensDefinition {
  id: Lens;
  label: string;
  title: string;
  hint: string;
  why: string;
}

export const LENS_DEFINITIONS: readonly LensDefinition[] = [
  {
    id: 'topology',
    label: '拓扑',
    title: '物理拓扑 · 并行部署',
    hint: '物理拓扑 / TP·DP·EP 组',
    why: '设备位置来自 Plan.resolvedRanks，TP 改变只重组组边界与 DP 副本，不移动物理卡。',
  },
  {
    id: 'memory',
    label: '显存',
    title: 'HBM 与 KV · 双层账本',
    hint: 'HBM 预算 / KV Pool / Block',
    why: 'KV Pool 是 HBM 预算中的已预留段；Block 增长只改变内层 used/free，不重复增加外层 HBM 承诺。',
  },
  {
    id: 'scheduler',
    label: '调度',
    title: '请求队列 · Token Budget',
    hint: 'Waiting / Running / Token Budget',
    why: '预算按 max_num_batched_tokens 扣减；这是 vLLM V1 的机制子集，并非逐行复刻源码。',
  },
  {
    id: 'transport',
    label: '传输',
    title: '链路 · 传输 · 竞争域',
    hint: '链路 / 传输 / 竞争域',
    why: '传输时长与共享竞争域来自 TransferScheduler；没有物理路径时不会凭空画连线。',
  },
  {
    id: 'metrics',
    label: '指标',
    title: '关键路径 · 证据与质量',
    hint: '关键路径 / 证据 / 质量',
    why: '时间指标使用标注过的合成成本模型；输出 ≤1 token 时 TPOT 显示 N/A，不猜数字。',
  },
] as const;

export const lensDefinition = (lens: Lens): LensDefinition =>
  LENS_DEFINITIONS.find((definition) => definition.id === lens)!;
