# 01 · 产品定义与范围

## 1. 愿景

InferenceLab 是浏览器中的 LLM 推理系统数字沙盘，目标不是给出“调大某参数会快 X%”的经验回答，而是解释**为什么**某个参数改变了并行布局、KV 占用、等待时间、通信流量、计算效率或瓶颈位置。

核心闭环：**选择硬件+模型+框架版本 → 定义物理部署和请求负载 → 修改参数 → 机制级模拟 → 播放状态/数据流 → 看到指标分解与约束 → 保存 A/B 实验**。

## 2. 目标人群与典型工作

- 初学者：通过可交互可回放的 Token / Layer / Device 视图理解 TP、DP、EP、SP、PCP、DCP、PP 和 PD 分离。
- 推理优化工程师：评估显存布局、Batch、KV Offload、缓存命中、物理链路，定位为何出现 TTFT/TPOT 变化。
- 测试/性能团队：建立可复现的长上下文和多轮 Agent 负载，复盘压测数据并识别不正确的测量解释。
- 方案设计人员：用 A/B 对比向团队展示配置选择的依据、限制和不确定性。

## 3. 用户核心问题（项目必须回答）

1. 32 张 GPU/NPU，TP16 DP2 与 TP8 DP4 的实际 Rank 分组、模型副本数和资源约束怎样变化？
2. 给定具体模型权重/量化/Attention 类型，单卡权重、运行时、KV、Activation、通信缓冲到底如何挤占 HBM？
3. KV 从 GPU/NPU HBM→CPU DRAM→HBM，什么时候触发、走哪条路径、需要多长、产生什么排队/竞争？
4. 改 `max_num_batched_tokens` 和 `max_num_seqs`，请求进度、Prefill 分块和 Decode 迭代如何变化？
5. Prefix Cache 为什么有命中/未命中，哪些 Block 能复用，为什么 Offload 不等于 Swap？
6. PD 分离后 P 和 D 侧拓扑为何不同，KV Transfer 在什么时刻等待、能够与什么重叠？
7. 长上下文、多轮 Agent、工具等待、不同输入前缀复用，对 GPU KV 水位和 P/D 流量有什么影响？
8. 同样配置但 HBM/PCIe/HCCS/NVLink/IB/RoCE 带宽不同时，瓶颈如何迁移？
9. MoE EP 通信、专家热点、冗余专家的内存/计算成本是什么？
10. 模拟结论哪些是严格可得，哪些只是假设和测量校准后的估算？

## 4. 产品范围

### 4.1 MVP 必须有（M0–M2）

- 桌面优先、一个共享主画布和五个可切换 Observation Lens；无登录、无后端；导入/导出 Scenario JSON。
- 至少两个**明确标注 synthetic 的教学模型**：Toy Dense（MHA/GQA 之一）、Toy MoE；硬件 Toy 4 卡与 Toy 2 机 32 卡。Toy MoE 在 MVP 仅提供结构/资料展示，其 EP 计算仿真属于 M4，不得伪装成已支持。
- CPU/DRAM、GPU/NPU/HBM、Host Link、Device Link、NIC/Network 的可视实体；M1 至少计算容量和物理拓扑。
- 显式 Device→Rank、Replica→Rank 的拓扑配置；先精确完成 TP×DP 的基本子集。
- 每卡显存分解：权重、KV、激活/工作区、图捕获/框架、通信缓冲、剩余。
- 可交互配置和约束检查；无效配置不仅告警，还说明哪个 Rank/链路受限。
- KV Block 分配/释放，按完整块的 Prefix 命中和缓存复用，可选 LRU 简化淘汰。
- 可暂停/单步/快进/复位的离散事件调度与事件日志。
- 调度参数：`max_model_len`、`block_size`、`max_num_seqs`、`max_num_batched_tokens`、是否 Chunked Prefill、是否 Prefix Cache。
- 输入负载：固定/泊松/Trace 请求到达；ISL/OSL 分布；至少 2 轮 Agent 示例。
- 仿真指标：队列长度、已调度 Token、Prefill/Decode 步数、KV 水位、内存超限、请求等待原因、计算/通信计数。
- 指标来源徽记：`exact` / `assumption` / `calibrated` / `unavailable`；不存在可靠测量曲线时，TTFT/TPOT 只显示**仿真估计**或 N/A。

### 4.2 下一阶段（M3）

