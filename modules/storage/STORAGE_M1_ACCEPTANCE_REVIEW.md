# Storage M1 分范围 Gate 决定

## 审查身份与对象

- **Source repository:** `xyq-dev/agent-project-framework`
- **Immutable source commit:** `609b32724d70f3e1ce5225a2cb415b0e7918edd4`
- **Reviewer:** Codex agent `/root/storage_gate_review`
- **Roles:** independent `reviewer` / `security-reviewer` / `acceptor`
- **Execution binding:** GPT-5.6 Sol / xhigh
- **Decision date:** 2026-09-10 UTC
- **Independence:** 本 reviewer 未参与该提交的实现，没有修改文件、远端、Gate 规则或测试，也未接触云资源或凭据。
- **Test provenance:** 本决定复用 2026-09-09 已保存的独立执行记录；本 reviewer 于 2026-09-10 未重新运行命令，不声称当日复测。

本决定严格绑定上述 source commit。后续任何 `src/`、测试、依赖锁、能力声明或运行环境边界变更均需重新评估受影响 Gate。

## 正式决定

| 范围 | Implementation | Test | Security | Acceptance | Release |
| --- | --- | --- | --- | --- | --- |
| 原始 ST-007：Core/Memory + Local M1 | **PASS** | **PASS** | **PASS** | **PASS** | **PENDING / NOT AUTHORIZED** |
| OSS conservative profile：源码与离线 SDK/loopback 范围 | **PASS** | **PASS — OFFLINE ONLY** | **PASS — SOURCE/OFFLINE ONLY** | **PENDING** | **PENDING / NOT AUTHORIZED** |
| 当前完整 Storage module（包含真实 OSS 行为声明） | **PASS** | **PENDING** | **PENDING** | **PENDING** | **PENDING / NOT AUTHORIZED** |

因此：

1. **ST-007 原始 Memory+Local M1 范围正式通过 Implementation、Test、Security 和 Acceptance Gate。**
2. OSS 初始保守 profile 的实现及离线安全证据通过分范围审查，但这不构成真实 OSS Test/Security/Acceptance Gate。
3. 当前 `storage@0.1.0-dev` 包含 OSS adapter，整个 module 继续保持 **`TESTING`**，不得标记为 `ACCEPTED` 或 `RELEASED`。
4. 本决定不授权 Tag、GitHub Release、npm publish、部署或生产使用。
5. **无 Gate override。** signing、multipart、move 及 OSS 条件写删的延后或禁用属于已批准范围，不是偏差或风险豁免。

## ST-007 Memory+Local 验收依据

[ACCEPTANCE.md](ACCEPTANCE.md) 的 AC-001～AC-014 与 [validation/cases.yaml](validation/cases.yaml) 的结果足以支持原始 ST-007 范围：

| Acceptance criteria | Memory | Local | 决定 |
| --- | --- | --- | --- |
| AC-001～AC-012 | PASS | PASS | **PASS** |
| AC-013 Local root、锁、原子记录和恢复 | N/A | PASS | **PASS** |
| AC-014 私有包、依赖锁、类型及支持声明 | PASS | PASS | **PASS** |

该范围共对应 Core/Memory 44 项和 Local 34 项记录。AC-009 的签名与 multipart 要求是明确拒绝和零副作用；`TASKS.md` 已将签名正例、真实云和 multipart 协议列为 deferred，因此其缺失不阻塞原始 Memory+Local ST-007。

定向源码复核确认：

