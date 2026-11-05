# 09 · 十个教学与工程分析实验（从近到远）

> 这些不是十份独立动画，而是共享同一核心仿真引擎的预设 Scenario。所有绝对 TTFT/TPOT 只有在具有经校准时间模型时才给出可信参考；否则展示假设数据/结构差异。

## 实验 1：TP 与 DP 怎样共享 32 张卡？（M1）

- 输入：Toy 2Node/32GPU，Toy GQA，TP16×DP2 vs TP8×DP4。
- 动画：两个/四个 Replica，不同 Rank→Device 映射，Group 内 collective 示意。
- 输出：每卡权重、runtime、KV reserve、剩余 HBM；独立 Scheduler 数。
- 验收：32 张卡的总映射不变；Replica 数变化正确；无未经验证的 EP 数字。

## 实验 2：显存预算为什么与 KV 水位不同？（M1/M2）

- 输入：单卡合成 16GiB HBM，权重/Graph/Workspace 固定；改变 `gpu_memory_utilization`、`kv_cache_memory_bytes`。
- 动画：外层 HBM budget/pool reserved 与内层 KV blocks used 两个层级。
- 输出：可分配 blocks、峰值、OOM 风险；不重复计数。
- 验收：KV 已用 blocks 增大时，若 pool 已预留，外层 committed 不重复增长。

## 实验 3：Batch Tokens 与 Seqs 的区别（M2）

- 输入：两条6 Tokens + 第三条 Decode，budget=8、seqs=2、Chunked Prefill 开。
- 动画：每轮 Token Budget 条、等待/运行序列、KV 分配。
- 输出：每轮受限的原因，不混淆 max_seqs 与 API 总并发。
- 验收：无 Decode 的 A6/B2 示例能重现；加入 Decode 后由调度策略重新划分。

## 实验 4：Prefix Cache 为什么不是任意命中？（M2）

- 输入：A 和 B 共享前两个完整块，第三块不同；再加入 C 只共享部分块。
- 动画：Hash 链、refs、Block 生命周期、连续匹配中断位置。
- 输出：命中 blocks / 逻辑输入 / 节省 computed tokens。
- 验收：不能因为第 4 块内容碰巧一样就跳过第三块而命中。

## 实验 5：Agent 多轮为什么与单轮录制重放不同？（M2）

- 输入：3个会话、每会话3轮，系统提示词同源、历史不断变长，工具等待2秒或8秒，固定 seed。
- 动画：Conversation → requests/turns、cache reuse、tool gap 和不同 DP 路由。
- 输出：不同缓存保留/路由策略下的共享前缀比例、排队与 KV 生命周期。
- 验收：工具等待前后是不同 Request，不凭空复用已被淘汰的块。

## 实验 6：HBM→CPU DRAM→HBM Offload 的成本（M3）

- 输入：GPU KV Pool 小，Host pinned 预算可调，shared PCIe 速率和并发可调。
- 动画：Block 写回/重载、源/目标占用与 Copy Ready、DMA 队列。
- 输出：命中多级 Cache 后节省的重算工作量与恢复成本的权衡。
- 验收：未 load 完成的 Block 不可读，Host 空间不足必须淘汰或拒绝。

## 实验 7：1P1D 与 2P1D 为什么结果不同？（M3）

- 输入：Toy 2 节点/32GPU，根据资源分配构造两个可行的 P/D 配比实验；相同请求负载。
- 动画：Prefill 完成→KV Transfer→D Ready、P/D 队列、关键路径。
- 输出：P backlog、D waiting、Transfer bytes、P/D idle 或 busy time。
- 验收：P/D 不可在同一个物理 Rank 上未经配置重复占满权重/KV；结果不预设“多一个 P 必然快”。

## 实验 8：跨机带宽由 100G 升到 400G 有用吗？（M3）

- 输入：相同 PD 请求+固定 KV，网络 100Gbps/200Gbps/400Gbps；同时可调 Host/GPU 带宽。
- 动画：共享 NIC/Fabric queues，Transfer 与 Decode 的关系。
- 输出：理论传输下界、争用估算、关键路径变化；可能边际效益递减。
- 验收：单位正确，用户能指出新瓶颈是 CPU/DMA/HBM/Compute 中的哪一个（取决于 scenario）。

## 实验 9：MoE EP 的 Token/专家热点（M4）

- 输入：Toy MoE，8 experts、top2，均匀与长尾 Token routing，1/2 冗余热点专家。
- 动画：Router→Expert dispatch、All-to-All、专家计算队列、Combine。
- 输出：热点 Rank busy、网络 busy、专家复制占用的 HBM、KV 可用空间变化。
- 验收：专家冗余不会免费增加内存；EP 复用 Rank，不把 `TP×DP×EP` 视为 GPU 数。

## 实验 10：DCP 改变 KV 布局的收益与代价（M4）

- 输入：选定 **已固定 release+模型 Attention Backend 且经兼容检查** 的 Toy MLA + A2/A3 风格 rank 拓扑；DCP=1/2/4（只使用规则允许组合）。
- 动画：请求 KV Context 跨 Rank 分片、Decode Q/Attention 的跨 Rank 通信与结果合并。
- 输出：per-rank KV 容量、Context capacity 与额外 collective 开销；不保证 TTFT/TPOT 一定改善。
- 验收：特定复用 TP rank 的 DCP 拓扑不会多建 GPU；不支持组合明确禁止。

## 预设场景与用户真实场景的边界

建议 Gallery 中第一行放 **Synthetic / Teaching** 场景，第二行单独放 **My Hardware / Engineering**。`Ascend A3 + GLM-5.3 W4A8C8 (1P1D, 48×8K/1K)` 可以预填用户关注的输入参数，但必须有 Missing Data Checklist：

- 具体 GPU/NPU 数、每卡 HBM、Host DRAM、NUMA、机间拓扑、NIC 数/速率；
- 实际模型 config、权重分片/量化策略、per rank weights、MLA/SFA/DSA 真实 KV layout；
- P/D 分别使用的 TP/DP/EP/CP、实际 Runner、Graph、KV Connector；
- `kv_cache_memory_bytes` / `gpu_memory_utilization` 与各类通信/图的额外开销；
- 对应该环境的微基准/压力测试数据。

只有完成相应字段，并通过兼容验证，才能升级到资源模拟或实测校准。缺资料时展示“缺什么以及为什么重要”，而不是阻止用户学习结构。
