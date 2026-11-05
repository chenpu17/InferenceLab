# 07 · 官方资料、版本核验与术语边界

> 核验日期：2026-11-05。以下优先列官方文档。**`latest` 与 `main` 是持续变化的引用**；Agent 开发时必须记录实际采用的 release tag/commit 与访问日期，形成 `packages/adapters/feature-matrix`，不得永久把今天的文档状态写死成“所有版本均支持”。

## 1. vLLM 官方

1. **Architecture Overview / Scheduler**  
   https://docs.vllm.ai/en/latest/design/arch_overview/  
   V1 调度器在 Engine Core 中运作、统一 Token Budget，Running/Waiting 与 Prefix/Speculative 共享循环；可用来设计 V1-subset。
2. **Scheduler Source**  
   https://docs.vllm.ai/en/latest/api/vllm/v1/core/sched/scheduler/  
   对照 `num_computed_tokens` 和 request 预算逻辑；不要复制整个 runtime。
3. **SchedulerConfig**  
   https://docs.vllm.ai/en/latest/api/vllm/config/scheduler/  
   `max_num_batched_tokens`、`max_num_seqs` 与一些更新的参数，语义和组合约束需按版本固定。
4. **Optimization and Tuning**  
   https://docs.vllm.ai/en/latest/configuration/optimization/  
   Chunked Prefill、内存、抢占（V1 默认 recompute）、CPU 资源需求；作为机制与参数的官方依据。
5. **Automatic Prefix Caching**  
   https://docs.vllm.ai/en/stable/design/prefix_caching/  
   Block Pool、Free Queue、Request Blocks、Hash 与 refcount；缓存查找从连续前缀开始。
6. **KV Offloading Usage Guide**  
   https://docs.vllm.ai/en/latest/features/kv_offloading_usage/  
   CPU/Tier offload、异步数据流。特别注意**该页指明 OffloadingConnector 当前适用 CUDA、ROCm、XPU**，不能据此声明 Ascend 同样适配。
7. **KV Config / memory knobs**  
   https://docs.vllm.ai/en/latest/api/vllm/config/  
   `kv_cache_memory_bytes` 与 `gpu_memory_utilization` 的关系及优先级，按 release/runner 检查。

## 2. vLLM-Ascend 官方

1. **Context Parallel Guide**  
   https://docs.vllm.ai/projects/ascend/en/latest/user_guide/feature_guide/context_parallel.html  
   PCP 与 DCP 不同：PCP 可增加 rank；DCP 在具体组合重用 TP/PCP ranks；MLA/GQA/SFA/DSA 的支持矩阵需按版本核验。
2. **Context Parallel Design**  
   https://docs.vllm.ai/projects/ascend/en/main/developer_guide/Design_Documents/context_parallel.html  
   Rank 分布、DCP cache interleave、PCP head-tail 切片等。可作为未来高级模块的设计参考，**不能在 v0.x 不经核实直接套用**。
3. **Disaggregated Prefill Design**  
   https://docs.vllm.ai/projects/ascend/en/main/developer_guide/Design_Documents/disaggregated_prefill.html  
   Mooncake pull、Layerwise push、D→Host staging 等不同 PD 路径，需建立独立传输策略。
4. **KV Cache CPU Offload (Ascend)**  
   https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/kv_cache_cpu_offload.html  
   明确 Ascend 对应实现与 Host pinned / NPU transfer 路径；与上游通用 OffloadingConnector 限制区别对待。
5. **Additional Config**  
   https://docs.vllm.ai/projects/ascend/en/latest/user_guide/configuration/additional_config.html  
   Fine-grained TP、kernel/sampler、KVPP 等，后续高级参数应通过专用插件收纳，避免 MVP 失控。
6. **KV Pool Guide**  
   https://docs.vllm.ai/projects/ascend/en/latest/user_guide/feature_guide/kv_pool.html  
   Host Buffer / Fabric Memory 可能按 Rank 分配，是多级内存模型未来应支持的范例。

## 3. 必须避免的误解

- `SP`、`PCP`、`DCP` 并非同义：SP 往往指特定执行过程的 Activation/Sequence 并行，PCP 用于 Prefill token 计算分片，DCP 用于 Decode KV 分片；实际命名与实现随框架后端不同。
- `DP` 不仅是逻辑“多一点并发”，还改变副本数、缓存独立性、权重驻留以及请求路由；只对简单 rank topology 可用乘法关系。
- `EP` 可能复用与 TP/DP 重叠的物理 Rank；不能简单乘积计算 NPU/GPU 数。
- `MLA` 不得按 MHA/GQA 的 head KV 公式无条件推算，每 Rank cache 布局依运行时分片。
- `gpu_memory_utilization` 是显存整体预算，与 `KV cache utilization` 概念不同；特定版本还提供显式 KV bytes 覆盖。
- `CPU Offload`、`KV Prefix Offload`、`Active KV Swap` 和 `P/D KV Transfer` 是不同操作。
- `max_num_batched_tokens` 是每轮 token budget，不是“最大请求 tokens”或“最大并发数”；`max_num_seqs` 不是 API 最大 TCP 连接数。
- `TTFT` 与 `TPOT` 必须标注计时起点/终点、server/client 口径和测量负载，否则横向比较可能误导。
- 链路 **Gbps / GB/s** 区别，以及网络吞吐的协议/拥塞/跨机链路因素必须呈现。
- 最新官方文档可能已经引入更复杂参数（如 max_num_active_seqs、max_num_scheduled_tokens、KVPP），不代表所有参数必须立即进入 MVP。

## 4. Profile 数据登记规范

每个真实 hardware/model/backend profile 应带：

```yaml
id: <stable-id>
source_urls: [<official reference or measurements>]
retrieved_at: 2026-11-05
framework: vllm-ascend
framework_tag_or_commit: <pin exact>
model_revision: <pin exact>
accelerator_family: <device>
uncertainty:
  - <unknown parameter>
  - <unverified data path>
verification:
  verified_by: <human/test suite>
  measurement_env: <if measured>
```

**用户自己的 GLM-5.3 W4A8C8 / Ascend A3 环境的真实数据需要由用户或压测导入**，比如模型配置、并行拓扑、实际每卡权重/HBM、运行时/通信数据、传输带宽及基准负载。设计包不会假定未核实硬件规格。