- 多级内存：HBM→DRAM→SSD（SSD 可在 M3 的最后一个迭代加入）；CPU/NPU 双向 DMA、Pinned Memory、NUMA。
- PD 分离：Prefill/Decode 资源组、Producer/Consumer、P→D KV Pull、Layerwise Push、D Host Staging 等独立策略。
- 物理 Link Graph、NPU/GPU 到 NIC 的路径、带宽/时延/竞争、端到端关键路径。
- 可配置 KV Offload 的写入时机、Load on hit、丢失/失败/淘汰、资源释放和恢复。
- A/B 比较和性能瀑布图；明确**模拟估计**标识。

### 4.3 高级扩展（M4+，逐项）

- MoE EP：专家与设备映射、All-to-All、热点及冗余 Expert，负载模型；非随意绘制箭头。
- PCP/DCP/PP/SP：增加条件依赖的Rank布局、通信和缓存分片；以版本化特性兼容矩阵约束。
- Attention：MLA、GQA、MHA、SFA/DSA 等具体缓存布局，混合注意力、滑窗、多 KV Group。
- 量化：权重/激活/KV 精度、scale/metadata、静态/动态 workspace。MTP/投机推理草稿计算及接受率。
- Graph Mode/Eager、Kernel 融合、通信重叠、EP Load Balancing、Prefix Cache Pool、跨实例缓存。
- 实测曲线、Trace 导入、对比、性能分析解释和配置建议；不得冒充线上自动调优。

### 4.4 明确不做

- 不下载/加载大模型权重、不执行真实 Transformer、不做真实 vLLM/Ascend 部署。
- 不承诺精准的硬件性能预测，也不做自动生成可直接用于生产的部署命令（高级阶段可选导出建议并警示复核）。
- 不做实时远程控制、密钥管理、服务器登录、容器/K8s 管理。
- 不承诺任意混合 TP/EP/PP/CP 组合都可模拟；不支持时明确给出原因。

## 5. 首个用户演示（必须是纵向闭环）

用户打开站点：

1. 选择 `Toy 2-Node / Toy Dense`，浏览器打开总览页。
2. 设 TP16 DP2，观察两个副本、32 张卡、每 Rank HBM 预算。
3. 改成 TP8 DP4，看到副本组变成四组，卡上权重布局改变，检查容量；不需要后端。
4. 设置 48 路，8K 输入 / 1K 输出，启动仿真，看到请求先排队再分块 Prefill/Decode、KV 水位增长。
5. 把 `max_num_batched_tokens` 从 8192 调至 16384，保存为第二次 Run，并通过 Run History 切换和比较摘要（M3 才有完整 A/B 并排画布）；明确哪些是机制变化，哪些是预测假设。
6. 修改 `max_num_seqs`，查看并发调度限额，不将其等同于“系统最大请求并发”。
7. 打开一个请求的详情，检查 token 预算、命中 Block、等待原因、时间线；可导出 JSON 报告。

另一预设 `Ascend A3 + GLM-5.3 + 1P1D` 初期为**带空字段的工程模板**，支持输入或导入真实硬件/模型配置，数据不足时只能进行拓扑教学，不能给出真实 TTFT/TPOT。

## 6. 非功能性要求

- 纯静态构建产物可以部署 GitHub Pages / 对象存储 / Nginx，刷新页面不丢失路由（建议 Hash Router）。
- 核心仿真使用固定种子，100% 可重复；单元测试在 Node 中无 DOM 运行。
- 浏览器在 48 请求 × 1000 OSL 场景保持流畅：事件可聚合，Canvas 分层/抽样呈现，不允许每 Token × 每 Layer × 每 Rank 都逐帧绘制。
- 默认本地运行；导入的日志和 Trace 不上传网络；通过文件输入实施大小限制、JSON schema 约束及文本转义。
- 桌面 1440px+ 优先，较小屏幕能正常使用关键配置、切换视图与查看错误。
- 深色为主，遵循 docs/04 的固定视觉 Token、低噪音、清楚的颜色语义、可键盘操作的基本控件；动画可调速/关闭；每阶段通过 11 的 UX 三重门禁。

## 7. 发布门槛

完整定义见 05、06。核心原则：每个里程碑必须具备可演示 UI、可回归的机制测试、样例场景和一份说明支持/不支持什么的 `KNOWN_LIMITATIONS.md`。
