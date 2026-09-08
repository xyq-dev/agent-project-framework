# Agent Project Framework

Agent Project Framework（APF）是一套技术栈中立的项目组装规范。它把项目生命周期、模块契约、Agent 协作、风险路由、质量门禁和交接状态统一成可读取、可审查、可逐步自动化的 Framework Kernel。

> 以后不是从零开发项目，而是组装项目。

```text
项目 = 通用开发流程 + 通用技术模块 + 可选业务模块 + 项目特有代码
```

当前版本为 `0.1.0-dev`。V0.1 先稳定规范与机器可读契约，不提前实现完整 CLI、依赖解析器或大批空模块。

## What is Agent Project Framework

APF 同时面向人和 Agent：

- 人使用生命周期、风险模型和验收证据控制质量。
- Agent 读取稳定上下文、动态状态和模块任务后再开始工作。
- 工具未来可读取 YAML/JSON 契约，解析依赖、生成任务并执行验证。
- Runtime Implementation 与 Framework Contract 分离，可按 TypeScript、Go、Python 等 Implementation Profile 演进。

APF 不是某个业务项目，也不把数据库、云厂商、语言或前后端框架写死在 Core 中。

## Why it exists

软件项目反复消耗时间在相同的初始化、基础设施、协作约定和交接工作上。APF 通过标准模块和可裁剪流程减少重复，同时避免“复制代码却丢失约束、测试和决策”的问题。

目标是让一个新项目能够从已验证的能力中选择和组合，而不是重新发明全部基础设施。

## Core Philosophy

1. **小而完整优于大而空**：只建立当前有契约、有证据的内容。
2. **规格先于实现**：Module 在满足相应 Gate 前不得进入下一状态。
3. **流程可以裁剪**：阶段可标记为 `required`、`optional`、`skipped` 或 `not-applicable`，但跳过必须有理由。
4. **风险决定控制强度**：风险越高，审查、测试、安全和发布约束越严格。
5. **可恢复优于聊天记忆**：状态、决策、证据和下一步必须留在 Repository。
6. **契约与实现分离**：通用规范不依赖单一语言、框架或 Provider。
7. **模块化优于复制粘贴**：代码只是 Module 的一部分；规格、兼容性、测试和验收同样属于 Module。

## Conceptual Project Flow

```text
Define requirements
→ Select project profile
→ Select modules
→ Resolve dependencies
→ Generate specifications
→ Generate Agent tasks
→ Implement
→ Test
→ Review
→ Accept
→ Release
```

## Project Lifecycle

默认生命周期如下，但项目可以通过 [`.agent-project/workflow.yaml`](.agent-project/workflow.yaml) 裁剪：

| Stage | Purpose |
| --- | --- |
| Requirements | 明确目标、约束、范围和验收结果 |
| Product | 定义产品行为、优先级和边界 |
| UX / User Flows | 定义用户路径与异常路径 |
| Design | 定义需要的视觉与交互设计 |
| Architecture | 定义系统边界、依赖与关键决策 |
| Database | 定义持久化模型和变更策略 |
| API | 定义接口契约和兼容性 |
| Implementation | 按已批准任务实现 |
| Testing | 形成风险匹配的验证证据 |
| Security | 评估威胁、权限和数据保护 |
| Deployment | 定义可回滚的交付方式 |
| Production Gate | 在证据齐全后批准生产发布 |

详细规则见 [`framework/WORKFLOW.md`](framework/WORKFLOW.md)。

## Module System

Module 是 APF 的核心复用单位，不只是代码。一个成熟 Module 包含：

- Requirements、Capabilities 与 Boundaries
- Dependencies 与 Compatibility
- Architecture、Data Model 与 API
- Security、Implementation 与 Provider/Adapter
- Tests、Acceptance 与 Release Evidence
- Agent Instructions、Status、Version 与 Risk

`module.yaml` 是机器可读协议。V0.1 的规范、Schema 和起始模板分别位于：

- [`framework/MODULE_STANDARD.md`](framework/MODULE_STANDARD.md)
- [`schemas/module.schema.json`](schemas/module.schema.json)
- [`templates/module/module.yaml`](templates/module/module.yaml)

## Agent Workflow

```text
Analyze → Plan → Implement → Test → Review → Accept → Handoff
```

