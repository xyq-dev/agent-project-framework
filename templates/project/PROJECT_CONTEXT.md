# Project Context

## 项目身份

- ID：`{{PROJECT_ID}}`
- 名称：{{PROJECT_NAME}}
- 负责人：{{PROJECT_OWNER}}
- 仓库地址以 `.agent-project/project.yaml` 的 project.repository 为准；未创建时留空。

## 项目目标与用户

在需求阶段填写已知问题、用户、使用场景和预期结果。未知内容明确标记待确认，不从 APF 案例推导本项目业务。

## 首版边界

首版范围、不做事项和验收条件记录在 `docs/PROJECT_PLAN.md`。这里只保留长期稳定边界；进度放在 `CURRENT_STATUS.md`。

## 技术与模块

技术栈、目录和模块尚未选择。先根据需求决定，再记录约束、依赖、外部组件来源和风险。没有相应需求时不预建数据库、服务或空模块。

## 协作原则

采用本仓库 `AGENTS.md` 和 `.agent-project/` 配置。默认 Codex 分析/评审，Cursor 执行明确任务；具体模型路由可替换。已有决定有证据时直接复用，避免重复分析。

## 标准采用

标准源 commit：`{{STANDARD_COMMIT}}`。该快照只提供流程与模板，本项目的审批、测试、验收和发布证据需要独立建立。
