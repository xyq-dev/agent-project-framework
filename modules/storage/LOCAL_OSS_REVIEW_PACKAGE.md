# Local / OSS 独立审查包

日期：2026-09-08。状态：REVIEW_READY，**未审查通过、未实现**。作者：当前 Codex，非独立 reviewer。
输入：[现有架构](ARCHITECTURE.md)、[API](API.md)、[安全约束](SECURITY.md)、[已验证 Core/Memory](STORAGE_M1_B_IMPLEMENTATION_REPORT.md)。

用户本次已恢复并扩展 Storage 开发范围。授权不等于 ST-005 独立设计审查通过。本包将实现选择、剩余矛盾与可观察验收列清，供独立 reviewer 作决定；不修改原 Gate 或自动启动多 Agent。

## Local：沿用已定方案

路径限定 `implementations/typescript/src/adapters/local/` 及对应测试。初版仅 Node 24、Linux、普通本地文件系统、宿主专属受控 root；不承诺 Windows/NFS、共享 root、敌对同机写入者或管理员隔离。

| 控制 | 实现决定 | 审查与测试要求 |
| --- | --- | --- |
| 物理寻址 | 严格验证逻辑 key；SHA-256(key) 映射 `objects/<digest>.obj`。key 不直接用于路径。root 初始化时固定。 | TEST-001；碰撞位置 envelope key 不符视为 integrity-error；根路径变化不跟随。 |
| root / 子目录 | 检查 root、objects、tmp 的 lstat、realpath、所有权及非公开写权限；拒绝 symlink、特殊文件和受污染布局。 | TEST-013：预植链接/非目录/权限不符；不自动 chmod 或修复既有用户目录。 |
| 单 writer | 专属 root 中以 wx / O_NOFOLLOW 创建锁并检查 fstat；文件标识绑定当前实例。锁内元信息只用于人工诊断。 | 第二实例/进程失败；创建锁超时后如迟到成功必须回收自己创建的锁，不删除外来锁。 |
| 对象记录 | `APFST01\n` 8 字节 magic，uint32BE header length，最多 65536 字节 JSON header（formatVersion=1 + ObjectInfo），其后是完整原始 body。 | 拒绝未知版本、超长 header、无效元信息、key/digest 错配、字节长度/尾部不符。读取不得按未校验长度分配无限内存。 |
| staging | 输入先流式写本次独占随机临时文件；校验长度/大小，再流式组成单 envelope；刷新并关闭。 | source fail、超限、取消、磁盘满时旧对象完整；仅清理本次拥有文件，不扫描删除其他文件。 |
| 原子发布 | 同 key mutex 中检查当前 revision/absence，再以同一文件系统原子 rename 发布 envelope；无 HEAD 后无锁写入。 | 并发 create/CAS/copy 恰一成功；rename 前取消 not-applied，发布后响应丢失 unknown；不可重试变更。 |
| 读快照 | O_NOFOLLOW 打开并 fstat 普通文件；从同一 FD 读 header/body，range 只作用 body；覆盖/删除后已打开 FD 保留旧 snapshot。 | 全部共享测试；提前 break/return/无消费超时、迟到 open 的 FD 都关闭。 |
| delete / list | 条件删除在同 key 锁内；单 key unlink。只扫描受控 objects，最多 10000 条；解析记录再按逻辑 key/prefix 排序分页。 | 缺失、旧 revision、cursor scope、损坏记录 fail-closed；tmp 不可见；不接受 cursor 中的物理路径。 |
| 进程异常恢复 | 残留 writer lock 禁止自动抢占；操作者先确认无存活 writer，再执行书面恢复程序。旧 tmp 不可见，不自动清除。 | 子进程在临时写入、rename 前、rename 后分别 SIGKILL；在**新建测试 root**中人工模拟恢复步骤，验证旧/新完整对象。 |
| 持久性声明 | 普通进程崩溃、关闭与重启另测；必要 file/directory fsync 顺序由 reviewer 核定。 | 不把 SIGKILL 当成断电测试，不无证据承诺断电 durability。 |

