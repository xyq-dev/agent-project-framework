# Project Context

## Framework Mission

Agent Project Framework（APF）是放在 GitHub 上的项目开发标准仓库。用户于 2026-09-08 明确当前目标：将完整项目开发流程、文档模板和 Agent 工作约定集中维护，让今后的新项目从空目录也能按同一套标准开展。

标准仓库保存可复用流程；每个业务项目仓库保存所采用的标准快照以及本项目的需求、设计、任务、代码、测试、验收、发布和交接记录。采用标准无需等待登录、OSS 或其它 Runtime 模块完成。

标准采用入口已建立。2026-09-08 用户进一步明确恢复 Storage Core／Memory／Local／OSS：当前 Core/Memory/Local/OSS 初始 profile 代码已存在，104 项测试通过；独立设计已通过，最终实现审查与真实 OSS 验证待完成。Storage 仍不作为新项目初始化的必经步骤；动态证据见 CURRENT_STATUS。

## Core Philosophy

```text
项目 = 通用开发流程 + 通用技术模块 + 可选业务模块 + 项目特有代码
```

APF 优先追求小而完整、标准稳定、模块化、可恢复和通用抽象。

## Architecture Principles

- **Technology neutral**：Framework Specification 不绑定语言、前端、后端、数据库或云厂商。
- **Contract first**：稳定契约先于 Runtime Implementation 和自动化工具。
- **Separation of concerns**：Infrastructure、Platform、Identity、Communication、Commerce 和 Business 能力保持边界。
- **Explicit dependencies**：依赖、可选依赖和兼容范围必须机器可读并可审查。
- **Provider isolation**：外部 Provider 通过 Adapter 接入，Provider 特性不得污染通用能力契约。
- **Evidence based**：Gate 由可定位证据通过，而非口头判断。
- **Incremental evolution**：协议由真实 Reference Module 验证后再扩展。

## Module Philosophy

Module 是需求、能力、边界、依赖、架构、数据、API、安全、实现、测试、验收、状态和版本的完整复用单位。代码缺少这些契约时，不视为成熟 Module。

Framework Core 只承载可跨完全不同项目复用的能力；不能复用的内容属于 Project-specific code。

## Agent Philosophy

Agent 必须先读取 Repository 中的稳定上下文、动态状态和相关 Module 任务，再执行分析、实现或审查。重要决策和进度必须写回 Repository，使工作可以跨会话、跨工具和跨 Agent 恢复。

分析、实现、测试、审查和接受是不同责任。高风险工作不能由单一执行者静默完成全部决策。

## Risk Philosophy

控制强度由影响面、可逆性、数据敏感度、资金影响、安全影响和生产暴露共同决定。风险只可依据新证据调整，不能为了缩短流程而降级。

统一风险等级：`low`、`medium`、`high`、`critical`。

## Lifecycle Philosophy

APF 提供默认 Project Lifecycle 和 Module Lifecycle，但允许项目显式裁剪。阶段必须声明为 `required`、`optional`、`skipped` 或 `not-applicable`；跳过或不适用都需要理由，以防止隐式遗漏。

## Compatibility Principle

- Module 使用语义化版本。
- 依赖必须声明允许的版本范围和必要能力。
- Breaking change 必须提升主版本或在 `0.x` 阶段提升次版本，并提供迁移说明。
- Framework Contract 与 Runtime Implementation 独立版本化，但必须声明兼容范围。

## Framework Boundaries

Framework Core 包含：

- 生命周期、Module Standard、风险与质量 Gate
- Agent Workflow、状态与交接协议
- 机器可读的基础配置和 Schema
- 可复用模板、未来依赖解析和项目生成规则

Framework Core 不包含：

- 任何具体业务项目的逻辑或品牌资产
- 单一 Provider、数据库、框架或语言的强制实现
- 未经真实模块验证的大规模目录和占位实现
- 项目凭据、生产配置或用户数据

Runtime Implementation 可以采用具体技术栈，但必须位于明确的 Implementation Profile 中，并遵守通用 Module Contract。
