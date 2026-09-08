# Module Standard V0.1

## Purpose

Module 是 APF 的主要复用、依赖、验证和发布单位。本标准定义 Module 的职责、目录、元数据、生命周期、兼容性和验收规则，供人、Agent、未来 Resolver 与 CLI 共同使用。

## 1. Qualification Rule

新增到 Framework 前先回答：

> 这个能力是否可以在一个完全不同的新项目中直接复用？

- `YES`：可成为 Framework Module 候选。
- `NO`：属于 Project-specific code，不进入 Framework Core 或通用 Catalog。

复用不等于复制代码。Module 必须携带它的边界、依赖、测试和兼容信息。

## 2. Module Anatomy

成熟 Module 应覆盖：

- Requirements
- Capabilities
- Boundaries / Non-goals
- Required and Optional Dependencies
- Architecture
- Data Model
- API / Contracts
- Security
- Runtime Implementation
- Tests and Acceptance
- Agent Instructions
- Status, Version and Risk
- Provider / Adapter model
- Framework and Runtime Compatibility

V0.1 允许尚无 Runtime Implementation，但不得把缺失实现描述成已完成。

## 3. Standard Layout

```text
modules/<module-name>/
├── module.yaml
├── SPEC.md
├── ARCHITECTURE.md
├── DATA_MODEL.md
├── API.md
├── SECURITY.md
├── TASKS.md
├── TESTS.md
├── ACCEPTANCE.md
├── STATUS.md
├── agents/             # only when real agent instructions exist
└── implementations/    # only when at least one runtime implementation exists
```

Business-oriented reusable modules may live under `business-modules/`.目录分类不改变 Module Contract。

禁止仅为了满足目录树创建空 `agents/`、`implementations/` 或 Provider 目录。

## 4. Naming and Versioning

- `name` 使用稳定的 lowercase kebab-case，例如 `object-storage`。
- `version` 使用 Semantic Versioning。
- `0.x` 表示契约仍可演进；Breaking change 至少提升 minor version 并提供迁移说明。
- `1.x` 后 Breaking change 必须提升 major version。
- Capability ID 在同一 Module 内唯一，发布后不能无迁移路径地改变含义。

## 5. `module.yaml` Contract

`module.yaml` 是 Module 的机器可读入口。规范 Schema 位于 `schemas/module.schema.json`。

### Required top-level fields

| Field | Meaning |
| --- | --- |
| `schema_version` | Module metadata contract version |
| `name` | Stable Module identifier |
| `version` | Module semantic version |
| `category` | Extensible catalog category |
| `description` | Technology-neutral responsibility summary |
| `risk` | `low` / `medium` / `high` / `critical` |
| `status` | Module Lifecycle state |
| `capabilities` | Stable behaviors exposed by the Module |
| `dependencies` | Required Module dependencies |
| `optional_dependencies` | Explicit non-required integrations |
| `providers` | Supported Provider Adapter contracts, possibly empty |
| `compatibility` | Framework and Runtime compatibility declarations |
| `gates` | Gates required for the current risk and release |
| `artifacts` | Paths to human-readable contracts |

### Capabilities

每项 Capability 至少包含：

- `id`：稳定 kebab-case identifier。
- `description`：从调用方角度描述行为，不写实现细节。
- `stability`：`experimental`、`stable` 或 `deprecated`。

Capability 不得使用 Provider 名称作为通用行为。例如 `signed-download` 是 Capability，`s3-presigned-url` 是 Provider 细节。

### Dependencies

Required Dependency 包含：

- `name`
- `version` range
- `required_capabilities`（可以为空，但必须显式）

Optional Dependency 具有相同结构，并必须声明 `reason`。Optional Dependency 缺失时，Module 的核心 Capability 必须仍然成立；否则它就是 Required Dependency。

依赖图必须无环。V0.1 由 Review 验证，未来由 Resolver 自动检查。

### Providers and Adapters

Provider 是可替换实现来源，不是 Module 本身。Provider 条目声明：

- 稳定 ID
- Adapter kind
- 它能实现的通用 Capability 子集
- 可选的 Provider-specific compatibility notes

通用 API 不泄露 Provider SDK 类型。Provider 独有能力只有在 Capability Negotiation 后才能使用，调用方必须有降级路径。

### Compatibility

- `framework`：兼容的 APF Contract version range。
- `runtimes`：零个或多个 Implementation Profile 约束。
- `modules`：需要额外表达的对等兼容性；依赖版本仍以 dependency entries 为准。

Contract 兼容不等于所有 Runtime Implementation 都兼容；实现必须声明自己的 Profile 和版本。

## 6. Category Model

V0.1 建议但不封闭以下类别：

- `infrastructure`
- `identity`
- `communication`
- `commerce`
- `platform`
- `business`

Schema 对 category 保持可扩展，以支持未来领域而不修改 Core enum。

## 7. Boundary Rules

- Infrastructure Module 不承载业务实体语义。
- Business Module 可以依赖 Platform/Infrastructure，但下层不得反向依赖上层业务。
- 高层策略与低层存储机制分开。
- 外部服务通过 Adapter 隔离。
- 跨 Module 数据所有权必须唯一；其他 Module 通过契约访问。
- 一个 Module 不得因“方便”吞并相邻职责。

示例分层：

```text
business → media → storage → provider adapter
```

Storage 不负责 avatar、thumbnail、transcoding、business ACL 或媒体数据库记录；这些属于 Media 或具体业务。

## 8. Documentation Contract

| Artifact | Required content |
| --- | --- |
| `SPEC.md` | problem, goals, capabilities, boundaries, dependencies, acceptance |
| `ARCHITECTURE.md` | components, data/control flow, failures, adapters, decisions |
| `DATA_MODEL.md` | ownership, entities, persistence-neutral semantics, migration impact |
| `API.md` | inputs, outputs, errors, compatibility, idempotency |
| `SECURITY.md` | assets, threats, permissions, sensitive data, controls |
| `TASKS.md` | ordered atomic implementation and verification work |
| `TESTS.md` | risk-based test matrix and evidence |
| `ACCEPTANCE.md` | objective pass/fail checklist |
| `STATUS.md` | resumable current state and transition evidence |

不适用的文档保留简短的 `Not applicable` 判断和理由，不伪造内容。

## 9. Lifecycle and Gates

Module Lifecycle 以 `framework/WORKFLOW.md` 为准。`module.yaml.status` 必须与 `STATUS.md` 一致。

- Spec Gate 控制 `SPEC_READY`。
- Architecture Gate 控制中高风险设计进入实现。
- Implementation Gate 控制进入 Testing。
- Test/Security/Acceptance Gate 控制 Accepted。
- Release Gate 控制 Released。

## 10. Validation Invariants

Module 至少通过：

1. `module.yaml` 符合 JSON Schema。
2. name、version、status 和 risk 在所有文档一致。
3. 每个 required dependency 存在明确 version range。
4. required 与 optional dependency 不重复。
5. Capability ID 唯一。
6. Provider 只能引用已声明 Capability。
7. Gate 集合满足风险最低要求。
8. Artifact path 存在，或有明确 N/A 记录。
9. 不存在 Project-specific hardcode 或凭据。
10. Status 的完成声明有测试或审查证据。

## 11. Change and Release Rules

- Contract change 必须评估所有消费者和 Provider Adapter。
- Breaking change 必须包含 migration/compatibility note。
- 新 Provider 不得改变已有通用 Capability 的语义。
- Release 绑定 commit、version、Gate evidence 和已知限制。
- `RELEASED` 后的文档修正若改变行为语义，也视为 Contract change。
