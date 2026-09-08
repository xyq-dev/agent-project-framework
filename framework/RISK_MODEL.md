# Risk Model V0.1

## Purpose

风险等级决定分析深度、必需 Gate、测试范围、审查独立性和发布权限。分类基于潜在影响，而不是代码行数或实现者信心。

## Risk Dimensions

评估以下维度并采用最高合理等级：

- **Impact**：错误影响的用户、系统和业务范围。
- **Reversibility**：是否能快速、完整且无数据损失地恢复。
- **Data**：是否涉及持久化、敏感数据、权限或合规。
- **Money**：是否影响支付、退款、余额、计费或对账。
- **Security**：是否改变认证、授权、Secrets、边界或攻击面。
- **Production exposure**：是否直接操作生产资源或发布路径。
- **Dependency blast radius**：是否改变公共契约或多个 Module 的共同依赖。
- **Novelty/uncertainty**：是否缺少实践证据、回归测试或 Provider 经验。

## Levels

### Low

局部、可逆、无敏感数据和公共契约影响。

示例：文档修正、简单视觉调整、受测试覆盖的局部非关键重构。

最低控制：Spec、Implementation、Test、Acceptance；允许同一 Agent 自检，但必须留证据。

### Medium

可能影响一个完整能力、公共 API、Provider Adapter 或多个文件，但通常可回滚且不直接处理高敏感风险。

示例：普通 API、Storage Module、共享配置契约、可恢复的数据读取功能。

最低控制：Architecture Review、集成测试、Acceptance 和 Release evidence。关键契约建议独立复核。

### High

涉及认证授权、安全边界、敏感数据或较大生产影响，失败可能难以及时发现或恢复。

示例：Auth、权限模型、Secrets 使用、安全策略、敏感数据导出。

最低控制：全部 Gate、独立 Architecture/Security Review、集成测试和人工 Release 批准。实现者不得单独完成最终验收。

### Critical

涉及资金正确性、不可逆数据变更、生产数据直接操作或系统级安全关键路径。

示例：Payment、Refund、Reconciliation、Database Migration、生产数据修改、金融状态机、关键安全架构。

最低控制：全部 Gate、独立复核、端到端与故障测试、备份/回滚/恢复证据、人工 Release 决策。禁止自动 Release。

## Control Matrix

| Control | Low | Medium | High | Critical |
| --- | --- | --- | --- | --- |
| Spec Gate | required | required | required | required |
| Architecture Gate | optional | required | required | required |
| Integration Test | as affected | required | required | required |
| Security Review | as affected | as affected | required | required |
| Independent Review | optional | recommended | required | required |
| Human Release Approval | project policy | evidence required | required | required |
| Single-agent acceptance | allowed | discouraged for key contract | forbidden | forbidden |
| Automatic release | project policy | project policy | forbidden by default | forbidden |
| Recovery evidence | optional | required when stateful | required | required and tested |

## Classification Procedure

1. 列出受影响能力、数据、外部系统和消费者。
2. 逐项判断 Risk Dimensions。
3. 选择最高合理等级，并记录理由。
4. 从 `.agent-project/gates.yaml` 推导 Required Gates。
5. 若范围扩大或发现新数据流，重新分类。
6. 在 Acceptance 与 Release 前再次确认等级。

## Changes That Escalate Risk

以下任一情况通常至少上调一级：

- 从只读变为写入或删除。
- 从单项目内部契约变为公共共享契约。
- 增加外部 Provider 或不受控网络边界。
- 引入持久化格式或 Migration。
- 缺少可重复测试或恢复路径。
- 触及认证、授权、Secrets、资金或生产数据。

## Downgrade and Override

风险可因范围缩小或新证据而调整，但必须记录原等级、证据、批准者和剩余风险。Gate Override 不自动降低 Risk；Risk downgrade 也不删除已有失败证据。

Critical 风险不得通过同一实现者的单方判断降级，也不得因时间压力跳过 Security、Acceptance 或 Release 控制。

