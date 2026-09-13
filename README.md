# Agent Project Framework

**把项目开发标准放在 GitHub，让每个新项目按同一套流程启动、开发、验收和交接。**

APF 是技术栈中立的项目标准仓库。当前优先交付可直接采用的流程、文档模板与 Agent 工作约定；项目可以从空目录开始，无需先实现 Storage、OSS 或登录模块。

## 从这里开始

- **新项目、目录为空**：按 [START_HERE.md](START_HERE.md) 初始化。
- **已经有代码的项目**：按启动指南的渐进接入流程补标准，保留现有目录与代码。
- **想知道每一步做什么**：查看 [项目开发手册](framework/PROJECT_PLAYBOOK.md)。
- **想开发登录、权限、OSS 等能力**：查看 [模块实施方案](framework/MODULE_ADOPTION_PLAN.md) 与 9 类蓝图。
- **想把任务和评审放在 GitHub**：查看 [GitHub 协作流程](framework/GITHUB_WORKFLOW.md)。
- **让 Agent 帮忙初始化**：使用 [新项目启动提示词](agent-prompts/NEW_PROJECT.md)。

## 一套项目流程

需求 → 产品范围 → UX/UI（适用时）→ 架构 → 数据与 API（适用时）→ 任务拆解 → 开发 → 测试与安全审查 → 验收 → 发布 → 维护与交接。

每个阶段明确输入、产物、负责人和通过条件。小项目可以裁剪；跳过或不适用需要理由，不能把未做的工作标记为通过。

## 两个仓库各放什么

| 仓库 | 保存内容 |
| --- | --- |
| 本标准仓库 | 通用流程、质量标准、项目/模块模板、Agent 提示词、标准演进记录 |
| 每个新项目仓库 | 采用的标准快照、本项目需求和设计、任务、代码、测试、发布和交接记录 |

采用时按 [复制清单](templates/project/BOOTSTRAP_MANIFEST.yaml) 选择文件并记录标准来源 commit；新项目不会继承 APF 的 Storage 进度。以后升级标准，也通过项目自己的变更评审处理。

## 仓库导航

| 入口 | 用途 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent 工作约定 |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | 本标准仓库的稳定定位 |
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | 本标准仓库当前进度 |
| [framework/](framework/) | 生命周期、开发手册、模块、风险、Gate 与交接标准 |
| [templates/project/](templates/project/) | 新项目启动模板与复制清单 |
| [templates/module/](templates/module/) | 按实际需要创建模块契约 |
| [playbooks/modules/](playbooks/modules/) | 9 类能力的边界、实施任务与验收要求 |
| [agent-prompts/](agent-prompts/) | 初始化、执行、评审与交接提示词 |
| [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/) | 立项、开发任务、缺陷模板 |
| [.github/pull_request_template.md](.github/pull_request_template.md) | 变更与验收证据模板 |
| [schemas/module.schema.json](schemas/module.schema.json) | Module 元数据校验规则 |

## 能力按项目需要选择

登录/身份、权限、存储/OSS、配置、审计、媒体、通知、支付等，在立项时决定采用、延后或不适用。选择一种能力后，按[实施蓝图](framework/MODULE_ADOPTION_PLAN.md)定义项目契约、选用已有组件或安排实现，并按风险验证。

**能力清单不代表所有模块已经实现。**[Storage 参考实现](modules/storage/implementations/typescript/README.md) 已提供 Core/Memory/Local/OSS 私有 TypeScript 参考代码，112 项测试通过；原始 ST-007 Memory/Local 范围已获独立正式验收，OSS 保守 profile 离线范围审查通过；真实 OSS 与全模块验收未完成。登录等其他蓝图没有因此变成可安装代码。详见[实施报告](modules/storage/STORAGE_M1_B_IMPLEMENTATION_REPORT.md)。

## Agent 分工与证据

默认 Codex 做需求、方案和评审，Cursor 执行已批准任务、测试与本地构建。具体工具和模型放在可替换的 [Agent 配置](.agent-project/agents.yaml)，不绑定通用标准。

文档、Issue、PR 和状态文件共同保存工作上下文。格式检查、业务测试、验收、发布是不同证据，不能互相替代。授权按当前任务记录，模板本身不授予生产或发布权限。

## 版本与后续

当前规范版本 `0.1.0-dev`。手动或由 Agent 按清单初始化的流程可先采用；自动生成器、依赖解析、完整可复用 Runtime 属于后续增量。详见 [路线图](framework/ROADMAP.md)。
