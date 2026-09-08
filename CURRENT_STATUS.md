# Current Status

## Version

`0.1.0-dev`

## Phase

M1-A Storage specification and implementation handoff

## Milestone

M1 — Storage Reference Module（IN PROGRESS；Runtime 尚未实现）

## Current Task

M1-A 契约、静态验证与设计 Gate 已通过，Storage=TASKS_READY。下一执行单元为 M1-B / ST-001..004（Memory）；本规格快照的提交/回读以最终报告绑定。

## Completed

- TASK-001 — Initialized Agent Project Framework V0.1 Core.
- TASK-002 — Defined Module Standard V0.1 and machine-readable `module.yaml` Schema.
- TASK-003 — Defined configurable Project and Module Lifecycle V0.1.
- TASK-004 — Defined Agent Workflow V0.1.
- TASK-005 — Defined Quality Gates and Risk Model V0.1.
- TASK-006 — Created reusable Module Templates.
- TASK-007 — Established Status and Handoff Standard.
- TASK-008 — Prepared the Storage Reference Module milestone and its boundaries.
- M1-A artifacts — Storage manifest、九份标准文档、设计 Review、Cursor 任务包、14 条计划 Runtime 用例与只读静态验证脚本。
- Kernel feedback — 区分 Implementation Gate 的 entry/exit evaluation，解决入场需要“已完成实现”的循环；未改变 Module Schema。

## In Progress

M1 整体 IN PROGRESS：M1-A 已完成；Runtime 开发尚未开始，Implementation/Test/Security/Acceptance Gate 均 PENDING。

## Blocked

M1-A / Memory 任务无产品决策阻塞。Local ST-006 被 ST-005 独立安全设计审查阻塞；云 signer/搬迁/multipart 属于延后范围。

## Next

1. 使用 [Cursor 任务包](modules/storage/agents/CURSOR_IMPLEMENTATION.md) 执行 ST-001..004：Node/TypeScript Core + Memory。
2. Memory 证据完成后，审查 Local 路径/锁/恢复设计，再进行 ST-006..007。
3. 两种 Adapter 测试/安全/验收完成后，才决定 M1 是否可结束；禁止因为 SPEC 完成就宣布 Runtime 完成。

## Current Decisions

- Framework Core remains technology, language, database and provider neutral.
- Module metadata uses YAML; V0.1 ships a JSON Schema for `module.yaml`.
- Lifecycle tailoring separates stage `mode` from execution `status`.
- Empty catalog, preset and example directories are not tracked.
- Storage is the first Reference Module; Media remains a separate higher-level module.
- CLI, Dependency Resolver and complete Storage Runtime are deferred beyond M0.
- M1：config/audit 尚无真实契约，采用注入配置/Observer，暂不写任何虚假依赖版本。
- 选择 Node 24.x + TypeScript strict 作为首个 Reference Profile，Memory→Local；不强制其它语言或项目采用。
- move/signed URL/multipart 当前 false；云 Adapter 必须另外验收，providers/runtimes 暂空。
- 当前工作在 `feat/storage-spec-v0.1`，main 保留 M0；没有自动合并/发布。

## Changed Files

- 新增 `modules/storage/`：14 个实质文件（含验证脚本，不含 Runtime）。
- 修改 `README.md`、本文件、`.agent-project/{project,workflow,gates}.yaml`、`framework/{WORKFLOW,ROADMAP}.md`。
- 未修改 AGENTS、稳定 PROJECT_CONTEXT、Module Schema 或原模板；未增加 DB/CLI/空模块目录。

## Validation

- `node --check modules/storage/validation/validate-spec.cjs`：PASS。
- `node modules/storage/validation/validate-spec.cjs`：PASS（Node 24.19.0、Ajv 8.20.0、js-yaml 4.1.1；环境已有依赖通过 NODE_PATH 解析）。
- 10 组静态检查、10 个阴性 fixture、14 条 REQ→TEST→AC 映射；Module/原模板 Schema 皆通过。
- Runtime tests：NOT_RUN；Static PASS 不等于 Integration/Test/Security Gate PASS。
- 详细证据与设计 Gate scope 见 [M1-A Review](modules/storage/REVIEW.md)。远端 hash/HEAD 回读在提交后报告绑定。

## Risks

- 没有 Storage Runtime，不能接入生产；真正多云兼容、依赖解析仍未验证。
- Local 跨平台、crash恢复与安全边界需独立复核；未知写入结果不得自动重试。
- 本次单作者设计检查，不声称独立安全审计；Security Gate 仍 PENDING。
- 验证脚本是开发检查，不是 Framework CLI/Resolver。

## Open Questions

- Repository License：`xyq-dev` 在分发前决定，不阻塞当前设计。
- 多语言布局、云 Adapter 能力矩阵和真实跨模块依赖还需后续证据。
- M1-A 尚无必须再次询问用户的产品选择。

## Handoff

先读 AGENTS、PROJECT_CONTEXT、本文件和四个配置，再读 modules/storage 的 SPEC/API/ARCHITECTURE/TASKS/STATUS/REVIEW；无需旧聊天。Runtime 只按已通过 Gate 的 ST-001..004 执行，Local 另需安全审查。

M0 checkpoint/main base：`32f0072e386a6d0763e0a40b2584a159f3957be9`。M1-A 分支 `feat/storage-spec-v0.1`，当前提交 SHA 由提交后最终报告绑定。Cursor 默认本地 commit 可、push/main/pack/Tag/Release 不可，除非用户新授权。
