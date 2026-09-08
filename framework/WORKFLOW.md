# Workflow Standard V0.1

## Purpose

本标准定义 APF 的 Project Lifecycle、Module Lifecycle 和 Agent Execution Flow。目标是在不强迫所有项目执行相同步骤的前提下，使阶段选择、状态变化和完成证据可以被人和工具一致理解。

## 1. Project Lifecycle

默认阶段顺序：

```text
Requirements
→ Product
→ UX / User Flows
→ Design
→ Architecture
→ Database
→ API
→ Implementation
→ Testing
→ Security
→ Deployment
→ Production Gate
```

这是一条默认依赖顺序，不是所有项目必须逐项执行的固定瀑布流程。项目在 `.agent-project/workflow.yaml` 中为每个阶段声明 `mode`、`status`、理由和证据。

### Stage Mode

| Mode | Meaning | Requirement |
| --- | --- | --- |
| `required` | 项目必须执行 | Release 前必须为 `complete` |
| `optional` | 项目按价值选择执行 | 必须说明采用或不采用的判断 |
| `skipped` | 原本适用但本次明确跳过 | 必须记录理由、风险和批准者 |
| `not-applicable` | 对当前项目没有适用对象 | 必须记录可验证理由 |

`skipped` 与 `not-applicable` 不等价。前者存在残余风险，后者表示阶段没有对应对象。

### Stage Status

| Status | Meaning |
| --- | --- |
| `pending` | 尚未开始或等待前置条件 |
| `in-progress` | 已开始且尚未完成 |
| `blocked` | 有明确阻塞和责任人 |
| `complete` | 满足该 Mode 对应的完成条件 |

Mode 表示流程策略，Status 表示当前执行状态。二者必须分开，避免把“可选”和“未完成”混为一谈。

### Tailoring Examples

- 纯 API 服务：`Design = not-applicable`，但 API、Testing 和 Deployment 可以是 `required`。
- 小型内部工具：`Product = optional`，需要记录为何精简。
- 金融系统：Security 与 Production Gate 必须为 `required`，不得以工期为由跳过。

### Project Stage Completion

一个阶段只有在以下条件成立时才能标记 `complete`：

1. 入口条件满足。
2. 必需输出存在并可定位。
3. 对应 Gate 已通过，或该阶段已按规则标记为 skipped/N/A。
4. 未解决风险已记录责任人和处理方式。
5. 下游依赖能够读取该阶段的稳定输出。

## 2. Module Lifecycle

标准状态：

```text
DRAFT
↓
SPEC_READY
↓
ARCHITECTURE_READY
↓
TASKS_READY
↓
IMPLEMENTING
↓
TESTING
↓
REVIEW
↓
ACCEPTED
↓
RELEASED
```

| State | Required outcome |
| --- | --- |
| `DRAFT` | Module 已命名，问题和所有者已识别 |
| `SPEC_READY` | 能力、边界、依赖和验收条件已批准 |
| `ARCHITECTURE_READY` | 架构、兼容性、故障与安全设计满足风险要求 |
| `TASKS_READY` | 实现任务原子、排序明确且可验证 |
| `IMPLEMENTING` | 只执行已批准任务，偏差被记录 |
| `TESTING` | 实现冻结到可测试状态，测试计划开始执行 |
| `REVIEW` | 必需测试通过，进入正确性与风险复核 |
| `ACCEPTED` | 验收条件满足，残余风险有归属 |
| `RELEASED` | 版本、制品、兼容性和恢复证据已确认 |

### Transition Rules

- `TASKS_READY → IMPLEMENTING` 只评估 Implementation Gate 的 **entry criteria**（批准输入和可执行任务）；不要求代码已经完成。
- `IMPLEMENTING → TESTING` 评估同 Gate 的 **exit criteria**（变更、范围对应和自检）。入场合格不能记成 Implementation Gate 最终 PASS。
- `ARCHITECTURE_READY → TASKS_READY` 在 Architecture Review 下做 task-readiness 子检查（范围、顺序、测试和授权），不新增第八个顶层 Gate。
- 状态默认顺序推进，不允许用一次状态修改伪造多个 Gate 的证据。
- 无 Spec Gate 不得进入正式实现。
- `medium`、`high`、`critical` 无 Architecture Gate 不得进入 `IMPLEMENTING`。
- `low` 风险 Module 可将 Architecture 标记为不适用，但必须记录判断，并保留从 `SPEC_READY` 到 `TASKS_READY` 的显式例外证据。
- Test Gate 失败时返回 `IMPLEMENTING` 或保持 `TESTING`，不得进入 `ACCEPTED`。
- `high`、`critical` 的 Security Gate 未通过时，不得进入 `RELEASED`。
- 回退状态必须保留原失败证据，不能覆盖历史事实。

### Transition Record

每次重要状态变化至少记录：

```yaml
from: TESTING
to: REVIEW
timestamp: ISO-8601
actor: reviewer-id
evidence:
  - path-or-run-url
decision: passed
notes: concise rationale
```

V0.1 允许记录在 Module `STATUS.md`；未来可迁移为机器维护的状态日志。

## 3. Agent Execution Flow

```text
Analyze → Plan → Implement → Test → Review → Accept → Handoff
```

### Analyze

- 读取 Repository 指令、稳定上下文、动态状态和相关 Module 契约。
- 识别受影响范围、依赖、兼容性和风险。
- 区分 Framework 能力与 Project-specific code。

### Plan

- 将工作拆成可验证的原子步骤。
- 标出修改范围、禁止范围、Gate、测试和 Git 授权。
- 对不确定项给出阻塞或明确假设。

### Implement

- 只执行已批准任务。
- 保持契约和实现分离；Provider 差异进入 Adapter。
- 发现范围变化时返回 Analyze/Plan，而不是静默扩张。

### Test

- 将测试映射到能力、风险和验收条件。
- 保存命令、结果、失败和未覆盖项。
- 不以格式检查代替行为验证。

### Review

- 检查正确性、边界、依赖、兼容性、安全和可恢复性。
- 高/关键风险由独立角色复核。

### Accept

- 对照 Acceptance checklist 作出通过或拒绝决定。
- 记录残余风险及所有者。

### Handoff

- 更新 Module `STATUS.md` 和必要时的 `CURRENT_STATUS.md`。
- 记录 changed files、tests、decisions、risks、open questions 和 next。

## 4. Work Item Contract

每个可执行任务至少应包含：

- `id`、`title`、`owner`
- `goal`、`in_scope`、`out_of_scope`
- `dependencies`、`risk`
- `required_gates`
- `acceptance_criteria`
- `test_plan`
- `allowed_git_actions`
- `status`

缺少会显著改变实现结果的信息时，任务保持 blocked，而不是由 Agent 私自选择业务方向。

## 5. Exception Handling

流程例外必须：

1. 标明被跳过或改变的规则。
2. 说明业务理由和时间约束。
3. 记录风险等级是否变化。
4. 提供补偿控制和到期条件。
5. 由风险等级要求的角色批准。

例外不是永久标准；反复出现的例外应转化为 Framework 改进提案。
