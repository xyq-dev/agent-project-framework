# Storage API Contract — 0.1.0-dev

本文件是规范性库接口，不是 HTTP API。所有实现必须提供等价语义，禁止暴露 Provider SDK 类型。以下数值为 APF 参考策略。

## Types and Validation

- `Key`：大小写敏感 NFC Unicode 字符串，UTF-8 1..512 bytes；`/` 仅分段。禁止开头/末尾 `/`、空段、`.`/`..` 段、反斜线、`%`、冒号、控制字符（U+0000..001F、007F..009F）、不成对 surrogate。非 NFC 拒绝而非静默规范化。不得 URL-decode 后拼路径。
- `Prefix`：可为空，否则同 Key 规则但允许一个末尾 `/`；字面 startsWith（`im` 可匹配 `image`，`img/` 才限定该段）。不支持 glob。
- `ByteSource`：异步有序 byte chunks，可取消/关闭；长度未知允许，超过限制立即终止，空对象允许。TypeScript Profile 映射 `AsyncIterable<Uint8Array>`，不是字符串内容。
- `Revision`：非空 opaque token；不同完整写入产生不同 revision，即使 bytes 相同。只在同一 binding/key 内比较，不能当时间、etag、checksum 或授权证明。
- `UserMetadata`：string→string，key 为 `[a-z][a-z0-9-]{0,62}`，最多 32 项；value 仅 printable ASCII（空串可），总 UTF-8 key+value bytes <= 2048。不接受隐式转换。二进制/Unicode 业务 metadata 在高层编码。
- `ObjectInfo`：`key, sizeBytes, contentType, metadata, revision, modifiedAt`；`modifiedAt` UTC ISO-8601，非单调时钟。可选 `etag` 是 opaque，`checksum` 若返回须 `{algorithm, value, encoding}` 并实际验证，绝不猜成 MD5。
- `contentType`：1..255 printable ASCII，拒绝 CR/LF；默认 `application/octet-stream`，不是内容安全验证。
- `OperationOptions`：可选 `timeoutMs`（正整数）、`signal`（取消）；默认 30000 ms，上限 120000 ms。取消不证明 Provider 未生效。
- `WriteCondition`：`{kind: if-absent}` 或 `{kind: if-revision, revision}`，互斥；只在 `conditional-write` 支持时使用。

输入 shape 中未知业务选项应拒绝，不能忽略用户请求的安全约束；SDK 原始 options 不进入公共 Contract。

## Construction and Capabilities

`createStorage(binding, limits, observer?) -> Storage` 为宿主工厂语义：

| Field | Contract |
| --- | --- |
| binding | 受信任初始化阶段提供 Adapter 与固定 namespace，不能从每次调用的任意 URL 构造。 |
| maxObjectBytes | 默认 16777216；正整数且不超过 Adapter 上限，冲突初始化失败，不能静默截断。 |
| listPageSize / maxListPageSize | 默认 100 / 1000，实际请求不得超过有效上限。 |
| timeoutMs | 默认 30000；包括内部重试，get 还包括返回后的流消费。 |
| observer | 可选非业务审计回调，默认 no-op；不能改变成功/失败结果。 |

`capabilities() -> {supported: CapabilityId[], limits, consistency, durability}`：每次返回防修改快照；`supported` 为 `module.yaml` ID 子集，base 为 put/get/head/exists/delete/list/metadata/capability-negotiation。额外能力只有 Adapter 验收后才公布。

Reference 目标：consistency=`single-object-linearizable`；Memory durability=`volatile`；Local=`process-crash-tested`（待测试才可声明）。云 Profile 不能沿用 Reference 标签；需要单独证明 revision、条件语义和能力矩阵。

## Operations

### put

`put(key, body, {overwrite=false, condition?, contentLength?, contentType?, metadata?, ...OperationOptions}) -> ObjectInfo`

- `overwrite=false` 是安全默认，需真实原子的 absence condition；不具备 conditional-write 时拒绝，**不能**先 exists 再 put。
- `overwrite=true` 才允许替换；`condition=if-absent` 不可与 true 并用；`if-revision` 必须与 true 并用。
- contentLength 若提供为非负整数，流实际字节数必须一致且不超 maxObjectBytes；不一致是 `invalid-input`，超限是 `limit-exceeded`。
- metadata 默认为空，替换时替换整个 metadata map，不与旧 map 合并。
- 校验与能力检查早于读取 body；直到输入完整验证后才发布新对象。发布前失败、取消或输入流抛错时保留原对象；发布后的未知结果遵循下一条。
- 只有确认目标对象已发布才返回成功。响应丢失或发布后取消返回 `outcome=unknown`；不能自行重试写入。

