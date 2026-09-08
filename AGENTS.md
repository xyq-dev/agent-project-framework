# Agent Operating Contract

本文件是所有进入本 Repository 的 Agent 的最高优先级项目级工作约定。它不替代任务说明；当任务与本文件冲突时，先停止并请求明确决策。

## 1. Startup Sequence

开始任何修改前，按顺序读取：

1. `AGENTS.md`
2. `PROJECT_CONTEXT.md`
3. `CURRENT_STATUS.md`
4. `.agent-project/project.yaml`
5. `.agent-project/workflow.yaml`
6. `.agent-project/agents.yaml`
7. `.agent-project/gates.yaml`
8. 相关 Module 的 `module.yaml`、`SPEC.md`、`TASKS.md`、`STATUS.md`

如果必读文件缺失、相互矛盾或状态过期，先修复上下文或报告阻塞，不直接实现。

## 2. Task Eligibility

开始实现前必须确认：

- 任务目标、允许范围、禁止范围和验收条件明确。
- 受影响 Module 已识别，依赖和下游影响已检查。
- 风险等级已按 `framework/RISK_MODEL.md` 判定。
- 必要的 Spec、Architecture 和 Tasks Gate 已通过。
- 高风险或关键任务已有所需审查者与回滚策略。

不满足条件时，Agent 只能分析、补规格或报告阻塞。

## 3. Standard Workflow

所有任务遵循：

```text
Analyze → Plan → Implement → Test → Review → Accept → Handoff
```

- **Analyze**：读取上下文，确认问题、边界、依赖和风险。
- **Plan**：列出原子步骤、预期文件和验证方式。
- **Implement**：只改批准范围，保持最小完整变更。
- **Test**：执行风险匹配的自动与人工验证。
- **Review**：检查正确性、兼容性、安全和 Project-specific hardcode。
- **Accept**：逐项满足验收条件并记录证据。
- **Handoff**：更新 Module 与项目状态，明确下一步和阻塞。

## 4. Risk Routing

风险等级为 `low`、`medium`、`high`、`critical`。详细控制矩阵以 `framework/RISK_MODEL.md` 为准。

- `low`：可以由一个 Agent 完成，但仍需自检和验收证据。
- `medium`：必须有架构判断和集成级验证；实现者可自检，接受前应复核关键契约。
- `high`：需要独立 Architecture/Security Review 和人工 Release 决策。
- `critical`：需要完整 Gate、独立复核、回滚与恢复证据；禁止单 Agent 自行接受或自动发布。

模型和工具名称只属于可替换的执行配置，不属于 Framework Core。当前推荐路由记录在 `.agent-project/agents.yaml`。

## 5. Gate Rules

- 未通过 Spec Gate，不进入正式实现。
- `medium` 及以上未通过 Architecture Gate，不进入 Implementation。
- 测试失败，不得通过 Acceptance Gate。
- `high` 或 `critical` 未通过 Security Gate，不得 Release。
- Gate 只能由所需角色依据可定位证据通过，不能以“看起来没问题”代替。
- Override 必须记录批准者、理由、范围、到期条件和补偿措施；`critical` 不允许静默降级。

## 6. Test Rules

每次变更至少：

1. 验证变更文件格式和语法。
2. 验证直接行为或契约。
3. 验证受影响依赖与兼容性。
4. 记录执行命令、结果和未覆盖项。

不得声称未执行的测试已通过。若测试无法运行，必须把原因、风险和替代证据写入状态。

## 7. Change Boundaries

禁止：

- 把具体业务项目、云厂商、数据库、语言或框架写死进 Framework Core。
- 为了目录好看创建大量空模块或无意义占位文件。
- 在未批准时扩展任务、修改 Secrets、生产数据或收费服务。
- 绕过 Module Lifecycle、Gate 或风险路由。
- 用聊天记录代替 Repository 中的状态和决策。
- 在规格尚未稳定时提前实现 CLI、Marketplace 或大规模生成器。

## 8. Git Rules

- 修改前确认 branch、HEAD 和工作状态；已有内容不得覆盖。
- 一个提交只表达一个完整意图，提交信息使用清晰的 Conventional Commit 风格。
- 不重写共享历史，不强推，不删除分支、Tag 或 Release，除非用户明确授权。
- 默认不直接写 `main`；只有任务明确允许时才可写入。
- Commit/Push 后必须重新读取远端 HEAD 和关键文件。
- 不提交 Secrets、凭据、构建缓存或本地环境文件。

## 9. Status and Handoff

完成重要工作后，更新相关 `STATUS.md`；影响项目里程碑时同时更新 `CURRENT_STATUS.md`。至少记录：

- version、phase、current task
- completed、in progress、blocked、next
- decisions、changed files、tests、risks、open questions
- commit/branch（提交后）和接手所需上下文

状态必须描述事实，不写无法验证的完成声明。完整格式见 `framework/STATUS_STANDARD.md`。

## 10. Definition of Done

任务只有在以下条件全部满足时才算完成：

- Scope 内的交付物存在且互相一致。
- 必需 Gate 已通过并有证据。
- 相关测试已通过或剩余风险被明确接受。
- 文档、配置、模板与实现没有职责冲突。
- 状态与交接信息已更新。
- Git 操作符合授权范围，并已完成远端回读验证。

