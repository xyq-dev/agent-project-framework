# Storage Specification — 0.1.0-dev

## Scope and Status

本模块是跨项目可复用的 Object Storage 契约；负责人 `xyq-dev`，基础风险 `medium`。生命周期以 [STATUS.md](STATUS.md) 为准。

M1 分三个可验收增量：

- **M1-A（已完成）**：规格、架构、数据/API 契约、测试计划、任务和交接；该历史增量没有 Runtime。
- **M1-B（已实现）**：TypeScript/Node Reference Core + Memory Adapter；Core/Memory 44 项 Runtime 测试通过，见[实施报告](STORAGE_M1_B_IMPLEMENTATION_REPORT.md)。测试无网络。
- **M1-C（Memory/Local 原始范围已验收；云扩展待验收）**：Local 34 项；OSS 保守 profile 34 项离线测试；合计 112 项。原始 ST-007 已获独立正式 Test/Security/Acceptance PASS；OSS 离线范围审查通过，真实云及全模块 Gate 仍待完成，见[正式验收记录](STORAGE_M1_ACCEPTANCE_REVIEW.md)。

签名 URL 的**通用授权契约与不支持行为**在 M1 定义；真正签发/使用 URL 必须在后续云 Adapter 增量验证。multipart 仅保留发现入口，尚无上传会话协议。不得以文档存在替代实现或宣称全云兼容。

## Problem, Goals and Consumers

消费者（未来 Media、Export、Backup 等模块）需要稳定的对象读写语义，不应依赖外部 SDK 类型、真实 bucket、目录布局或厂商异常码。M1 首先验证：相同 Contract Tests 能约束两个性质不同的测试 Adapter，失败结果不被伪装为成功。

## Non-goals

不负责头像、缩略图、图片压缩、视频转码、海报、业务 ACL、媒体数据库记录、CDN/Public URL、上传 HTTP 服务、Bucket/IAM 管理、自动 Provider 切换、跨存储迁移或全量数据删除。Storage 不创建 bucket，不改变公共访问权限，不读取项目现有 Secrets。

## Capability Matrix

下表记录初始实现 profile：Memory/Local 已通过本地测试，OSS 仅通过 pinned SDK + loopback HTTP 测试。独立设计范围见 [审查记录](INDEPENDENT_SECURITY_REVIEW.md)；真实 OSS 验证 NOT_RUN。

| Capability ID | Memory (M1-B) | Local (M1-C) | OSS initial profile |
| --- | --- | --- | --- |
| `put` | required | required | supported (offline) |
| `get` | required | required | supported (offline) |
| `head` | required | required | supported (offline) |
| `exists` | required | required | supported (offline) |
| `delete` | required | required | supported (offline) |
| `list` | required | required | supported (offline) |
| `metadata` | required | required | supported (offline) |
| `capability-negotiation` | required | required | supported (offline) |
| `copy` | required | required | supported (offline) |
| `move` | false | false | false |
| `range-read` | required | required | supported (offline) |
| `conditional-read` | required | required | supported (offline) |
| `conditional-write` | required | required | false |
| `conditional-delete` | required | required | false |
| `signed-upload-url` | false | false | false |
| `signed-download-url` | false | false | false |
| `multipart` | false | false | false |

`false` 表示必须在消费 body/发请求前报 `unsupported-capability`，不能返回假 URL、静默覆盖、忽略 Range 或降级为全量操作。未来候选 S3、R2、COS、MinIO 的名称只用于 Adapter 计划，必须各自验收。

## Functional Requirements