Agent 开工前必须读取 `AGENTS.md`、`PROJECT_CONTEXT.md`、`CURRENT_STATUS.md` 以及相关 Module 的 `SPEC.md`、`TASKS.md`、`STATUS.md`。实现不是分析的替代品，聊天记录也不是 Repository 状态的替代品。

## Quality Gates

V0.1 定义七个 Gate：

1. Spec Gate
2. Architecture Gate
3. Implementation Gate
4. Test Gate
5. Security Gate
6. Acceptance Gate
7. Release Gate

每个 Gate 都必须说明目的、入口条件、证据、通过条件、失败行为、审查者和风险覆盖规则。规范见 [`framework/QUALITY_GATES.md`](framework/QUALITY_GATES.md)，本项目启用的配置见 [`.agent-project/gates.yaml`](.agent-project/gates.yaml)。

## Risk Model

| Risk | Typical change | Minimum control |
| --- | --- | --- |
| `low` | 文档、简单 UI、局部非关键调整 | Spec、测试证据、验收 |
| `medium` | 普通 API、Storage、跨文件功能 | Architecture Review、集成验证 |
| `high` | Auth、Security、敏感权限 | 独立安全审查、集成测试、人工发布批准 |
| `critical` | Payment、Refund、Migration、生产数据 | 全 Gate、独立复核、回滚证据、禁止自动发布 |

完整规则见 [`framework/RISK_MODEL.md`](framework/RISK_MODEL.md)。

## Repository Structure

```text
.
├── README.md
├── AGENTS.md
├── PROJECT_CONTEXT.md
├── CURRENT_STATUS.md
├── .agent-project/
│   ├── project.yaml
│   ├── workflow.yaml
│   ├── agents.yaml
│   └── gates.yaml
├── framework/
│   ├── WORKFLOW.md
│   ├── MODULE_STANDARD.md
│   ├── QUALITY_GATES.md
│   ├── RISK_MODEL.md
│   ├── STATUS_STANDARD.md
│   └── ROADMAP.md
├── schemas/
│   └── module.schema.json
└── templates/
    └── module/
        ├── module.yaml
        ├── SPEC.md
        ├── ARCHITECTURE.md
        ├── DATA_MODEL.md
        ├── API.md
        ├── SECURITY.md
        ├── TASKS.md
        ├── TESTS.md
        ├── ACCEPTANCE.md
        └── STATUS.md
```

`modules/`、`business-modules/`、`presets/` 和 `examples/` 会在出现首个真实内容时创建，不使用占位文件伪造进度。

## Using the Framework

在自动化工具完成前，新项目可以按以下最小流程采用 APF：

1. 复制 `.agent-project/` 配置并声明项目生命周期裁剪。
2. 从 `templates/module/` 创建所需 Module，填写 `module.yaml`。
3. 解析并审查必选与可选依赖，记录兼容性约束。
4. 完成 SPEC、ARCHITECTURE 和 TASKS Gate 后再实现。
5. 按风险等级收集测试、安全和验收证据。
6. 更新状态文件，确保下一位 Agent 无需旧聊天即可继续。

## Future Presets

未来 Preset 将声明一类项目的默认 Module Set，例如 SaaS、Ecommerce、Booking、Mini Program、Admin System、API Service 和 Content Platform。V0.1 只保留契约方向，不建立未验证的 Preset 清单文件。

## Future CLI

未来 CLI 可能提供：

```text
agent-project create
agent-project add-module
agent-project remove-module
agent-project doctor
agent-project status
agent-project validate
agent-project generate-tasks
```

CLI 必须建立在稳定的 Module Standard、多模块实践和 Dependency Resolver 之上；V0.1 不实现 CLI。

## Roadmap

- **M0 — Framework Core**：生命周期、Module Standard、Agent Workflow、Gate、Risk、Status 与模板。
- **M1 — Storage Reference Module**：用第一个真实 Infrastructure Module 验证契约、Provider Adapter、依赖和测试体系。
- **M2 — Identity / Media Modules**：验证高风险路由与跨模块分层。
- **M3 — Presets and Dependency Resolution**：在多模块证据充分后形成组合能力。
- **M4 — Project Generator and CLI**：把稳定协议自动化。

详细范围见 [`framework/ROADMAP.md`](framework/ROADMAP.md)，动态进度见 [`CURRENT_STATUS.md`](CURRENT_STATUS.md)。