Reviewer 必须给 SEC-001/002/003/005/007 与 TEST-013 逐项结论。PASS 仅解锁实现；实现后的独立 Security Gate 仍需要实际代码和测试证据。

## OSS：官方参考与已确认差异

采用官方 [ali-sdk/ali-oss](https://github.com/ali-sdk/ali-oss/tree/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b)，本次读取的固定 commit 为 `fa263d22ca4c6599cb987c3db6325c86c7a5dc6b`，其 package version 为 `6.23.0`（MIT）。尚未安装、调用或声明支持此 SDK。

| 参考 | 实现含义 |
| --- | --- |
| [官方 SDK README，固定 commit](https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/README.md) | 对照 putStream/getStream、返回 headers、取消以及版本化接口；不得把 SDK 返回对象直接暴露给消费者。 |
| [SDK V4 签名实现](https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/object/signatureUrlV4.js) | 使用官方签名方法；method、对象、region、headers、过期和 STS token 必须绑定，不自研 signer。 |
| [SDK 重试实现](https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/retry.ts) | 明确设 retryMax=0；APF 只在未出 body 的读失败上限内重试，不自动重放 mutation。 |
| [OSS PutObject 官方 API](https://www.alibabacloud.com/help/en/oss/developer-reference/putobject) | 版本控制开启时每次写入有唯一 version ID；关闭/暂停不能据此保证 revision。版本控制开启或暂停时 forbid-overwrite 无效。声明 Content-Length 过小时服务端可能发布截断对象。 |
| [OSS STS 官方说明](https://www.alibabacloud.com/help/en/oss/developer-reference/use-temporary-access-credentials-provided-by-sts-to-access-oss) | 临时凭据由宿主注入且有权限与到期约束；不得在模块内探测账号、创建角色或扩权。 |
| [Node 24 fs 官方接口](https://nodejs.org/docs/latest-v24.x/api/fs.html) | Local 的文件打开、句柄关闭、rename、sync 需在实际 Node 24.19/Linux 上验证；文档不是隔离/断电证明。 |

以上为原始资料及其工程推论，没有复制 SDK 实现。新依赖选定后需核对确切发布版本与 lock integrity，不能把当前 master 当未来固定版本。

### 必须先决定的契约冲突

当前 `conditional-write` 同时表示 absence 和 revision CAS；OSS forbid-overwrite 不能实现完整 CAS，且与上述版本控制配置冲突。ETag 不保证每次完整写入都变化；HEAD+PUT 也没有原子条件保证。不能把这两条组合成“已经满足 APF”。

建议首版候选采用 **版本控制已经启用的 bucket + 保守能力声明**：

- 初始化仅查询/验证宿主给定的固定 bucket/region/namespace，不改变版本控制。写入/读取缺失有效 version ID 时 fail-closed。
- revision 来自服务端 version ID；get/head 的条件读先检查本次当前对象响应的版本，再暴露同一响应的内容。不要用历史 version GET 冒充“当前 revision 匹配”。
- conditional-write / conditional-delete 暂不声明；默认 put/copy 以及带目标条件的请求必须在消费源/发请求前 unsupported。只允许调用者明确 `overwrite: true` 的无条件写入/复制。
- 这会限制默认创建和 CAS，必须由 reviewer 接受并在 profile 文档中突出说明。若要求 OSS 也提供默认安全创建/CAS，应另审粒度更细的能力协议或具备线性化保证的协调层；不能静默削弱 Core 契约。
- signed-upload-url 初版关闭：当前上传契约包含的默认防覆盖不能在该 profile 中保证。signed-download-url 可在独立 signer 端口与安全测试完成后单独开启。multipart/move 仍关闭。

这个候选没有被当作已批准的最终 OSS 契约；若 reviewer 认为不能满足本次需求，应给出可执行替代方案和需要的契约修改后再实现。

### OSS 实现任务（均未执行）

| ID | 交付内容 | 明确验收 |
| --- | --- | --- |
| OSS-001 | 确认上述 capability/revision profile；定义 host credential provider 与精确端口 | 有独立审查结论；无 ETag-as-revision、HEAD+PUT 或假 conditional 支持 |
| OSS-002 | 官方 SDK transport、固定 HTTPS endpoint/region/bucket/namespace、SDK retryMax=0、错误白名单 | fake transport 验证参数绑定、状态码区分、凭据/URL 脱敏、取消和请求次数 |
| OSS-003 | 写前完整校验的受控 staging 与 put/get/head/delete/list/copy | 不把用户 contentLength 直接交给网络流；源中途失败/过长不能发布部分对象；响应丢失 unknown |
| OSS-004 | 经批准的签名下载端口、STS 更新与过期限制 | method/key/headers 固定，TTL 不超过请求值、900 秒和临时凭据剩余有效期（含时钟裕量）；不承诺链接撤销或单次使用 |
| OSS-005 | 离线契约/故障、安全测试及真实云验证入口 | 离线与真实云结果分开；无凭据时云验证明确 NOT_RUN，不能让空测试算 PASS |

staging 首选复用已审 Local 的受控临时文件机制，但不能直接复用对象目录或 writer lock；专属 spool root、总容量和并发额度分别约束。完整源通过长度/上限校验后才开始目标对象网络变更。若选择全内存 staging，必须另审总预算和最大对象限制，不把它称为无限流式上传。

SDK list 返回值若缺完整 metadata/revision，需有界补充 head（并发最多 4）且共享一个 deadline；对象在间隙删除可跳过，但必须保留续页 cursor，不能把空页解释成结束。不得在 list 补请求时返回用户 namespace 外对象。

真实云测试只可在明确指定的测试 bucket/唯一测试前缀下操作，清理仅限该次创建的对象/版本；不顺便创建 bucket、改 ACL/CORS/生命周期/版本控制或执行批量删除。当前没有这样的环境输入，未尝试读取现有 Secrets。

## 独立审查的记录格式

审查人/Agent 身份、审查日期、输入 commit、控制 ID、发现级别、修改意见、可定位证据、各 profile 的 PASS/BLOCKED 决定。未接受 high/critical 发现必须阻止对应实现/验收。没有 reviewer 身份和证据不能填 PASS。

2026-09-09：用户明确授权一个独立安全审查 Agent，已由 `storage_security_review` 承担 Local ST-005 与 OSS-001；以下补充响应首轮审查，最终决定由 [独立审查记录](INDEPENDENT_SECURITY_REVIEW.md) 给出。仍不自动增加其他 Agent，不重新批准或覆盖 Core/Memory。

## 2026-09-09 Local 审查补充（实现必须遵守）

1. root 初次使用必须为空；独占 writer lock 后原子发布持久 `manifest.json`，严格记录 `{formatVersion: 1, kind: 'apf-local', namespace, bindingId}`。重开时验证精确 namespace 和稳定 bindingId；存在任何旧 objects/tmp/lock 布局但没有有效 manifest 一律拒绝，不猜测归属、不自动修复。cursor 同时绑定此持久标识和初始化实例标识。
2. root 和子目录归当前有效用户，禁止组/其他用户访问；新文件 0600、子目录 0700。已存在目录权限不符合则拒绝，不自动 chmod。
3. `close()` 必须先原子进入 closing，拒绝新操作，通知本实例在途操作取消并关闭已返回 snapshot；等待所有实际异步 I/O 和文件句柄结束后，检查 lock inode 与随机 token，才可 unlink 自己的锁。关闭超时必须保留锁并失败；不得在旧写入仍可能发布时允许新实例。
4. 不可取消的 rename/unlink 发起前 `markDispatched()`；成功确认后才 `markApplied()`。调用方超时并不表示 I/O 已结束，在 I/O settle 前仍保留同 key mutex、staging 预算及 writer lock。迟到的 open 必须关闭返回 FD；迟到的 rename 只能报告 unknown，不能补偿删除可能已发布的新对象。
5. 文件系统 primitive 需处理短读/短写；普通对象文件首次打开时拒绝 symlink、特殊文件和多硬链接。记录 header/key/revision/metadata/实际文件长度一致后才暴露内容。已打开 snapshot 可在 unlink 后继续读旧 FD。
6. 对象数和 staging 总字节/并发必须有界；失败清理仅操作本实例本次拥有的路径。正常 close 不删除 root、manifest、objects 或历史 tmp；崩溃遗留锁由宿主人工确认，不提供自动解锁入口。

## 2026-09-09 OSS 审查落实（首版固定 profile）

独立记录已给出 OSS-001 DESIGN PASS；以下落实 O-001～O-009，替代上文候选及“均未执行”表中的设计待定描述，实际实现/测试状态另记报告。

- 支持基础八项、copy、range-read、conditional-read；conditional-write/delete、move、两种 signing、multipart 均 false。默认 put/copy 在源、凭据、网络前拒绝；显式 overwrite 才可无条件写。OSS-004 签名下载为明确后续增量，本轮不开放。
- 初始化只验证固定 bucket 的 Versioning=Enabled；当前 GET/HEAD/PUT 必须返回非空非 null versionId。PUT 成功后只用其 versionId 做确认 HEAD；确认失败 unknown 不重试；无效版本令实例失效。公开条件读只读取当前对象并比较同一响应。
- 固定官方 HTTPS origin/region/bucket/namespace；物理前缀 apf-storage/v1/SHA256(namespace)/objects/（按 reviewer 补充固定长度，独立 namespace marker 保留精确绑定），格式/绑定/key digest 标记与用户 metadata 分离。用户 metadata 用独立有界 base64url JSON 字段编码。
- 专属 0700 spool 与 0600 排他文件；源完整暂存并测量长度后才取凭据和 PUT；容量/并发有界，真实 I/O 结束后才释放预算及清理自己文件。
- 固定 ali-oss 6.23.0 官方 V4 signer/XML parser，retryMax=0；注入严格 Node HTTPS transport，逐请求精确校验 method/origin/path/query，禁止 redirect/proxy，正常 TLS；实际销毁请求/响应/socket 并等待 close。非流成功响应上限 4 MiB，错误 64 KiB。
- 每次取凭据与签名/请求前检查 SDK 实际 debug namespace 是否启用；启用则拒绝，绝不修改宿主 DEBUG 或全局日志开关。
- HEAD404 必须以一次当前 GET 确认，仅显式 NoSuchKey 为不存在；GET 成功解析同一响应后立即关闭；bucket/auth/permission 错误继续失败。
- listV2 条目以最多 4 个并发当前 HEAD 补全，共享期限，保持顺序和 provider 续页；确认删除可跳过但保留非空 cursor，严格校验前缀/marker。
- 拒绝 symlink/gzip/异常编码；Range 必须 206 且 Content-Range/Length 与范围一致；实际字节计数，短流/超流失败，早退/取消关闭同一响应。

设计 PASS 仅允许实现。实际云验证缺少明确授权测试环境，保持 NOT_RUN；不改变 bucket 配置、角色或已有数据。

2026-09-09 实施历史：批准的初始 profiles 代码和 112 项测试已完成；OSS-004 signing 按最终设计延后。独立实施审查消息已完成，正式报告追加前 Agent 额度中断；该日 Gate 保持 PENDING。

2026-09-10 正式分范围决定已补齐，见 [STORAGE_M1_ACCEPTANCE_REVIEW.md](STORAGE_M1_ACCEPTANCE_REVIEW.md)：原始 ST-007 Memory/Local 验收 PASS；OSS 离线范围审查 PASS；真实云 NOT_RUN，全模块仍 TESTING。继续执行所需输入和证据见 [OSS_CLOUD_VALIDATION.md](OSS_CLOUD_VALIDATION.md)。上文 2026-09-08 候选/未实施状态保留历史语境，不作为当前状态。
