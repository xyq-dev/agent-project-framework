# Storage Architecture — 0.1.0-dev

## Scope

实现目标为 [SPEC.md](SPEC.md) 的 M1-B/M1-C。M1-B 已按本文实现 `typescript-node`、Node 24.x、TypeScript 5.9.3 strict ESM、Node 内置测试 runner；见[实施报告](STORAGE_M1_B_IMPLEMENTATION_REPORT.md)。Local 仍需 ST-005 独立审查；本次新增 OSS 候选 profile 见[审查包](LOCAL_OSS_REVIEW_PACKAGE.md)，未视作 ADR 已批准。

选择依据：标准 ByteSource 易映射到 AsyncIterable，Memory/Local 共用 Contract Tests；云 SDK 不进 Core。其它语言以后实现同一 Contract 即可。[Node release schedule](https://nodejs.org/en/about/previous-releases)

## Components and Dependency Direction

| Component | Responsibility | Prohibited ownership |
| --- | --- | --- |
| Consumer / future Media | 身份、业务 ACL、用途、记录和上传后验证 | 不把用户 URL/真实文件路径当 key |
| Storage facade | validation、limits、error mapping、能力判断、Observer | 不读取全局环境、业务数据库、Provider SDK |
| Adapter port | 单对象操作、metadata、版本、条件能力、流与分页 | 不自行替换 namespace 或开启公共访问 |
| Memory adapter | 确定性有界测试对象与故障注入 | 不宣布 durable/cloud support |
| Local adapter | 专属 root 的本机持久化测试 | 不支持不受信任共享目录或未验证多进程 |
| Future provider adapter | 外部 SDK、签名和厂商差异 | 未验收不能出现在支持列表 |

依赖方向仅为 Consumer→Facade→Adapter；Observer/配置是注入端口，不反向导入上层模块。Spec 不依赖任何 runtime package。

## Dependency Decision: config / audit

当前 Catalog 没有 `config` 或 `audit`。必需的 StorageConfig **值**由宿主提供，不能把这写成未发布模块的虚假依赖。

- config：将来提供环境映射/校验工具；Storage 本身校验传入 limits、binding，不读取 `.env`。
- audit：将来可接入 Observer；缺失时 no-op，不影响基础能力。Observer 不是可靠审计账本，不用于支付/权限证据。
- 两者实际存在且版本/Capability 已定时，再作为可选模块边声明。宿主需要必填审计时应在上层建立可靠事件机制，不偷偷改变 Storage 写入事务。
- 缺失这两者的基础测试必须成功；未启用的可选依赖不参与解析，未来启用时需检验版本与能力。

不创建空 config/audit 目录，不实现 Resolver；[REVIEW.md](REVIEW.md)记录本次对 Kernel 的反馈。

## Operation Flows

### put

1. 校验 binding/key/options/metadata，能力判断；默认写需要 conditional-write。
2. 创建受限 staging body，计数、取消和 deadline 全程生效。
3. 完整输入验证成功后，由 Adapter 在同 key 临界区原子判断条件并发布 body+metadata。
4. 返回 ObjectInfo；Observer 失败只能产生脱敏诊断，不能把成功改为失败。
5. staging 失败只清理本操作创建的临时资源。发布后未知结果不自动重试。

### read / copy

get 获取稳定版本 handle 并关联 info；overwrite/delete 不得使已打开的读流切换到别的版本。copy 从该 snapshot 流到 put，目标按自身条件发布；只在同一 binding 内，Core 不加载整个源对象。

### move / signer

M1 adapters 始终 false，拒绝发生在任何 I/O 之前。未来 move 不是 copy+delete 的普通封装，必须落实 [API.md](API.md) 的 sourceRevision 和 partial-failure 协议。AWS 的 move 本身也由复制后删除组成，不能据此承诺通用原子移动。[AWS copy/move](https://docs.aws.amazon.com/AmazonS3/latest/userguide/copy-object.html)

## Memory Reference Profile

- 仅在单进程运行，每个实例固定 namespace，实例间隔离。
- 每个 key 的 immutable record = info + byte content；写入成功生成新不复用 revision。读返回 snapshot 防止外部修改内部 buffers/map。
- 单 key publish/condition/delete 在同一串行区；不得在条件检查和发布之间放任交叉写入。
- 默认 maxObjectBytes=16 MiB；总已存+in-flight bytes 预算 64 MiB；maxObjects=10000。超限不驱逐对象，报 limit-exceeded。
- list 在静态集合下按 UTF-8 bytes 排序，cursor 绑定 namespace/prefix+lastKey；不是保密或授权 token，绑定不匹配必须拒绝。
- 测试注入点：读前权限/超时/限流、写流失败、发布前失败、发布后响应丢失。测试钩子仅 testing import，不进入正常 public API。

## Local Reference Profile

### Supported environment and threat assumption

首个验收目标：Node 24.x + Linux 本地普通文件系统；Windows/WSL/macOS 只有在具体环境跑过对应测试后才可追加支持。不是 NFS/shared root、对象存储挂载、多进程服务或生产 Provider。

root 必须由宿主显式提供，专属且不可由不受信任用户写入；Local 工厂不接受网络 share/任意每请求 root。不适用根目录、home、仓库目录或含用户既有数据的目录。测试使用专门创建的临时目录。

### Planned layout and atomic record

以 `SHA-256(UTF8(Key))` 得到小写 hex 对象 ID；一个已固定 binding 一个 root；不要直接用用户 key 作为物理相对路径。物理记录包含原始 key 并回读核验，digest 冲突报 integrity-error，不能覆盖另一 key。

预计内部结构是 `root/objects/<hex>.obj`、`root/tmp/<random>.tmp`、root-level writer lock；这些不是公开 key，也不能出现在 list 结果中。无目录占位文件在本次创建。

`.obj` 测试格式：8 bytes `APFST01\n`、4-byte unsigned big-endian header length、UTF-8 JSON header、raw body。header 含 formatVersion=1、完整 ObjectInfo；<=65536 bytes，body 长度与 sizeBytes 一致，异常格式拒绝。header 长度不能直接作为无限分配依据。

put 先流式写独立 staging body（测得长度），再流式组装新 envelope，同文件系统 flush/close 后原子 rename 发布完整 record。body/metadata 不能用两个单独公开 sidecar 文件分别替换。源 staging 和未发布 envelope 仅本操作管理；清理失败留下隔离资源记录，不删除其它对象。

### Serialization and persistence scope

- 初始化通过独占 root writer lock（exclusive create）阻止第二实例/进程，锁文件本身不得跟随 symlink；已有锁一律失败，不“检测 PID 后自动解锁”。崩溃后人工确认再处理锁是显式运维任务。
- 应用层同 key lock；copy 不同时持有反向 src/dst locks，先获得读 snapshot，再持目标锁，避免 A→B/B→A 死锁。
- 启动核验 realpath、所有者/权限假设、objects/tmp/lock 不为 symlink；操作使用不可控 key 隔离后的已知子路径，并验证关键节点、普通文件和边界。不把单次 string-prefix 检查当安全证明。
- 可信 root 下同进程操作不能读到半文件；断电、敌对同机 root writer/管理员、跨进程绕锁不在当前保证内，不能声称防御所有 symlink TOCTOU。
- restart 保留已发布 record，残留 tmp 不参与 list；不自动扫描删除历史 tmp、回滚旧版本或递归清空 root。
- 条件写/删除的检查与 rename/unlink 必须在同 key lock 内，并在关键步骤前重新核验路径；旧 revision 不能删除替换后的对象。

异步文件操作的并发需要应用层协调，本计划以串行化和 snapshot 明确约束。[Node filesystem API](https://nodejs.org/api/fs.html)

## Observability and Recovery

Observer payload 限 `operation, outcome, errorCode?, durationMs, bytes?`，禁止原始 key、body、metadata value、路径、URL 或 credentials。回调在结果确定后发出；同步抛错/异步拒绝必须捕获，异步任务不阻塞操作完成；这不是 exactly-once 投递。每实例最多 16 个尚未 settle 的 Observer 调用，满额直接丢弃新观测；只有 settle 才释放槽位，避免慢/挂起 Observer 导致无限队列。宿主不得注入阻塞事件循环的回调。

| Failure | Required behavior | Evidence |
| --- | --- | --- |
| 输入超限/取消/流中途抛错 | 旧对象可读；本次 temp 受限清理 | TEST-002, TEST-011 |
| 读取 403/timeout | exists 抛出，不能 false | TEST-003 |
| Copy 源失败 | 不发布残缺目标 | TEST-006 |
| 写成功后响应丢失 | outcome unknown；不自动二次写 | TEST-011 |
| Local 发布前进程崩溃 | 重启仍读旧完整 record；tmp 不可见 | TEST-013 |
| 发布后崩溃 | 能读取新完整 record 或明确 integrity failure，不返回混合 metadata | TEST-013 |

## Decisions

| ID | Decision | Rejected alternative / consequence |
| --- | --- | --- |
| ADR-001 | config/audit 为未来端口集成，无现存 module 边 | 避免捏造未发布版本；M1 不验证真实多模块安装 |
| ADR-002 | default overwrite=false，能力不足就拒绝 | 不以 HEAD+PUT 伪造原子条件 |
| ADR-003 | Memory→Local；cloud/signing/move 延后 | M1 不可用于真实多云生产迁移 |
| ADR-004 | Local 单 immutable envelope + 专属 root | 两份 sidecar 会产生 body/metadata 半更新 |
| ADR-005 | Revision 与 ETag 分开 | 云条件能力可能无法实现，必须显式 false |
| ADR-006 | Specification 与 runtime/profile 分离 | Core 不绑定 Node；Runtime 支持证据后再入 manifest |

## Architecture Review Boundary

M1-A 可进行设计审查；这不是 Local/security 运行验证。Node/Memory 可在任务 Gate 合格后实现。Local 防逃逸与真实 signer 为后续高风险增量，必须独立安全复核后开始，后续结果写回 STATUS。
