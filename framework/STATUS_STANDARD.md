# Status and Handoff Standard V0.1

## Purpose

状态文件使项目在更换会话、Agent、工具或执行环境后仍可继续。状态记录当前事实；长期不变的原则属于 `PROJECT_CONTEXT.md`，详细设计属于 Module 文档。

## Scope

- `CURRENT_STATUS.md`：项目/里程碑级动态状态。
- `modules/<name>/STATUS.md`：单 Module 状态、Gate 与交接。
- `PROJECT_CONTEXT.md`：长期稳定事实，不存放短期进度。

## Required Fields

状态至少包含：

1. `version`
2. `phase`
3. `milestone`
4. `current_task`
5. `completed`
6. `in_progress`
7. `blocked`
8. `next`
9. `decisions`
10. `changed_files`
11. `tests`
12. `risks`
13. `open_questions`
14. `handoff`

Module Status 还必须包含 Lifecycle state、required Gates、最新 Gate decisions 和 compatibility impact。

## Writing Rules

- 使用事实和可验证结果；避免“基本完成”“应该可以”等模糊陈述。
- `completed` 只列已满足 Definition of Done 的事项。
- `in_progress` 必须说明当前停点和继续所需输入。
- `blocked` 必须说明原因、责任人、解除条件；无阻塞写 `None`。
- `next` 按优先级排序，第一项应可直接执行。
- 决策包含选择、理由和被放弃方案的关键影响。
- 测试包含命令/方法、结果、commit 或环境，未运行项必须明确。
- changed files 可按目录分组，但关键契约文件应单列。
- 不把 Secrets、个人数据或临时凭据写入状态。

## Update Triggers

出现以下情况必须更新：

- Module Lifecycle 状态改变。
- Gate 通过、失败或 Override。
- 任务完成、阻塞或范围发生实质变化。
- 公共契约、依赖、风险或兼容性改变。
- Commit/Push/Release 后形成新的可恢复点。
- 会话结束前仍有未完成工作。

纯格式修正且不影响任务状态时，可不更新项目级状态。

## Handoff Minimum

接手者应能从 Handoff 回答：

- 当前在做什么，为什么？
- 已经完成和验证了什么？
- 哪些文件和契约发生变化？
- 下一步从哪里开始？
- 有什么阻塞、风险和开放问题？
- 哪些操作被允许或禁止？
- 当前 branch、commit 和测试证据是什么？

若这些问题仍依赖旧聊天记录，Handoff 不合格。

## Gate Decision Entry

```markdown
### Gate: Test

- Decision: PASS / FAIL / BLOCKED
- Reviewer: role or identifier
- Subject: module@version / task id
- Evidence: paths, commands, run URLs
- Residual risks: explicit list or None
- Override: approval record or None
```

## Commit-aware Handoff

提交前可记录 `pending commit`，但 Push 后必须用真实 SHA 更新或在最终报告中绑定该状态版本。禁止猜测 SHA。若状态文件本身无法包含当前提交 SHA，可由提交后的远端回读报告补足。

