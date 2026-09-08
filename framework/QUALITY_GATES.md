# Quality Gates V0.1

## Purpose

Quality Gate 是阶段性决策点，用证据阻止不完整或风险失配的工作向下游流动。Gate 不是文档数量检查，而是对结果是否足以安全推进的判断。

本项目的机器可读配置位于 `.agent-project/gates.yaml`。

## Gate Contract

每个 Gate 必须定义：

- `purpose`
- `entry criteria`
- `required evidence`
- `pass criteria`
- `failure behavior`
- `required reviewer`
- `risk override rule`

证据必须可以通过 Repository path、commit、测试运行或受控审查记录定位。

## Gate Summary

| Gate | Primary question | Failure result |
| --- | --- | --- |
| Spec | 问题、能力、边界和验收是否足够明确？ | 返回 Analyze，禁止正式实现 |
| Architecture | 依赖、兼容性、故障和安全设计是否可行？ | 返回 Architecture，中高风险禁止实现 |
| Implementation | 变更是否完成批准任务且无隐式扩张？ | 返回 Implement，记录偏差 |
| Test | 是否有风险匹配的行为和兼容性证据？ | 返回 Implement/Test，禁止 Acceptance |
| Security | 威胁、权限、数据与 Provider 风险是否受控？ | 按风险阻塞 Acceptance/Release |
| Acceptance | 结果是否满足批准的可观察目标？ | 返回责任阶段，不得标记 ACCEPTED |
| Release | 版本、制品、兼容性与恢复是否可追踪？ | 保持 ACCEPTED 但不 RELEASED |

## Evidence Rules

有效证据应满足：

1. **Traceable**：能定位到文件、commit、run 或审查记录。
2. **Relevant**：直接证明 Gate 条件，而非无关测试成功。
3. **Current**：对应本次源代码和配置版本。
4. **Reproducible**：尽可能包含命令、环境假设和结果。
5. **Owned**：失败和残余风险有责任人。

“已检查”“应该没问题”或聊天中的口头确认不是充分证据。

## Risk Application

| Risk | Required Gates | Independent review | Release policy |
| --- | --- | --- | --- |
| low | Spec, Implementation, Test, Acceptance | optional | 可按项目规则自动化 |
| medium | Spec, Architecture, Implementation, Test, Acceptance, Release | recommended | 需要可追踪 Release evidence |
| high | 全部 Gate | required | 人工批准，不得由实现者自验收 |
| critical | 全部 Gate | required, separate accountability | 禁止自动发布，必须有恢复证据 |

具体风险判定见 `framework/RISK_MODEL.md`。

## Override Rules

Override 不是“跳过记录”。每次 Override 必须包含：

- Gate 和被放宽的条件
- 批准者及其责任角色
- 适用 commit/version/scope
- 风险理由与补偿措施
- 到期时间或解除条件
- 后续补证任务

以下情况不可 Override：

- 必需测试已失败但仍准备通过 Acceptance。
- 存在未接受的 critical 安全问题却准备 Release。
- critical 变更没有恢复/回滚证据。
- 通过伪造或过期证据满足 Gate。

## Gate Decision Record

建议记录格式：

```yaml
gate: test
subject: module-name@0.1.0
decision: passed
reviewer: reviewer-id
timestamp: ISO-8601
evidence:
  - path-or-run-url
residual_risks: []
override: null
```

V0.1 可以记录在 `STATUS.md`；未来工具可以生成独立的 Gate ledger。

