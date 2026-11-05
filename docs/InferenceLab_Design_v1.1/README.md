# InferenceLab — LLM 推理系统交互式实验室

> **设计包版本**：v1.1 · 2026-11-05  
> **目标交付**：无需后端、可静态部署、可离线演示的交互式 Web 应用；包含机制级仿真和可溯源的指标解释。  
> **状态**：完整工程设计方案；**不是已实现程序、不是经过实测校准的性能预测器**。

## 一句话产品定位

通过真实的**资源约束、KV 状态、请求调度和离散事件**驱动可视化，让工程师用“修改配置 → 观察计算/存储/传输/调度变化 → 分析瓶颈”的方式理解 LLM 推理系统。

## v1.1 审核与 UI 设计基线

**本版专门修订了上一版最薄弱的 WebUI 设计**。`docs/04-UX.md` 为统一工作台合同，`docs/10-UX-STORYBOARDS.md` 定义因果分镜，`docs/11-UI-ACCEPTANCE.md` 定义视觉和可用性门禁，`docs/12-AGENT-UX-FIRST.md` 限定 Agent 实施顺序，`prototype/inferencelab-ui-reference.html` 是可在浏览器打开的**视觉参考原型（非仿真程序）**。**优先完成 D0 设计审核，再开始 M0–M2。**

**实际实现应以 `/#/lab` 统一主画布 + Observation Lens 为中心**；旧顶级 `/topology`, `/memory` 等路由不再要求逐页切换。M2 只做历史 Run 切换和差异摘要；M3 才实现完整 A/B 双画布。

## 给 AI Coding Agent 的入口

1. **首先阅读** [`docs/00-AGENT-START.md`](docs/00-AGENT-START.md)，并按其指令建立代码仓库。
2. 阅读 [`docs/01-PRODUCT.md`](docs/01-PRODUCT.md)：功能边界、成功标准、阶段目标。
3. 阅读 [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md)：实体、资源、事件、调度及算法。
4. 阅读 [`docs/03-CONTRACTS.md`](docs/03-CONTRACTS.md)：配置与数据协议、计算约束。
5. 阅读 [`docs/04-UX.md`](docs/04-UX.md)：交互页面、动画和解释体验。
6. **按** [`docs/05-EXECUTION.md`](docs/05-EXECUTION.md) **分阶段开发**，每个里程碑达到 DoD 后再进入下一阶段。
7. 阅读 [`docs/06-TESTING.md`](docs/06-TESTING.md) 和 [`docs/07-SOURCES.md`](docs/07-SOURCES.md)：精确度、测试、不确定性、官方来源。
8. 阅读 [`docs/08-PARAMETERS.md`](docs/08-PARAMETERS.md) 和 [`docs/09-SCENARIOS.md`](docs/09-SCENARIOS.md)：参数映射及 10 个预设实验。

## 必须坚持的原则

- 不执行真实 Transformer；不假装实现 vLLM 全部内部逻辑；不依赖 GPU/NPU。
- 引擎是独立纯 TypeScript 包，UI 只消费状态与事件流；Web Worker 中运行模拟。
- 所有“卡上/跨卡/跨机”资源都由明确的设备/链路/Rank **物理映射**表达，而非 TP×DP×EP 万能公式。
- HBM 容量、Host DRAM 容量、内存带宽、互联、NIC、共享链路、运行时开销分开建模。
- 区分：**已知的精确值**、**基于假设的模拟值**、**由测量校准的估算值**；不得以固定算法输出的数值冒充硬件真实性能。
- 带版本/硬件/注意力后端的功能兼容矩阵；`unknown` 不等于 `supported`。
- **机制正确性与 WebUI 可理解性双优先**；动画必须由事件日志驱动，但不能以算法正确为由忽视可用性与视觉质量。
- 第一版交付必须可用，禁止页面按钮无动作、硬编码虚构 TTFT、只展示静态动画。

## 范围路线图

| 阶段 | 应交付能力 | 是否计划为首个可用版本 |
|---|---|---|
| D0 UI 审核 | 参考原型、主屏布局、共享交互状态与视觉验收 | **必须先通过** |
| M0 项目骨架 | 模型/硬件 Schema、样例数据、静态站点、CI | 是 |
| M1 拓扑/显存 | TP/DP 映射、Rank 资源预算、可行性检查、对比 | 是 |
| M2 KV/调度 | KV Block/Prefix、离散事件、Chunked Prefill/Decode | **首个完整 MVP** |
| M3 通信/Offload/PD | HBM↔DRAM、跨机网、KV Transfer、1P1D | 下一阶段 |
| M4 高级模型 | EP/MoE、PCP/DCP、SP、PP、MTP | 后续逐项增强 |
| M5 校准/导入 | 实测数据、Trace 导入、预测质量验证、导出 | 后续 |

**M1 和 M2 均需有完整可交互 UI，不允许仅交付后端模拟包。**

## 本设计包目录

```
InferenceLab_Design_v1.1/
  README.md
  docs/
    00-AGENT-START.md
    01-PRODUCT.md
    02-ARCHITECTURE.md
    03-CONTRACTS.md
    04-UX.md
    05-EXECUTION.md
    06-TESTING.md
    07-SOURCES.md
    08-PARAMETERS.md
    09-SCENARIOS.md
    10-UX-STORYBOARDS.md
    11-UI-ACCEPTANCE.md
    12-AGENT-UX-FIRST.md
  prototype/
    inferencelab-ui-reference.html   # 仅 UI 原型，非仿真
    ui-reference-1440.png
    ui-reference-1280.png
  AUDIT-REPORT.md
  schemas/
    scenario.schema.json
    hardware-profile.schema.json
    model-profile.schema.json
    framework-profile.schema.json
  examples/
    toy-scenario.json
    toy-32gpu-tp16-dp2.json
    toy-32gpu-tp8-dp4.json
    toy-hardware-4gpu.json
    toy-hardware-32gpu.json
    toy-model-dense-gqa.json
    toy-model-moe-gqa.json
    toy-framework-adapter.json
    ascend-a3-glm53-template.json
```

> 示例 `toy` 的硬件/模型数据为**教学用合成值**。Ascend A3 / GLM-5.3 模板故意不填写未经核实的带宽、权重和 KV 精确值；导入硬件数据和模型配置后才能开启具体性能预测。
