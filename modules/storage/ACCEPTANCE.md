# Storage Acceptance — 0.1.0-dev

## Subject

Module `storage`；候选版本 `0.1.0-dev`；基础 risk medium，Local/security 增量 high。Core/Memory 已有实测证据；Local/OSS 未完成，**全模块 Runtime 验收仍 PENDING**。

## M1-A Document Checklist

- [x] SPEC/API/Architecture/Security 内容明确、互相一致。
- [x] Schema 和 artifact paths、能力/测试/验收映射通过检查。
- [x] config/audit 尚不存在的事实、显式注入策略和未来 dependency 条件已记录。
- [x] Memory 已验证支持与 Local 未实现目标分开。
- [x] 默认覆盖、not-found、cursor、range、metadata、版本与未知结果有确定语义。
- [x] 后续任务和 Cursor scope 包含测试、Git 授权与安全停点。

文档检查结果由 REVIEW/STATUS 记录；即使此项全部完成，也不将 Module 状态改成 ACCEPTED。

## M1-B/C Runtime Acceptance

| Criterion ID | Observable pass condition | Evidence required | Current result |
| --- | --- | --- | --- |
| AC-001 | 所有 key/prefix 阴性拒绝且无 I/O 副作用，合法值保真 | TEST-001 | Memory PASS / Local NOT_RUN |
| AC-002 | 默认写竞争只发布一个完整对象，失败保留旧值 | TEST-002 | Memory PASS / Local NOT_RUN |
| AC-003 | 读 snapshot 一致，exists 不吞权限/网络错误 | TEST-003 | Memory PASS / Local NOT_RUN |
| AC-004 | 单 key delete/ifRevision 并发语义正确 | TEST-004 | Memory PASS / Local NOT_RUN |
| AC-005 | 有界分页、续页和 namespace 隔离正确 | TEST-005 | Memory PASS / Local NOT_RUN |
| AC-006 | copy 保留数据与 metadata，目标条件不被绕过 | TEST-006 | Memory PASS / Local NOT_RUN |
| AC-007 | 未支持 move 明确无副作用失败；无虚假原子承诺 | TEST-007 | Memory PASS / Local NOT_RUN |
| AC-008 | 只报告可兑现能力、Range 和条件语义不降级 | TEST-008 | Memory PASS / Local NOT_RUN |
| AC-009 | Memory/Local 不生成假签名；multipart 不启用 | TEST-009 | Memory PASS / Local NOT_RUN |
| AC-010 | metadata 校验/替换与 revision/etag/checksum 各自语义正确 | TEST-010 | Memory PASS / Local NOT_RUN |
| AC-011 | 取消、预算、重试、unknown outcome、日志和 Observer 行为正确 | TEST-011 | Memory PASS / Local NOT_RUN |
| AC-012 | 无 config/audit 包也可运行；无技术栈泄漏进核心契约 | TEST-012 | Memory PASS / Local NOT_RUN |
| AC-013 | Local root/锁/原子记录/故障恢复在声明环境通过安全测试 | TEST-013 + independent review | Local NOT_RUN / 独立审查 PENDING |
| AC-014 | 私有包、锁文件和类型检查、支持声明、边界验证一致 | TEST-014 | Memory PASS / Local NOT_RUN |

## Release and Security Rules

不因存在 unsigned commit 就形成 Module Release；release 需要 Test/Security/Acceptance、已知限制、兼容性与回滚证据，以及明确发布授权。M1 结束也不自动 npm publish、Tag、GitHub Release 或部署。

Local 的 acceptor/reviewer 不得只是实现者；cloud/signing/recovery 的后续高风险任务需要独立证据。无批准的残余 high/critical 风险不能通过验收。

## Decision

- Core/Memory 子范围：13 个适用验收项有 PASS 测试证据，见[实施报告](STORAGE_M1_B_IMPLEMENTATION_REPORT.md)，为作者自检。
- 全模块 Runtime acceptance: **PENDING**；Local/OSS 未完成。
- Release: **NOT AUTHORIZED**。
- Accepted deviations: None；延后能力是明示 scope，不是 Gate override。
- Remaining owner: `xyq-dev` 决定何时启动下一任务；执行者依 TASKS 分工留下证据。
