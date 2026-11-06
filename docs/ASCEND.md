# Ascend 910C / 950DT 仿真 Profile

本页记录 InferenceLab 中两款 Ascend 机型的建模口径。它们用于**机制与容量仿真**，不是 CANN/torch_npu/MindIE 执行器，也不声称复现某版本 vLLM-Ascend 的实测性能。

## 支持的 Profile

| Profile ID | 机型 | 规模 | 用途 |
|---|---|---|---|
| `hw-ascend-910c-a3-384` | Atlas 900 A3 SuperPoD / Ascend 910C | 48 节点 × 8 NPU = 384 | 910C 主流训练/推理拓扑、MoE/EP 与 UB 传输 |
| `hw-ascend-950dt-rack-64` | Ascend 950DT | 8 节点 × 8 NPU = 64 | 950DT 单机柜、PD 分离、MLA/MTP |
| `hw-ascend-a3-template` | 旧结构模板 | 8 节点 × 8 NPU = 64 | 仅用于 unknown 边界回归，不可用于容量/时间结论 |

对应场景预设：

- `ascend-910c-384-moe-ep`：TP16 × DP24，EP8，MoE；48 条 4K Prompt 请求。
- `ascend-950dt-64-pd-mla-mtp`：P/D 各 TP8 × DP4，PD_PULL，MLA latent KV，MTP Draft 4 / 接受率 0.6。

## 规格与来源

检索日期：**2026-11-06**。公开规格可能随厂商页面更新；升级 Profile 时应重新核对并更新 `version`。

### Atlas 900 A3 SuperPoD / 910C

| 项 | 建模值 | 证据类型 |
|---|---|---|
| 拓扑 | 48 节点 × 8 NPU，共 384 | 厂商页面 |
| HBM | 128 GB / NPU | 厂商页面 |
| HBM 带宽 | 3.2 TB/s / NPU | 厂商页面 |
| 整机 FP16 | 307.2 PFLOPS | 厂商页面 |
| 单 NPU FP16 | 800 TFLOPS | 推导（307.2 PFLOPS ÷ 384） |
| UB | 784 GB/s 双向；392 GB/s 单向 | 厂商页面 |
| UB 单跳延迟 | 1 µs | 仿真假设 |
| 链路有效效率 | 0.8 | 仿真假设 |
| 主机 PCIe | 64 GB/s / NPU | 仿真假设 |
| 节点 CPU/DRAM | 192 核 / 2 TiB | 仿真假设 |

来源：

- Huawei Atlas 900 A3 SuperPoD 产品页：<https://e.huawei.com/cn/products/computing/ascend/atlas-900-a3-superpod>
- 384 卡网络拓扑参考（二手）：<https://www.cnblogs.com/yangykaifa/p/19682882>
- CloudMatrix 384 架构背景（二手）：<https://news.qq.com/rain/a/20250707A07ZGJ00>

### Ascend 950DT

| 项 | 建模值 | 证据类型 |
|---|---|---|
| 拓扑 | 8 节点 × 8 NPU，单机柜 64 卡 | 公开报道 |
| HBM | 144 GB HiZQ 2.0 / NPU | 公开报道 |
| HBM 带宽 | 4 TB/s / NPU | 公开报道 |
| FP8 | 1 PFLOPS / NPU | 公开报道 |
| FP4 | 2 PFLOPS / NPU | 公开报道；当前成本模型不使用 |
| UB | 2 TB/s 双向；1 TB/s 单向 | 公开报道 |
| UB 单跳延迟 | 0.2 µs（约 200 ns） | 公开报道 |
| 链路有效效率 | 0.8 | 仿真假设 |
| 主机 PCIe | 64 GB/s / NPU | 仿真假设 |
| 节点 CPU/DRAM | 192 核 / 2 TiB | 仿真假设 |

来源（均为公开报道/白皮书转述，非一手 PDF）：

- <https://news.mydrivers.com/1/1128/1128973.htm>
- <https://www.d1ev.com/newsflash/315011>
- <https://caifuhao.eastmoney.com/news/20260609074541779565070>

## 建模口径

### 1. 非阻塞 UB 抽象

两款 Profile 都为每张 NPU 建一条到伪 Fabric 节点的直连链路，并给每条上行链路单独的 `ContentionDomain`：

```text
NPU A ── UB link ── ub-fabric ── UB link ── NPU B
```

- 不同源 NPU 的传输使用不同竞争域，可以并行；
- 同一源 NPU 的并发传输仍会在上行端口排队；
- 不建一个全局 Fabric 竞争域，否则 `TransferScheduler` 会把所有 KV 传输错误地串行化。

路径由 `findTransferPath` 的 BFS 生成，固定为两跳；延迟为两段链路之和。

### 2. 单峰值算力

当前成本模型每个 NPU 只读取一个 `assumedTflops`：

- 910C 使用 800 TFLOPS FP16；
- 950DT 使用 1000 TFLOPS FP8，场景 `assumptions.dtype = 'fp8'`；
- 950DT 的 FP4 2 PFLOPS 不参与计算；
- 仿真不按 dtype 切换峰值，因此不要把 950DT 场景的结果解释为 BF16 或 FP4 实测。

### 3. 框架能力边界

`fw-ascend-vllm-teaching` 是保守教学矩阵，不是任何 CANN/vLLM-Ascend 发行版的等价声明：

- `chunked_prefill`、`prefix_caching`、`preemption_recompute`、`scheduler_v1_subset`：supported；
- `pd_disaggregation`、`expert_parallel`、`mla`、`speculative_decoding`、`mtp`、`layerwise_kv_transfer`、`host_staging_kv_transfer`：partial；
- `cpu_offload`、`pipeline_parallel`、`sequence_parallel`、`context_parallel`、`sparse_attention`、`dspark`：unknown。

真实接入时必须按具体 vLLM-Ascend / CANN 版本重新核对；不能把 `partial` 当作“官方已支持”。

### 4. 规模限制

- 950DT 只建**单机柜 64 卡**，不建 8192 卡 Atlas 950 SuperPoD；跨机柜/跨 SuperPoD 的过订阅与层级延迟未建模。
- 910C 的 12 个计算机柜与 4 个总线机柜被压平为“48 节点 + 非阻塞 UB Fabric”；没有交换机层级、过订阅或故障域。
- 384 卡 Topology 会渲染 48 个节点卡片；移动端只保证概览，不保证完整编辑体验。

## 使用与验证

在 UI 的“实验”页或 Header 场景选择器中选择上述预设。也可以直接运行：

```bash
pnpm --filter @inferencelab/profiles test ascend
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm e2e
```

`packages/profiles/test/ascend.test.ts` 覆盖：

- 两款 Profile 的节点/NPU/HBM/算力/UB 数量；
- 不同源 NPU 并行、同源 NPU 串行的竞争域行为；
- 910C 384 Rank、24 Engine、48 个 EP8 组；
- 950DT PD 运行产生 `PD_KV_TRANSFER`；
- 旧 `ascend-a3-glm53-template` 仍保持 unknown。

## 明确不支持

- 在 NVIDIA GPU 上“原生运行” Ascend 算子；
- 通过 CUDA 驱动执行 CANN/torch_npu；
- 把本 Profile 的时间指标当作厂商实测或 SLA；
- 未公开的 CPU/DRAM/PCIe/延迟数字被自动推断为精确值。
