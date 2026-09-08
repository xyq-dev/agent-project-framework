# Storage Data Model — 0.1.0-dev

## Applicability and Ownership

概念数据模型适用；数据库 schema/Migration 不适用。Storage 拥有 bytes 及技术 metadata，宿主/Media 拥有业务用途、所有者、可访问主体和删除策略。无 SQL/Prisma/ORM、业务 media 表或 tenant 表。

| Concept | Identity | Owned data / lifespan |
| --- | --- | --- |
| StorageBinding | 宿主固定的 instance/namespace | 对象集合与能力，不是 credential 存储 |
| Object | binding + logical Key | bytes + ObjectInfo，替换生成新 Revision |
| ReadSnapshot | object + captured Revision | 读句柄打开到 EOF/取消，不保证可长期取回 |
| Cursor | adapter + binding + prefix + continuation | 续页提示，不能充当授权凭据 |
| SignedGrant (future) | 单 key + method + expiry | 短期 bearer secret，不是业务订单/上传完成证明 |

## Invariants

- INV-001：同 binding/key 的可见 bytes 与 metadata 属于同一完整发布，不返回一半新一半旧。
- INV-002：每次完整写入新 revision；条件匹配绑定 key，不能把 etag/checksum 当唯一写入代际。
- INV-003：未发布 staging、文件系统内部名和锁不出现在 list。
- INV-004：metadata、contentType 是不受信任内容，不作为权限和安全判断。
- INV-005：无条件 delete 的成功不是删除全部历史版本、备份或缓存的证明；保留规则归宿主。
- INV-006：Memory 和 Local 使用相同 logical key 语义，物理映射不进入通用 Contract。

## Relationships and Persistence

一个 binding 包含多个 Object；一次 get 只观察一个 snapshot；list 可观察多个时间点，不提供全局快照事务。跨 binding copy/move 不在 Contract 中。

Memory 为 volatile；Local 的 formatVersion=1 测试 envelope、writer lock 和原子发布策略见 [ARCHITECTURE.md](ARCHITECTURE.md)。此格式不是通用 Module Schema，未来云 Adapter 不要求按此编码对象。

sizeBytes 限定为非负、精确可表示整数（TypeScript Profile <= Number.MAX_SAFE_INTEGER，同时受更小对象上限）；timestamp 使用 UTC，不能用于并发控制。

## Retention, Integrity and Recovery

不存业务个人身份；key/metadata 仍可能包含敏感信息，因此默认不入日志。宿主决定何时删除，Module 不自动设置 retention 或回收 bucket。Memory/Local 不自带加密，敏感生产数据需要单独的安全与运维方案，不能因模块有 SECURITY.md 就宣称加密。

Local 格式损坏/键不匹配/截断报 integrity-error，不尝试静默修复。恢复前先核验原始失败和文件归属；只允许人工批准的窄范围处理，不能遍历清空旧 root。首个 Local Profile 需崩溃/重启测试。

## Compatibility

- Database Migration required: **NO**。
- 本次无持久化文件产生/变更；不存在生产数据操作。
- 后续 Local format change 若需要转换既有数据，单独定义 migration/rollback，并按 critical 任务处理，不自动升级或降级读取。
- 当前实验版本未发布；不承诺未来 Runtime 的磁盘兼容性，支持范围在验收后声明。