### get

`get(key, {ifRevision?, range?, ...OperationOptions}) -> {info: ObjectInfo, body: ByteSource, returnedBytes}`

- info/body 必须同一 revision；从获取成功到流读完仍可能失败，错误附着在迭代过程。消费者必须读到正常 EOF 才算完整成功。
- range 是单个 `{start, endInclusive?}`，整数 `0<=start<=endInclusive`。end 超对象末尾截到 EOF，start>=size（含空对象）报 `range-not-satisfiable`；不支持 suffix/multi-range。
- info.sizeBytes 仍为完整对象长度；returnedBytes 为选中范围长度；不忽略 range 返回全文件。
- ifRevision 不匹配或指定版本已不存在均 `precondition-failed`，避免将并发写入误当普通缺失。无 ifRevision 的可靠缺失为 `not-found`。
- 提前停止消费或 signal 取消必须关闭源、计时器/文件句柄。不得在流已输出 bytes 后自动重启拼接。

### head

`head(key, {ifRevision?, ...OperationOptions}) -> ObjectInfo`

不消费 body，条件/错误同 get。不得泄露 root、bucket credential 或内部存储路径。

### exists

`exists(key, OperationOptions) -> boolean`

基于 head，仅明确 `not-found` 返回 false；权限、认证、超时、损坏、限流等原样映射并抛出。禁止 catch-all false。`exists` 不是写前无竞争保证。

### delete

`delete(key, {ifRevision?, ...OperationOptions}) -> {absent: true}`

仅单 key、非递归。无条件删除已缺失对象成功；条件删除在缺失或 revision 不同时报 `precondition-failed`。成功表示线性化点上对象不存在，不承诺之后不会被重新创建，也不等价于所有历史版本被擦除。

### list

`list({prefix="", cursor?, pageSize=100, ...OperationOptions}) -> {items: ObjectInfo[], nextCursor: string|null}`

- 同 binding 内无跨 namespace 结果；每页 <=pageSize，返回后 nextCursor=null 才结束，允许非 null 的空页。
- cursor 是不可信 opaque string，最长 8192 UTF-8 bytes，绑定 adapter+namespace+prefix，不能包含或授权任意路径。格式/作用域不匹配或过期：`invalid-cursor`。
- 同一 cursor 续页时 pageSize 可改变，prefix/binding 不可；无并发变更时完整遍历无丢失/重复。
- 不承诺跨 Provider 顺序和 list 快照。Reference 可按 UTF-8 bytes 字典序；并发添加/覆盖/删除时可能重复/遗漏，调用方按 key/revision 去重。
- Reference 大目录不能无限扫描：>10000 个对象返回 `limit-exceeded`，后续扩容须另设索引设计，不能一次装入全 payload。

### copy

`copy(sourceKey, destinationKey, {sourceRevision?, overwrite=false, destinationCondition?, ...OperationOptions}) -> ObjectInfo`

仅同一 binding，源=目标拒绝。复用 get snapshot + put 条件语义（流式、有界），保留 contentType 与用户 metadata，生成新 revision/modifiedAt；sourceRevision 需 conditional-read，目标 condition 对应 put。源读取失败不得发布目标；不承诺它与源后续写入是同一事务，不自动跨 Provider 复制。

### move (extension; M1 disabled)

`move(sourceKey, destinationKey, {sourceRevision, ...copy options}) -> {destination: ObjectInfo, sourceRemoved: true}`

SourceRevision 必填；同 binding，源=目标拒绝。必须同时具备 copy、conditional-read、conditional-write、conditional-delete 并确保 revision 不复用。先按 sourceRevision 复制，确认目标完整发布，再仅删除相同 revision 的源。缺少前提返回 unsupported-capability，不能模拟无保护 copy+delete。

复制后源发生变化或删除失败：保留目标与剩余源，返回 `partial-failure`；删除响应丢失：partial 详情 `source=unknown`。部分完成和未知结果都不能自动重复整次 move；上层记录操作结果并核对双方 revision。禁止“补偿”删除可能已被别人修改的目标。

### signedUploadUrl / signedDownloadUrl (extensions; M1 disabled)

`signedUploadUrl(key, {ttlSeconds=300, overwrite=false, contentType?, metadata?, ...OperationOptions}) -> SignedGrant`

