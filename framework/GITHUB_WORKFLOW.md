# GitHub 项目协作流程 V0.1

GitHub 保存项目事实与交付证据。标准仓库管理标准演进；每个业务项目的需求、代码、测试、PR 与发布记录放在自己的仓库。

## 信息放哪里

| 信息 | 位置 | 维护规则 |
| --- | --- | --- |
| 稳定定位与架构边界 | PROJECT_CONTEXT.md、项目设计文件 | 发生决定性变化时随 PR 更新 |
| 首版范围、阶段裁剪与验收 | docs/PROJECT_PLAN.md | 需求 ID 与任务/测试互相对应 |
| 当前停点、阻塞、下一步 | CURRENT_STATUS.md | 完成任务、改变范围、交接时更新 |
| 需求与讨论 | 立项 Issue | 决议回写项目文档 |
| 开发与缺陷 | 任务/缺陷 Issue | 一个 Issue 有一个可验收目标 |
| 改动及复核 | branch + Pull Request | 引用需求/Issue、真实测试与风险 |
| 可选看板 | GitHub Projects | 仅汇总 Issue；列与文件状态保持一致 |
| 发布 | 版本记录及 Release（执行时） | 绑定已验收 commit、环境、制品和恢复信息 |

## 从第一项需求到第一次合并

1. 在本项目仓库建立立项 Issue，关联 `docs/PROJECT_PLAN.md`。由 owner 确认范围，分析者记录技术或安全上的阻塞。
2. 将首版拆成开发任务，每项填 owner、依赖、风险、范围、测试、验收和 Git 授权。
3. 从核对后的基线创建 `feat/<topic>`、`fix/<topic>` 或 `docs/<topic>`，开始前保留现有未提交改动。
4. 任务有推送授权时推送专题分支并开 PR；PR 使用模板提供可审查证据。未完成工作可以使用 Draft PR。
5. 按实际风险复核。填写评审结果后，由有权限且获授权的人/Agent 合并；保留失败记录，不强推解决冲突。
6. 更新项目状态与 Issue；只有满足对应验收条件才能关闭任务。合并本身不等于部署成功。

一个提交表达一个完整意图，使用 `docs:`、`feat:`、`fix:`、`test:` 等清晰信息。Git 写入、发布与生产操作以当前任务的明确授权为准，不因模板中的勾选框自动获得权限。

## 模板如何生效

立项、任务和缺陷模板位于 `.github/ISSUE_TEMPLATE/`。新建 Issue 时可选择相应模板；Markdown 模板有 `name`、`about` 元数据。模板进入仓库默认分支后，才可作为默认入口使用。参见 [GitHub Issue 模板说明](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates)。

PR 默认正文来自 `.github/pull_request_template.md`，也需要在默认分支中可用。参见 [GitHub PR 模板说明](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)。

当前模板不依赖预建标签、指定成员或收费看板功能。本仓库提供文件和操作标准；新项目的远端创建、设置、Ruleset 和自动化需要实际配置与回读，不能在文档中当作已启用。

## 检查与发布

技术栈确定后再添加适用的 GitHub Actions：语法/格式、类型、构建、单元、契约/集成和风险相关检查。没有 Actions 的项目记录实际本地命令与结果；不能放一个空工作流显示绿色来代表通过。

分支保护或 Ruleset 若被项目采用，应记录真实配置、要求的检查与评审人；只有完成配置才写已启用。设置变更遵从本项目授权。

发布记录至少包括：目标环境、commit、制品版本、依赖和配置名称、数据变更、实施与回滚步骤、批准者、健康检查、观察窗口和结果。秘密值通过实际凭据系统管理，GitHub 只记录配置名及获取约定。

## 维护与交接

缺陷记录预期/实际、复现、影响、环境与回归验证。线上事故先记录影响与恢复决策，再形成修复任务和复盘；不能借机扩大未授权操作。

关闭会话前更新 CURRENT_STATUS、相关 Module STATUS 和未完成 Issue 的停点。新 Agent 从仓库文件进入；设计链接、测试链接失效时记录缺口，不推测旧会话中的结论。
