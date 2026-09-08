# Current Status

## Version

`0.1.0-dev`

## Phase

P1 — GitHub 项目开发标准与新项目采用入口

## Milestone

优先建立可供新项目采用的完整开发流程；Storage Runtime 参考工作暂缓。

## Current Task

P1 标准采用包已完成并通过校验，PR #1 已按用户授权合并到 main；下一步将标准应用到具体新项目。

## Completed

- M0：生命周期、Module Schema/模板、Agent、风险/Gate 和状态标准已完成。
- M1-A：Storage 规格已合并，保持 TASKS_READY；Runtime 尚未实现。
- P1 启动指南、项目模板/复制清单、完整流程、GitHub 模板与 Agent 提示词已完成。
- 新项目采用模拟通过：34 个目标文件，7 组检查和 6 个拒绝用例；原 Storage 静态回归通过。
- PR #1 已合并，启动指南、项目模板及 GitHub 协作模板已进入 main；合并记录见 Handoff。

## In Progress

P2 实际项目尚未开始。P1 标准与模板已合并；业务项目需求、实现和部署将在各项目独立推进。

## Blocked

当前标准整理无用户决策阻塞。实际新项目需求在该项目立项时确认；Storage Runtime 不阻塞标准采用。

## Next

1. 从 [START_HERE.md](START_HERE.md) 进入，使用新项目启动提示词按需求初始化独立项目。
2. 在实际项目中记录需求、裁剪、设计、任务、测试、验收与发布，反馈标准缺口。
3. 根据真实需要选择登录、OSS 等能力的来源和实现任务；不默认恢复 Storage M1-B。

## Decisions

- 2026-09-08 用户明确定位为 GitHub 项目标准仓库；标准采用优先于实现参考 Runtime。
- 标准源与业务项目分开；新项目按显式清单复制，并固定来源 commit，不继承 APF 进度。
- 阶段默认 pending；文档/格式检查、行为测试、验收、发布分别记录。
- 原 M0～M4 路线保留；Storage 规格和 Gate 证据保留，M1-B/C 暂缓。
- 不绑定技术栈；登录、OSS、支付等按项目需求选择，能力目录不冒充可安装代码。

## Changed Files

启动指南、README/定位/路线图、项目模板与复制清单、开发/GitHub 手册、Agent 提示词、Issue/PR 模板、标准验证及交接状态。

AGENTS、Module Schema、原 Module 模板、Storage API/设计与 Runtime Gate 保持原契约。

## Tests

`node validation/validate-standard.cjs`：PASS（7 组、6 个拒绝用例、34 个目标文件内存模拟）；`node modules/storage/validation/validate-spec.cjs`：PASS（10 组、10 个阴性 fixture）。环境与覆盖见 [ADOPTION_REVIEW.md](framework/ADOPTION_REVIEW.md)。Runtime tests=NOT_RUN；没有实际新项目创建或业务部署。

## Risks

新项目模板提供开发流程，不提供完整应用功能。GitHub 模板进入各项目默认分支后生效；CI、看板、保护规则与部署需要各项目实际配置。

## Open Questions

首个采用标准的实际项目名称、需求与约束将在对应项目立项时确认；不阻塞本标准仓库整理。

## Handoff

先读 AGENTS、PROJECT_CONTEXT、本文件，再读 START_HERE、开发手册与复制清单。当前主线为 P1 项目标准，不能按旧提示词自动启动 Storage。

P1 来源提交 `8a1645bbbeea8b85e6b1fb351051fd72291a93bf`，经 [PR #1](https://github.com/xyq-dev/agent-project-framework/pull/1) 合并到 main；合并提交 `5283bfafd69768009a45598746e71c5d41b8989d`。本次合并同时同步本文件与 ADOPTION_REVIEW 的交接记录，后续从 main 的 START_HERE 进入。新项目采用时记录实际选用的完整标准 commit SHA。
