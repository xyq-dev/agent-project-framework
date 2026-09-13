# Independent implementation review — received message record

日期：2026-09-09 UTC。仓库 `xyq-dev/agent-project-framework`，PR #3；本轮父提交 `36677e8cee9025c9f77541876609bd780f23a006`。

记录者为协调实现者 Codex `/root`。以下引用来自用户授权的独立审查 Agent `/root/storage_security_review`（GPT-5.6 Sol / xhigh）的实际消息；不是作者自检，也不是作者代签的 Gate PASS。该 Agent 完成静态复核和独立测试后，在追加正式报告前触发使用额度限制；原 [独立设计/审查文件](INDEPENDENT_SECURITY_REVIEW.md) 保持原样。

## Received findings

### M-001 — Memory cursor integrity (Medium)

> 独立 finding M-001（Medium，Core/Memory cursor 输入完整性）：`src/adapters/memory.ts:130-140` 用 `Buffer.toString('utf8')`（替换非法 UTF-8）且不做 canonical JSON round-trip。可从合法 cursor 保留 binding/namespace/prefix，仅把 `after:"a"` 的 0x61 改成 0xff 后重新 base64url；`storage.list({cursor})` 被接受并返回空页，而 API 要求格式不合规为 invalid-cursor。已在当前 dist 独立复现 `ACCEPTED {items:[], nextCursor:null}`。影响是攻击者可用 malformed cursor 改变分页/导致遗漏，不越 namespace/path；无 high/critical。建议像 Local/OSS 一样 fatal UTF-8 decode，并要求 `JSON.stringify(parsed) === decoded`，补 invalid UTF-8/重复键/非 canonical whitespace 用例。请由你修改实现/测试，我随后复核。

### L-008 — Accepted input lifetime (High)

> 独立 finding L-008（High，已批准 I-001/L-002 生命周期不满足）：`src/adapters/files.ts:133-151` 的 `Spool.stage()` 对 `ctx.wait(iterator.next())` 取消后，仅 fire-and-forget `iterator.return()`；随后 cleanup/leave。因而 raw `next()` 尚未 settle 时 `LocalAdapter.close()` 可成功并删 writer lock。现有 `local-security.test.ts:110-125` 的 `blocked()` 正是永久 pending next，且断言 close 成功，和审查文档 I-001“blocked input next 的 raw operation settle 前保留 lease/lock，close timeout 留锁”相反。触发：ByteSource 先产一块后 next 永久/延迟，调用 adapter.close；旧 producer 仍活跃但第二 writer 可获得 root。未见旧 producer 可晚到 publish（所以主要风险是 shutdown/resource ownership 与已批准 fail-closed 契约），但这是 high control 的直接违背，不能作为最终 Local implementation PASS。建议追踪每次 in-flight `next()` 的 settle promise（return 可同时请求协作取消），lease/cleanup 至 actual next+return settle；close timeout 保留锁，随后 settle 后显式 close retry。需补延迟可释放和永久 pending 两用例。

### O-010 — Smoke cleanup after close failure (Medium)

> 独立 finding O-010（Medium，真实云 smoke 清理控制，当前 NOT_RUN）：`test/oss-cloud-smoke.ts:36-39` 的 finally 先 `await adapter.close()` 再调用 exact-version cleanup；若 close 因 socket/FD/生命周期故障拒绝，cleanup callback 完全不会执行，已创建的测试版本会残留。范围仅唯一 verification prefix，不会碰既有对象，但违背“cleanup limited to exact created versions”入口的尽力回收目标。建议 nested finally 保证 close 是否失败都尝试 `cleanupExactVersions(created)`，并在两者均失败时保留/组合错误；未知 PUT outcome 仍按报告由 host reconcile，不可伪造 revision。

### FD close failure and concurrent dispatch

协调实现者先用真实 FileHandle 的故障注入复现 close 失败仍可解锁，添加 CloseGuard 后又核查并发发布窗口。独立 reviewer 对该窗口回复如下：

> 是，确认这是同一 High close 故障的并发窗口，应补。`Lifecycle.seal()` 只拒绝后续 enter，不取消/阻止已 enter 的 B；若 A 的 close 拒绝，B 可在已通过早期 guard 后继续到 rename/DELETE/PUT。建议：Local `#guard()` 首项检查 `#closer.failed`；并在每个 `markDispatched()` 紧邻前同步再检查（put second guard 返回后、delete old.close 返回后），这样故障发生在 dispatch 前即阻止，发生在 dispatch 后只能 unknown/retain lock。OSS `#guard()` 同样检查 closer.failed；#credentials 前后及 #call invoke 前已有 guard，覆盖 staging/credential 等 await 窗口，narrowTransport debugGuard 又覆盖 dispatch 边界。补一条两操作回归：A close EIO seal，已 enter/被 gate 挡住的 B 释放后必须零 rename/request、not-applied，close 留锁/报 provider。请补后我定向复核；当前不写最终哈希结论。

## Received final verification message

以下为全部修复与最终测试之后收到的原文。末句所说的“追加独立审查文件”未执行完成，随后工具返回 Agent usage limit；不得把这一预告当作已签发的正式 Gate 决定。

> 最终源码静态复核与独立复测完成：我独立运行 `npm test` 得 112/112、0 fail/skip/cancel（包含 build），`npm run typecheck` exit0；未跑真实云。M-001、L-008、O-010、FD close/并发晚到发布窗口均确认修复。最终 src manifest SHA256=030e5c628f0de12c208cc01d71a144f5eac49905822c555a126d28dc0249b350（13个 src 文件逐项 sha256 清单的 SHA256）；test manifest=8b137ef7cffb5f6a10ebbc02900b519ebcb748628d7af0e074cf9a74637731f4。当前未发现 reviewed Local/OSS offline source 范围内未解决 high/critical。真实 OSS TLS/IAM/服务端版本与 delete marker/错误差异/unknown reconciliation 保持 NOT_RUN/PENDING；我现在追加独立审查文件，整体 Acceptance/Release 不通过。

## Source binding and current decision boundary

协调实现者已独立重算并核对两份 manifest 摘要，与上述消息完全一致。清单按仓库相对路径排序，每行格式为 `文件SHA256`、两个空格、`仓库相对路径`、换行；对清单 UTF-8 字节再计算 SHA256。src 为 13 个文件，test 为 15 个文件。逐文件摘要及其余 3 个包/编译配置文件见 [runtime-results.json](validation/runtime-results.json)。

本地/离线代码复核及独立复测已完成，已报告问题的修复获得独立确认。未获得正式全模块 Security/Acceptance/Release Gate PASS；真实 OSS 仍未测试。本记录保全已取得的独立证据，后续只需核对提交/摘要、补充缺失的真实云证据和正式 Gate 决策，不重新进行已批准的架构分析。