- Memory cursor 使用 fatal UTF-8、canonical base64url 与 canonical JSON round-trip，M-001 的非法 UTF-8、重复字段和非规范 JSON 输入已封闭。
- 输入取消会等待 raw `next()` 和协作 `return()` 实际 settle；Local lease、staging 和 writer lock 不会因公共调用提前拒绝而提前释放。
- `CloseGuard` 将 FD close failure 设为实例级失败状态；Local 在 rename/unlink dispatch 前再次检查，已进入但尚未 dispatch 的并发 mutation 会停止。
- Local close timeout 保留 writer lock；后台资源 settle 不会自动解锁，只有显式 close retry 可以在 lease 清零及 lock inode/token 复核后解锁。
- TEST-013 覆盖专属 root、manifest/lock identity、symlink/hardlink/FIFO、严格 envelope、晚到 I/O、close failure、并发发布、SIGKILL 恢复和清理所有权。

**在声明的 Memory+Local 环境与威胁模型内，没有未解决或未接受的 high/critical finding。**

## OSS 离线决定与真实云边界

OSS conservative profile 只公开基础八项能力以及 `copy`、`range-read`、`conditional-read`。`conditional-write`、`conditional-delete`、`move`、signed upload/download 和 multipart 保持 `false`，相应阴性测试证明在 body、凭据和网络前拒绝。

源码、固定版本 `ali-oss@6.23.0`、窄 transport 和离线测试支持以下分范围结论：

- OSS **Implementation PASS**。
- 34 项 OSS SDK/loopback 测试构成 **offline Test PASS**。
- 固定 origin/path/query、完整 staging、debug fail-closed、版本 ID 校验、错误映射、socket cancellation、O-010 exact-version cleanup 调度等构成 **source/offline Security PASS**。
- reviewed OSS offline source 范围内未发现未解决 high/critical finding。

以上 PASS 不证明真实 OSS、生产 TLS、IAM 或服务端失败语义。真实 OSS 仍为 `NOT_RUN`，因此完整 OSS 及整个 module 的 Test、Security 和 Acceptance Gate 必须保持 PENDING。

解除真实 OSS 阻塞至少需要：

- 明确授权且已启用 Versioning 的测试 bucket、region、唯一 namespace/prefix；
- 由宿主安全注入的最小权限凭据，不从聊天、环境探测或仓库读取 Secrets；
- 在无测试 shim 的真实 Node 24/Linux 进程验证 SDK 初始化、TLS hostname/certificate 与实际 OSS endpoint；
- 验证 IAM allow/deny、认证失败、凭据过期与权限错误不会被映射为不存在；
- 验证真实 version ID、相同内容多版本、current HEAD/GET、Range、list enrichment、metadata 与 provider 错误差异；
- 验证 delete marker、历史版本及本次创建 exact versions 的清理；
- 验证响应丢失、超时和 unknown PUT outcome 的宿主 reconciliation；
- 记录所有创建版本并在 verify 或 close 失败后仍执行精确清理，不进行全桶扫描或 bucket 配置修改。

即使现有 cloud smoke 的九项正向检查将来通过，也不能代替上述 TLS/IAM、delete-marker、失败恢复和 unknown reconciliation 证据。

## 测试与来源绑定

本决定依赖 [validation/runtime-results.json](validation/runtime-results.json) 和 [INDEPENDENT_REVIEW_TRANSCRIPT.md](INDEPENDENT_REVIEW_TRANSCRIPT.md) 保存的 2026-09-09 记录：

- `npm test`: 112/112 pass，0 fail/skip/cancel；
- `npm run typecheck`: exit 0；
- `npm run test:contract`: 42/42；
- `npm run test:failure`: 43/43；
- `npm run test:security`: 27/27；
- 测试环境：Linux x64、Node 24.19.0、TypeScript 5.9.3；
- source manifest SHA-256: `030e5c628f0de12c208cc01d71a144f5eac49905822c555a126d28dc0249b350`；
- test manifest SHA-256: `8b137ef7cffb5f6a10ebbc02900b519ebcb748628d7af0e074cf9a74637731f4`。

独立 reviewer 的最终消息确认 M-001、L-008、O-010、FD close failure、并发晚到发布和网络取消整改，并确认 reviewed Local/OSS offline source 范围没有未解决 high/critical。证据保管者随后重算 source/test manifest 并与最终源码匹配。本 reviewer 又在 immutable commit 上定向读取相关源码、回归测试和 Gate 材料。

