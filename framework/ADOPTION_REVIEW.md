# P1 项目标准采用 — 变更与验证记录

## 范围与依据

用户于 2026-09-08 明确要求在 GitHub 建立项目标准仓库，将整个开发流程集中维护，供新项目采用。此前缺少空目录启动入口，当前状态把 Storage 实现当作默认下一步，容易把规范仓库与业务项目混在一起。

本次交付标准采用流程与文档模板，不实现应用 Runtime。风险为 medium（跨文件模板与状态契约），当前 Codex 执行设计与自检，不声称独立安全审计。

## 架构判断

- 源标准仓库保存通用规范；目标项目接收显式文件清单与固定 source commit。
- 项目 README/身份/状态/workflow 来自新模板；共享 AGENTS、Gate、Module 标准和模板来自同一快照。
- 默认不复制 Storage、APF 路线图或执行进度；目标没有预选模块、测试通过或发布记录。
- GitHub Issues/PR 记录任务与变更；可版本化文档保存最终决定和可恢复状态。
- Storage 设计证据不变，调度暂缓；Module Schema 和通用门禁语义不变。
- 不创建新业务仓库、不修改现有权限、不配置收费服务或生产环境。

## 验收矩阵

| ID | 目标 | 证据 |
| --- | --- | --- |
| P1-001 | 用户从空目录知道第一步 | START_HERE、NEW_PROJECT 提示词 |
| P1-002 | 覆盖需求至维护的完整流程 | PROJECT_PLAYBOOK、项目计划模板 |
| P1-003 | 区分标准源和目标项目身份/进度 | BOOTSTRAP_MANIFEST、项目模板、采用模拟 |
| P1-004 | GitHub 任务/评审有统一记录 | GITHUB_WORKFLOW、3 份 Issue 模板、PR 模板 |
| P1-005 | Agent 按已定方案执行并交接 | 初始化、执行、评审、交接提示词 |
| P1-006 | 能力按需选择，停止默认启动 Storage | PROJECT_CONTEXT、CURRENT_STATUS、ROADMAP、Storage STATUS/TASKS |
| P1-007 | 模板可解析、文件和链接不缺失 | validate-standard.cjs 与保留的 validate-spec.cjs |

## 执行记录

执行环境：Node 24.19.0、Ajv 8.20.0、js-yaml 4.1.1。维护者验证依赖由环境通过 NODE_PATH 提供；不是新项目的业务工具链，也未增加根 package 或 Runtime。

| 命令 | 结果 | 覆盖 |
| --- | --- | --- |
| `node validation/validate-standard.cjs` | PASS | 7 组检查、6 个拒绝用例、34 个目标文件在内存中的采用模拟 |
| `node modules/storage/validation/validate-spec.cjs` | PASS | 10 组检查、10 个阴性 fixture、14 条计划用例映射 |

采用模拟验证：目录/文件映射、路径隔离、缺失/重复目标、带引号中文参数的 YAML 安全填写、目标项目身份、12 个初始 pending 阶段、空证据、未选模块、必读契约和相对链接。校验器显式区分源模板位置与复制后的目标上下文，也覆盖目录链接。

拒绝用例：缺失源、重复目标、越界路径、Git 元数据路径、继承 complete 状态、未替换参数。原 Module Schema、模板和 Storage 入场/出场规则仍通过原校验。

`BOOTSTRAP=IN_MEMORY_ONLY`：没有实际创建用户的新项目仓库。业务测试/Storage Runtime=NOT_RUN；GitHub UI/Actions/生产部署未运行。

P1-001～007 在本次标准与模板范围内满足；真实项目应用与线上效果留到 P2 验证。远端交付后核对 HEAD、树与关键文件内容，不把本地通过当作已经合并。

## 交付边界

基线 main：`7dd1fff7b2e3b1f3aa44bfc762ab559e9dfa44d8`。变更分支：`docs/project-standards-v0.1`。提交 SHA 与远端回读在交付报告绑定。

模板位于专题分支时可阅读和评审；进入目标仓库默认分支后才会成为 GitHub 默认 Issue/PR 入口。当前没有业务项目验收、GitHub Actions 运行或生产部署证据。
