/**
 * Chinese overrides for English domain tokens that must stay English in code.
 * UI copy belongs in the Chinese source strings and the `en/*` fragments; this
 * file only covers enums and generated labels that are rendered through `lt()`.
 */
export const zh = {
  // Request / entity status
  ARRIVED: '已到达',
  WAITING: '等待',
  RUNNING: '运行中',
  WAITING_FOR_REMOTE_KV: '等待远端 KV',
  PREEMPTED: '被抢占',
  FINISHED: '已完成',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
  BUSY: '忙碌',
  IDLE: '空闲',
  READY: '就绪',
  LOADING: '加载中',
  UNKNOWN: '未知',
  INVALID: '非法',
  PENDING: '待处理',
  ACTIVE: '活跃',
  DONE: '完成',

  // Block location
  DEVICE: '设备',
  HOST: '主机',

  // Engine roles
  prefill: 'Prefill',
  decode: 'Decode',
  mixed: '混合',
} as const;