| ID | Normative requirement |
| --- | --- |
| REQ-001 | 只接受 [API.md](API.md) 的 logical key/prefix；命名空间由 binding 固定，操作不接受任意 endpoint、bucket 或路径。 |
| REQ-002 | put 受大小限制且显式声明覆盖；未知结果必须可识别，失败不能把旧对象替换为残缺内容。 |
| REQ-003 | get/head 与 body 对应同一版本；exists 仅把可靠 not-found 映射为 false。 |
| REQ-004 | delete 只操作单 key；缺失可幂等成功，权限/超时不得吞掉；条件删除须真实原子。 |
| REQ-005 | list 有页大小上限、命名空间隔离、opaque cursor；空页不等于结束，有并发变更时不承诺快照。 |
| REQ-006 | copy 同 binding 保留内容与用户 metadata；源不存在不改目标，源=目标拒绝；不承诺跨对象事务。 |
| REQ-007 | move 不承诺原子性，不支持时无副作用；未来源删除须版本保护，部分完成须报告。 |
| REQ-008 | capabilities 只公布实现可兑现的能力；Range 和 conditional 不能用不安全的“先查再写”伪装。 |
| REQ-009 | 签名授权限定单 key/method/TTL/headers；M1 无 signer，只验证明确拒绝，不签发测试凭据。 |
| REQ-010 | metadata 大小与字符集受限，revision/etag/checksum 语义分开，put/copy 原子发布 body 与 metadata。 |
| REQ-011 | 公共错误稳定、可取消、预算有界；只在安全条件下重试，不记录原始 key/签名 URL/credentials。 |
| REQ-012 | Core 只依赖端口和已验证配置，config/audit 缺失不阻止基础能力；无虚假模块边。 |
| REQ-013 | Local 仅在专属 root 工作，抵御路径逃逸，失败清理受限；不能删除未归属本次操作的对象。 |
| REQ-014 | 无 DB、Migration、业务 ACL 或云配置变更；版本兼容与 Runtime 支持有证据。 |

## Non-functional Requirements

- 可靠性：Reference Adapter 单对象操作线性化；多操作及 list 不构成事务。Memory 不持久，Local 仅承诺经测试的进程崩溃行为，不承诺断电持久性。
- 内存/流：Core/Local 顺序消费 ByteSource，应用层缓存不随对象总大小增长；Memory 测试 Adapter 可缓存对象但受总预算约束。
- 限制：默认对象 16 MiB，metadata 2 KiB，list 页 100/最大 1000；均是本模块的参考策略，不是云厂商上限。
- 安全：Local/OSS 按 `high` 路由，设计已独立通过；Memory/Local 的 ST-007 正式 Gate 已通过，OSS 仅离线范围通过审查，真实云及全模块 Gate 仍 PENDING；未来云 signer 或真实凭据工作仍按 `high` 路由，不沿用 medium 作为发布豁免。
- 可移植性：核心契约无语言绑定；第一实现 Profile 为 Node 24.x + TypeScript strict，不强制其它项目采用此栈。
- 性能：M1 不设未经测量的吞吐/延迟承诺；验收要求取消、大小与超时测试可重复。

## Dependencies and Compatibility

必选模块依赖：无。必需的**配置值**不等于必需的 **config 模块**，配置由宿主注入，Storage 做自己的边界校验。

config 与 audit 目前都不存在已发布契约，因此不捏造 version range/capability ID，也不写入 `optional_dependencies`。未来 config 可提供值映射，audit 可实现 Observer 端口；新增集成时才提交真实模块边、版本范围、缺失降级测试和无环验证。[架构决策](ARCHITECTURE.md)明确这一 Roadmap 细化。

Module `0.1.0-dev`，Framework range `>=0.1.0-dev <0.2.0`。新接口尚无消费者，Schema 0.1 保持不变；进入运行期后破坏性变更遵从 [Module Standard](../../framework/MODULE_STANDARD.md)。

## Acceptance and Open Questions

每条 REQ 都映射到 [TESTS.md](TESTS.md) 和 [ACCEPTANCE.md](ACCEPTANCE.md)；M1-A 文档检查与 Runtime Gate 分开记录。

M1-A 范围无待用户选择的阻塞。License、Local 跨平台与云适配器真实兼容性保留到相应阶段，不把它们描述为已解决。

OSS 默认 put/copy 因不支持条件写而在源、凭据、网络前拒绝；只有显式 `overwrite: true` 的无条件操作可执行。revision 使用 Enabled Versioning 的服务端版本 ID；不是 ETag。OSS 无条件 delete 不清除历史版本。
