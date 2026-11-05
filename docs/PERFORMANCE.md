# Performance

## 方法

性能用例位于 `apps/web/e2e/performance.spec.ts`，在 Playwright Chromium（单 worker、本机 Vite dev server、1440×900）中执行：

1. 加载 `high-density-demo`：48 条请求 × 8192 prompt / 1000 output Token。
2. 点击运行，等待 Worker 返回事件 header 与分块事件，记录 `runReadyMs`。
3. 使用 `PerformanceObserver` 收集 long task；启动播放后，用 `requestAnimationFrame` 统计回放期间的帧间隔。
4. 在 Timeline 上 Seek 到场景中段，记录从点击到虚拟时间标签实际变化完成的延迟；若标签未变化则判失败。
5. 结果写入 `docs/performance-report.json`。

最新报告生成时间：2026-11-05T11:41:14.210Z。

## 结果

| 指标 | 实测 | 目标 | 结论 |
|---|---:|---:|---|
| 运行就绪 `runReadyMs` | 2302 ms | 无硬性目标 | Worker 仿真约 2 s，主线程保持可交互 |
| long task 数量 | 4 | — | 均为事件分块/状态应用 |
| long task P95 | 116 ms | < 150 ms | 通过 |
| long task 最大 | 116 ms | < 150 ms | 通过 |
| 回放帧数（1.5 s） | 87 | > 30 | 通过 |
| 帧间隔 P95 | 16.8 ms | < 34 ms（≥30fps） | 通过 |
| 回放是否推进 | 是 | 必须为是 | 通过 |
| Seek 标签是否变化 | 是（0.00 µs → 11.61 s） | 必须为是 | 通过 |
| Seek 延迟 | 238.4 ms | < 300 ms | 通过 |

同日多轮完整 E2E 的 `seekLatencyMs` 在 216–262 ms 之间、long task P95 在 103–120 ms 之间、`runReadyMs` 在 1651–2358 ms 之间；波动来自机器负载与浏览器调度，趋势一致。

## 解释

- **Worker 隔离了仿真。** 18.8 万事件的生成与排序在 Worker 中完成；主线程只接收分块事件并构建 Timeline。
- **检查点换 Seek 延迟。** 每 10,000 事件保存完整视图状态，Seek 从最近检查点开始应用事件，避免从头重放。代价是内存占用增加。
- **事件分块避免单次大消息。** header + 事件 chunk + checkpoint 消息的顺序协议让 UI 能在接收过程中保持响应。
- **帧率只统计动画期间的 rAF。** 静止画面没有持续动画；Reduced Motion 下不进行连续播放。

## 复现

```bash
pnpm install
pnpm --filter @inferencelab/web exec playwright install chromium
cd apps/web
pnpm exec playwright test e2e/performance.spec.ts --reporter=line
```

报告会覆盖 `docs/performance-report.json`。阈值是开发机目标，不是硬件无关保证；在 CI 或低性能设备上应结合 `docs/UX_REVIEW.md` 的交互检查一起判断。
