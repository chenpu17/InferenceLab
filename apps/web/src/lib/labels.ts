export const BLOCK_STATE_LABEL: Record<string, string> = {
  FREE: '未占用',
  RESERVED: '已预留',
  PARTIAL: '部分写入',
  COMPLETE: '计算完成',
  CACHED_ACTIVE: '缓存活跃',
  REUSABLE: '待复用',
  EVICTING: '淘汰中',
  OFFLOADING: '写回中',
  HOST_RESIDENT: '主机驻留',
  LOADING: '主机加载中',
};

export const WAITING_REASON_LABEL: Record<string, string> = {
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

export const METRIC_UNIT_LABEL: Record<string, string> = {
  requests: '请求数',
  blocks: 'Block',
  bytes: '字节',
  tokens: 'Token',
  steps: '步',
  events: '事件数',
  routings: '路由次数',
  x: '×',
};

export const UNIT_LABEL = METRIC_UNIT_LABEL;
