export type EntityKind =
  | 'device'
  | 'node'
  | 'engine'
  | 'group'
  | 'request'
  | 'block'
  | 'link'
  | 'metric'
  | 'scenario'
  | 'none';

export interface EntityRef {
  kind: EntityKind;
  id: string;
  parentId?: string;
  label?: string;
}

export function entityKey(entity: EntityRef | null): string {
  if (!entity || entity.kind === 'none') return 'none';
  return `${entity.kind}:${entity.id}`;
}

export function sameEntity(a: EntityRef | null, b: EntityRef | null): boolean {
  return entityKey(a) === entityKey(b);
}

export function entityLabel(entity: EntityRef | null): string {
  if (!entity || entity.kind === 'none') return '全局视图';
  if (entity.label) return entity.label;
  switch (entity.kind) {
    case 'device':
      return `设备 ${entity.id}`;
    case 'node':
      return `节点 ${entity.id}`;
    case 'engine':
      return `Engine ${entity.id}`;
    case 'group':
      return `并行组 ${entity.id}`;
    case 'request':
      return `请求 ${entity.id}`;
    case 'block':
      return `KV Block ${entity.id}`;
    case 'link':
      return `链路 ${entity.id}`;
    case 'metric':
      return `指标 ${entity.id}`;
    default:
      return entity.id;
  }
}

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
  device: '加速卡',
  node: '服务器节点',
  engine: '调度引擎',
  group: '并行组',
  request: '请求',
  block: 'KV Block',
  link: '链路',
  metric: '指标',
  scenario: '场景',
  none: '全局',
};