`signedDownloadUrl(key, {ttlSeconds=300, ...OperationOptions}) -> SignedGrant`

SignedGrant = `{url, method: PUT|GET, requiredHeaders, expiresAt}`，仅 https，TTL 整数 1..900（APF 策略）；不得通过修改 Bucket ACL、公网文件 URL 或应用伪签名绕开 unsupported-capability。上传默认不能覆盖，Adapter 无法在真实请求中强制这个条件则必须拒绝。

expiresAt 不晚于已知 credential expiration/provider 限制，余量不足拒绝签发；不是到期前永远有效的保证。Signed URL 是 bearer 授权，不保证一次性、不证明上传完成；大小/内容安全必须在授权层或后续校验实现。不能将 multipart、强大小限制等未生效约束隐含在 grant 里。

AWS 明确 presigned URLs 可重复使用、临时凭据过期会提前失效；此处采用保守公共契约，不把签名当完成事件。[AWS presigned URL](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

### Multipart

当前 capabilities 不得公布 multipart。无 create/complete/abort 接口，相关请求早期 unsupported-capability；必须先定义生命周期、part 顺序、限额和清理再扩展。禁止仅因 SDK 支持就宣布模块支持。

## Error Model

`StorageError = {code, message, retryable, outcome: not-applied|applied|unknown, operation, requestId?, partial?}`。message/requestId 需脱敏；partial 仅 move 用 `{destination: ObjectInfo?, source: retained|removed|unknown}`，不含 URL/root/credentials。

| Code | Meaning | Default retryable |
| --- | --- | --- |
| invalid-input | 参数、key、长度不合规 | false |
| invalid-cursor | cursor 格式、绑定或有效性不合规 | false |
| not-found | 已确认单对象不存在 | false |
| precondition-failed | 原子条件不满足（含已缺失） | false |
| unsupported-capability | 当前 Adapter 不可兑现请求 | false |
| permission-denied | 访问不允许 | false |
| authentication-failed | 凭据失效/无效 | false |
| limit-exceeded | 配置或资源预算超限 | false |
| range-not-satisfiable | 合法 range 不落在对象内 | false |
| integrity-error | 数据/metadata 格式或校验损坏 | false |
| aborted | 用户取消 | false |
| timeout | 超时，写结果可能 unknown | read only |
| rate-limited | Provider 限流 | read only |
| unavailable | 暂时不可用 | read only |
| partial-failure | 多步骤已部分生效 | false |
| provider-error | 未分类外部失败 | false |

retryable 只是建议，不是重放授权。自动重试仅 head/exists/list/get 在未输出 body 前的 transient 错误，最多 2 次尝试（含首次），退避不超剩余预算；所有写/delete/copy/move 及未知结果自动重试 0 次。支持者不得把权限错误伪装 not-found；Provider 无法区分时保守返回 permission-denied/provider-error。

## Compatibility

新增厂商选项只进独立 Adapter 配置，不改变消费者接口。降级须显式错误或另一次由调用者选择的操作，不静默换安全语义。ETag 条件并非天然满足 APF 不复用 Revision 约束；云 Adapter 必须证明或关闭条件能力。[AWS conditional requests](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-requests.html)

## TypeScript reference adapter lifecycle/profile（2026-09-09）

具体参考工厂为 createMemoryAdapter、异步 createLocalAdapter、异步 createOssAdapter；仅 Local/OSS adapter 暴露显式 async close({timeoutMs?})，不改变公共 Storage facade。内部 OperationContext.cancel() 幂等触发已有 abort 路径，不替代真实 I/O settlement 或 finish。

Memory/Local 保持本 API 的条件能力；OSS conservative profile 不提供 conditional-write/delete，两种签名、move、multipart false。默认 put/copy 必须因其隐含 absence 条件而先返回 unsupported-capability；显式 overwrite:true 才可无条件写入/复制。OSS revision 为开启版本控制的服务端版本 ID；current reads 从不以历史版本匹配条件。工厂参数、恢复与真实验证限制见 [参考包 README](implementations/typescript/README.md)。


### Reference adapter shutdown failure handling

Local/OSS close waits for underlying file/socket work and accepted input next/return operations to settle. A public abort or deadline may return first. A non-cooperative producer retains its staging/lease; Local close then times out without releasing the writer lock. A rejected handle close seals the instance, is never retried on the same handle, and prevents a later Local unlock. The final directory sync after lock unlink can still fail and cannot recreate that lock; callers must treat close errors as recovery events. See the TypeScript reference README for the supported host recovery boundary.
