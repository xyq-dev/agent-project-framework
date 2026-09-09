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

当前待决：Local ST-005 和 OSS-001 的独立 reviewer。仓库明确禁止自动多 Agent，本次没有自行启动；需要用户指定独立审查者或允许一个独立审查 Agent。其他代码和测试已经形成可审交付，不要求用户重新批准 Core/Memory 工作。

