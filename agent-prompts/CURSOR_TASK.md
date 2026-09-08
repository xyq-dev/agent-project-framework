【执行工具：Cursor｜模型：Grok 4.6 High Fast】

在当前项目仓库执行本轮已批准任务，沿用已有方案，不重复架构分析。

## 开工

核验工作目录、origin、branch、HEAD 与未提交改动。读取 AGENTS.md、PROJECT_CONTEXT.md、CURRENT_STATUS.md、四个 `.agent-project/` 配置和 docs/PROJECT_PLAN.md，以及本任务对应的设计/Issue/模块文件。

从任务记录提取：任务 ID、目标、依赖、允许路径、禁止路径、风险、验收、测试、Git/pack/deploy 权限。已有决定直接复用；缺失内容仅在影响正确执行时报告具体阻塞。

## 执行与测试

- 只实现该任务范围，保留无关未提交内容。分支依据任务约定，不能把当前位于 main 视为可直接写入。
- 实际代码与设计冲突时给出具体文件、规则和反例，不静默重写契约。
- 执行任务规定的类型/构建/功能/异常/回归检查；按风险增加必要验证。
- 记录实际命令、环境、commit、结果和未覆盖项；命令缺失或未运行不写 PASS。
- 对照验收更新项目状态，影响模块时同时更新 Module STATUS。

## 操作权限

commit、push、main/merge、pack、publish/deploy、Tag/Release 分别依据当前任务授权执行；本模板不扩大授权。保留已有历史与工作区，不强推或破坏性清理。

## 报告

输出 `PROJECT_TASK_REPORT`：工作目录、任务 ID、Branch、Previous/New HEAD、Created/Modified、完成/未完成、测试命令与结果、验收对应、风险、下一步、实际 Git/pack/deploy 结果。提交后核验提交范围；推送后回读远端 HEAD 和关键文件。
