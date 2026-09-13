# Storage Acceptance — 0.1.0-dev

## Subject

Module `storage`；候选版本 `0.1.0-dev`；基础 risk medium，Local/security 增量 high。四层初始代码与112项本地/离线测试已完成。2026-09-10 原始 ST-007 Memory/Local 范围独立正式验收 PASS；OSS 离线范围审查 PASS，真实云未验证，**含 OSS 的全模块 Runtime 验收仍 PENDING**。正式决定见 [STORAGE_M1_ACCEPTANCE_REVIEW.md](STORAGE_M1_ACCEPTANCE_REVIEW.md)。

## M1-A Document Checklist

- [x] SPEC/API/Architecture/Security 内容明确、互相一致。
- [x] Schema 和 artifact paths、能力/测试/验收映射通过检查。
- [x] config/audit 尚不存在的事实、显式注入策略和未来 dependency 条件已记录。
- [x] Memory/Local 已实测、OSS 离线实测与真实云未验证的范围分开。
- [x] 默认覆盖、not-found、cursor、range、metadata、版本与未知结果有确定语义。
- [x] 后续任务和 Cursor scope 包含测试、Git 授权与安全停点。

文档检查结果由 REVIEW/STATUS 记录；即使此项全部完成，也不将 Module 状态改成 ACCEPTED。

## M1-B/C Runtime Acceptance

| Criterion ID | Observable pass condition | Evidence required | Current result |
| --- | --- | --- | --- |
| AC-001 | 所有 key/prefix 阴性拒绝且无 I/O 副作用，合法值保真 | TEST-001 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-002 | 默认写竞争只发布一个完整对象，失败保留旧值 | TEST-002 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-003 | 读 snapshot 一致，exists 不吞权限/网络错误 | TEST-003 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-004 | 单 key delete/ifRevision 并发语义正确 | TEST-004 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-005 | 有界分页、续页和 namespace 隔离正确 | TEST-005 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-006 | copy 保留数据与 metadata，目标条件不被绕过 | TEST-006 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-007 | 未支持 move 明确无副作用失败；无虚假原子承诺 | TEST-007 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-008 | 只报告可兑现能力、Range 和条件语义不降级 | TEST-008 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-009 | Memory/Local 不生成假签名；multipart 不启用 | TEST-009 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-010 | metadata 校验/替换与 revision/etag/checksum 各自语义正确 | TEST-010 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-011 | 取消、预算、重试、unknown outcome、日志和 Observer 行为正确 | TEST-011 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-012 | 无 config/audit 包也可运行；无技术栈泄漏进核心契约 | TEST-012 | Memory PASS / Local PASS（ST-007正式验收） |
| AC-013 | Local root/锁/原子记录/故障恢复在声明环境通过安全测试 | TEST-013 + independent review | Local PASS（独立Security/Acceptance）；Memory N/A |
| AC-014 | 私有包、锁文件和类型检查、支持声明、边界验证一致 | TEST-014 | Memory PASS / Local PASS（ST-007正式验收） |

## Release and Security Rules

不因存在 unsigned commit 就形成 Module Release；release 需要 Test/Security/Acceptance、已知限制、兼容性与回滚证据，以及明确发布授权。M1 结束也不自动 npm publish、Tag、GitHub Release 或部署。

Local 的 acceptor/reviewer 不得只是实现者；cloud/signing/recovery 的后续高风险任务需要独立证据。无批准的残余 high/critical 风险不能通过验收。

## Decision

- 原始 ST-007 Core/Memory + Local 范围：**Implementation/Test/Security/Acceptance PASS**。AC-001..012/014 两者 PASS；AC-013 Local PASS、Memory N/A。独立决定人 `/root/storage_gate_review`，GPT-5.6 Sol / xhigh，源码 `609b32724d70f3e1ce5225a2cb415b0e7918edd4`。
- 证据采用2026-09-09固定源码的112项测试和上一独立复测，本日没有新的Node运行；[正式审查](STORAGE_M1_ACCEPTANCE_REVIEW.md)列出依据、适用环境与残余风险owner。
- OSS Implementation、离线Test及离线源码/安全审查：PASS，仅批准已审离线范围；真实云验收不由此签发。
- 含 OSS 的全模块 Runtime acceptance: **PENDING**；真实云Test/Security证据尚缺，按[云端清单](OSS_CLOUD_VALIDATION.md)继续。
- Release: **NOT AUTHORIZED**。
- Accepted deviations: None；延后能力是明示 scope，不是 Gate override。
- Remaining owner: `xyq-dev` 指定测试资源与宿主执行者；宿主完成真实OSS矩阵与精确版本清理；独立reviewer/security-reviewer/acceptor审查结果。

OSS 扩展 profile：支持能力离线测试 PASS；conditional-write/delete、signing、move、multipart false 的拒绝测试 PASS。真实云 NOT_RUN。通用 AC 不能被解释为 OSS 也提供原子 create/CAS 或已通过生产验收。
