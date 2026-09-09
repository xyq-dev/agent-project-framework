# Storage Review and Evidence

## 当前实施与审查证据（2026-09-09）

四层初始实现与 112 项测试完成。详细命令、源码摘要、限制和未完成事项见 [实施报告](STORAGE_M1_B_IMPLEMENTATION_REPORT.md)。作者为当前 Codex，未调用 Cursor；用户明确授权了一个独立安全审查 Agent，设计结论见 [其独立记录](INDEPENDENT_SECURITY_REVIEW.md)，本轮最终代码复核见 [原样消息记录](INDEPENDENT_REVIEW_TRANSCRIPT.md)。

| 验证 | 当前结果 |
| --- | --- |
| ci / typecheck / build | PASS |
| npm test | 112/112，0 fail/skip/cancel |
| 分组测试 | contract42 / failure43 / security27；不重复计数 |
| Local | 34 PASS（真实临时文件系统、进程 SIGKILL） |
| OSS | 34 PASS（官方 SDK + loopback），真实云 NOT_RUN |
| runtime dependency audit | 已知漏洞0 |
| 独立设计 | Local ST-005 与 OSS-001 DESIGN PASS |
| 最终独立实现 Security / Acceptance | PENDING：独立代码复核/112项复测已确认，正式报告追加前额度中断；结论见消息记录 |

Storage 静态检查 PASS（10 组、13 阴性、14 映射）；标准采用回归 PASS（9 组、9 阴性、46 目标内存模拟）；结果由报告/PR 回读绑定。它们校验状态、哈希和未实现 scope 阴性，不执行 Runtime。新项目仍 12 阶段 pending，不自动安装参考实现或继承 Gate。

以下 M1-A 为历史规格记录，其中“无 Runtime/TASKS_READY”只描述当时交付。

## M1-A 历史记录

## Subject / Scope

storage@0.1.0-dev；2026-09-08 UTC；baseline main `32f0072e386a6d0763e0a40b2584a159f3957be9`。当前 Codex 按 analyst/architect/reviewer 角色进行单作者设计检查；不是多 Agent 或独立安全审核，不声明具体模型已切换。

本次只交付规格，Runtime 行为测试未运行。用户授权继续下一阶段；按 AGENTS 默认专题分支，不直接更新 main。

## Kernel Feedback

| Finding | Resolution | Boundary |
| --- | --- | --- |
| KERNEL-001：TASKS_READY→IMPLEMENTING 依赖 Implementation Gate PASS，而 PASS 要求任务已完成，形成循环 | 在 workflow transition 区分 entry-criteria 与 exit-criteria；入场仅检查批准输入，出场才要求实现/测试证据 | 不放宽最终 Gate，不添加新顶层 Gate |
| KERNEL-002：config/audit 尚无规格，声明虚假版本会形成不可解析依赖 | 本增量使用注入值/Observer；未来真实模块存在后再声明可选依赖与范围 | 不创建空模块；M1 尚不能证明 Resolver/安装依赖 |
| KERNEL-003：Schema 0.1 不区分计划 Provider 与已支持 Provider | 当前 providers/runtimes 为空，目标矩阵在 SPEC 中，capabilities 全 experimental | 不扩展共享 Schema、不误报支持 |
| KERNEL-004：M0 active workflow 已 complete，不代表 Storage complete | active profile 改为 storage-reference，runtime/security/testing 均保留 pending | M0 基线仍在历史 commit，可恢复 |
| KERNEL-005：Schema 不覆盖重复 ID、跨路径引用、风险 Gate 等语义 | 模块本地只读验证脚本补充阴性 fixtures | 不是 APF Resolver/CLI；通用 Schema 加强另行讨论 |

## Review Checks

- 明确隔离 Infrastructure/Media/业务 ACL，API 不接收每请求 endpoint/root。
- 默认条件写、单对象 snapshot、metadata 原子性有确定行为；不把未知写入或 exists 网络错误说成成功。
- move 禁用、云签名不虚构；Range/conditional 均有能力拒绝路径。
- config/audit 无虚假依赖；首个 Runtime/Profile 有边界，不绑定其它项目。
- Local 故障恢复与 symlink/trust 限制有任务和安全停点。
- 全部 REQ-001..014 有测试及 AC；未运行行为测试明确 NOT_RUN。
- Cursor 首批 ST-001..004 明确禁止 Local/Cloud/main/push/pack，后续风险不借本批授权扩张。

## Validation Results

执行脚本：[validate-spec.cjs](validation/validate-spec.cjs)，不会实现对象操作或写入 runtime 数据。

| Command / method | Environment | Result |
| --- | --- | --- |
| `node --check modules/storage/validation/validate-spec.cjs` | Node 24.19.0 | PASS |
| `node modules/storage/validation/validate-spec.cjs` | Node 24.19.0 / Ajv 8.20.0 / js-yaml 4.1.1（NODE_PATH 指向环境已有依赖，无安装/升级） | PASS：10组静态检查、10个阴性fixture、14条映射 |
| Module 完整性/无占位检查 | 14个实质文件；无实现目录 | PASS |
| Runtime tests | 无 Runtime | NOT_RUN：14个计划case，非14个已执行行为测试 |

复现静态检查时只需将上述 Ajv/js-yaml 版本置于 Node 模块解析路径。验证器可随仓库运行；不提交临时依赖、环境路径或安装包。

## Gate Decisions

Spec：PASS（当前 Codex analyst 自检；边界、需求与验收明确）。Architecture：PASS（当前 Codex architect 自检 ADR、limits、失败/恢复与依赖；只批准分步计划，Local/security 不视为独立审查通过）。Tasks readiness：PASS（任务顺序、风险、测试、Git授权和 Local 阻塞条件明确）。逐次转移时间和证据见 STATUS，最终状态 TASKS_READY。

Implementation/Test/Security/Acceptance/Release 均不通过本次规格检查获得 PASS。没有 Gate override。M1-A 完成不等于整个 M1 完成。

## Unresolved Risks

License、真实 Adapter 兼容性、Local 独立安全审查、云 signer 验证仍未解决，具体解除条件见 TASKS/STATUS。M1 只在两种 Adapter 的真实证据完成后才可整体验收。