关键证据的 Git blob SHA：

| Evidence | Git blob SHA |
| --- | --- |
| [INDEPENDENT_REVIEW_TRANSCRIPT.md](INDEPENDENT_REVIEW_TRANSCRIPT.md) | `1b71b2dcfb14a536d5b9179613d25acb08c8a27a` |
| [INDEPENDENT_SECURITY_REVIEW.md](INDEPENDENT_SECURITY_REVIEW.md) | `c3bc4b62293366bdeb3a28c6826997fa28fb7642` |
| [STORAGE_M1_B_IMPLEMENTATION_REPORT.md](STORAGE_M1_B_IMPLEMENTATION_REPORT.md) | `7cc4daebaac251c04dbd1f3c1dc2fe000b644a6f` |
| [ACCEPTANCE.md](ACCEPTANCE.md) | `21bbbf96749a07947970e11f9e989896b63b8c26` |
| [validation/runtime-results.json](validation/runtime-results.json) | `264156ecbb5e238a2a168e4fd5f5e383de928b0b` |
| [validation/cases.yaml](validation/cases.yaml) | `9e695a4cf6bbc25a9753a966b5e5bdad8bd1353c` |

`runtime-results.json` 中原有 `formal_security_gate: PENDING` 是本决定签发前的历史状态。本文件仅在上述明确范围内取代该历史待决状态，不改变真实 OSS 与 Release 的 PENDING 结论。

## 残余风险、Owner 与解除条件

| 残余风险或限制 | 适用范围 | Owner | 解除或接受条件 |
| --- | --- | --- | --- |
| Local 只验证 Node 24/Linux、普通本地文件系统、有效用户独占的可信 `0700` root；不承诺 NFS、共享盘、敌对同机 writer、管理员攻击或断电耐久性 | Local | `xyq-dev` 维护支持声明；部署宿主负责环境符合性 | 仅在声明 profile 使用；扩大支持前另做设计和对应平台/恢复测试 |
| 永久不合作的 ByteSource 可能令 lease 和 writer lock 一直保留 | Local/OSS staging | 宿主运行维护者 | producer 实际 settle；否则终止旧进程、确认无 writer 存活后按恢复程序处理，禁止 runtime 自动偷锁 |
| writer lock unlink 后最终目录 sync/close 失败无法恢复已移除的锁 | Local shutdown | 宿主运行维护者；`xyq-dev` 维护恢复说明 | 检查磁盘和 root 完整性后重新构造实例；若需要更强保证，提交新的恢复设计和故障证据 |
| 真实 OSS TLS、IAM、版本/delete-marker、服务端错误及 unknown reconciliation 未验证 | OSS / 整个 module | `xyq-dev` 与获授权的云测试环境 owner | 完成上述真实云矩阵，保存清理和失败列表，由独立 reviewer 复核 |
| 当前依赖 audit 结果来自未变化 lockfile 的既有执行，不代表未来漏洞数据库状态 | Release | `xyq-dev` / release approver | 发布候选上重新执行依赖审计并记录结果 |
| 没有可追踪的发布制品、完整 module Acceptance 或发布授权 | Release | `xyq-dev` / human release approver | 全 module Test/Security/Acceptance PASS，准备 release notes、兼容性、恢复证据和可追踪制品，并取得明确发布授权 |

## High/Critical 与 Override 声明

- **Memory+Local 已接受范围：无未解决 high/critical finding。**
- **OSS source/offline 已审范围：无已知未解决 high/critical finding。**
- **整个含 OSS module：不能作“生产 high/critical 风险已清零”声明。** 真实云高风险控制缺乏运行证据，故 Test/Security/Acceptance/Release 保持 PENDING。
- 未接受任何 high/critical vulnerability。
- 未使用 Gate override、风险降级或离线证据替代真实云证据。
