# STORAGE_M1_B_IMPLEMENTATION_REPORT

日期：2026-09-08。范围：本次用户恢复 Storage Core／Memory／Local／OSS 开发；本报告实际完成 **Core + Memory**，Local／OSS 尚未实现。

## 交付结果

| 工作 | 实际状态 | 证据或剩余条件 |
| --- | --- | --- |
| ST-001 私有 TypeScript Runtime | COMPLETE | Node 24、strict ESM、锁文件、六个必需脚本 |
| ST-002 Core | COMPLETE | 校验、能力检查、错误脱敏、取消/deadline、流生命周期、观察事件 |
| ST-003 Memory | COMPLETE | 原子发布与条件变更、immutable snapshot、容量/对象数预算 |
| ST-004 Memory 契约与故障验证 | COMPLETE（作者自检） | 43 个实际测试通过；13 个适用 TEST/AC 组有 Memory 证据 |
| ST-005 Local 独立设计审查 | BLOCKED | 已备齐[审查包](LOCAL_OSS_REVIEW_PACKAGE.md)，缺独立审查者与留痕决定 |
| ST-006 Local 实现 | NOT_IMPLEMENTED | 必须先有 ST-005 PASS |
| ST-007 双 Adapter / M1 验收 | BLOCKED | Local 未实现、未测试，Security/Acceptance 不能通过 |
| OSS 设计与实现 | REVIEW_READY / NOT_IMPLEMENTED | 官方 SDK 调研完成；条件写/版本契约冲突待审查；无 SDK 运行代码 |

执行者为当前 Codex；没有调用 Cursor，没有声称独立评审或变更模型。风险：Core/Memory medium；Local 隔离和 OSS 凭据/签名 high。用户扩展的范围已记录，但未把既有独立审查前置改成自验收。

## 工作区与 Git

目标仓库 `https://github.com/xyq-dev/agent-project-framework`，起点 main：
`a6556a41ee7bd35007cc9226b40c9679c8bdf3bc`，基础 tree：
`318e1fb34f462bd3162cd75f3dddce9010dced1f`。

当前工作区是通过 GitHub API 读取的文件镜像，无本地 Git 元数据；不是已执行 git checkout/commit 的工作树。开工前 71 个文件的 Git blob SHA 与远端基线逐项一致，未发现需要保留的其他修改。交付分支为 `feat/storage-runtime-v0.1`，由 GitHub tree/commit/ref API 创建；确切提交和远端回读结果以关联 PR 为准。未进行 pack、npm publish、Tag、Release、云部署或 Bucket 配置操作。

## 可复现验证

工作目录：`modules/storage/implementations/typescript/`。

环境：Linux x64，Node `v24.19.0`，npm `11.9.0`，TypeScript `5.9.3`，`@types/node 24.13.3`；锁定间接类型依赖 `undici-types 7.18.2`。依赖来自 npm 官方 registry，锁文件包含下载地址与 integrity。没有运行依赖安装脚本，没有 runtime 外部依赖。

| 命令 | 结果 | 实际测试数 |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` | PASS，3 packages | 安装验证 |
| `npm run typecheck` | PASS | 类型检查 |
| `npm run build` | PASS | 编译 |
| `npm test` | PASS | 43 / 43，0 fail、0 skip |
| `npm run test:contract` | PASS | 14 / 14 |
| `npm run test:failure` | PASS | 20 / 20 |
| `npm run test:security` | PASS | 9 / 9 |

后三组是完整 43 项的分组执行，不是另外 43 项。npm 输出了宿主的 `http-proxy` 环境配置弃用提示，不影响退出码；未修改宿主设置。

首次编译发现类型库缺少 `String.isWellFormed` 声明，改为 ES2024 lib，运行目标仍为 Node 24。首次测试发现测试文件解析 package 根目录偏移一层，修正后全量通过；随后增加 5 个流和输入安全回归用例，最终结果为上述 43 项。当前无未解决的 Core/Memory 测试失败。

静态检查另见 [REVIEW](REVIEW.md)；它们只校验契约、状态与标准采用，不执行 Runtime。完整 Runtime 机器证据见 [runtime-results.json](validation/runtime-results.json)，按适配器的映射见 [cases.yaml](validation/cases.yaml)。

## TEST / AC 逐项结果

| 测试与验收 | Memory | 主要实际证据 | Local |
| --- | --- | --- | --- |
| TEST-001 / AC-001 | PASS | Unicode/NFC、非法 Key/Prefix、未触发 Adapter | NOT_RUN |
| TEST-002 / AC-002 | PASS | 空对象、并发创建、长度/16MiB 边界、失败旧值保护、共享预算 | NOT_RUN |
| TEST-003 / AC-003 | PASS | 覆盖/删除后的旧快照、exists 错误、提前关闭和超时 | NOT_RUN |
| TEST-004 / AC-004 | PASS | 精确删除、缺失幂等、旧 revision 不能删新对象 | NOT_RUN |
| TEST-005 / AC-005 | PASS | 多页完整性、cursor scope、空页续传、对象数上限 | NOT_RUN |
| TEST-006 / AC-006 | PASS | 流式 copy、metadata、新 revision、源故障与目标竞争 | NOT_RUN |
| TEST-007 / AC-007 | PASS | move 不支持且零 I/O | NOT_RUN |
| TEST-008 / AC-008 | PASS | Range、原子 CAS、条件能力拒绝、能力快照 | NOT_RUN |
| TEST-009 / AC-009 | PASS | 两种签名和 multipart 不支持，零 I/O | NOT_RUN |
| TEST-010 / AC-010 | PASS | 2KiB/32 项 metadata、替换、revision、字节/对象信息防御拷贝 | NOT_RUN |
| TEST-011 / AC-011 | PASS | abort/deadline、空流饥饿、迟到句柄、至多 2 次读尝试、变更不重放、unknown、16 个观察回调上限 | NOT_RUN |
| TEST-012 / AC-012 | PASS | 注入 binding、无 config/audit 包、无环境变量或云类型依赖 | NOT_RUN |
| TEST-013 / AC-013 | NOT_APPLICABLE | 本地文件系统与恢复专用项 | NOT_RUN |
| TEST-014 / AC-014 | PASS | 私有隔离包、精确依赖/锁文件、六个脚本与能力声明 | NOT_RUN |

Memory 的 PASS 仅覆盖支持的操作和禁用能力的拒绝行为，不代表已经实现移动、签名或 multipart。

## 实现检查与限制

- Core 不依赖 filesystem/云 SDK，不读取环境变量；公开错误采用固定消息和字段，观察事件不携带 key、metadata、凭据或 URL。
- Memory 条件检查和发布之间没有 await；先完整验证并 staging，失败不会替换旧对象；同 key 并发 create/CAS/copy 有真实竞争测试。
- 总容量计入已存数据、在途写缓冲、增长时新旧缓冲及未释放旧读快照。此预算约束 Adapter 管理的字节缓冲，不是整个进程 RSS 上限；调用方持有的输入/输出、JS 对象与 metadata 有各自大小/数量边界。
- get deadline 延续到流结束；提前 break、显式 return、从未开始读取的超时都会释放 Adapter 引用。恶意宿主 ByteSource 若拒绝协作退出，模块能停止等待，不能强杀宿主代码。
- Memory 仅单进程易失存储，不承诺重启恢复；分页不承诺跨页快照；不自动驱逐已存数据。
- 当前 Adapter port 不含已验证 signer/move/multipart 实现，Core 拒绝这类能力声明。OSS 启用签名需要先批准端口扩展，不能绕过 facade。
- 测试和复核由同一作者完成，不是独立安全审计；整个 Storage 保持 IMPLEMENTING，Security/Acceptance/Release 不通过。
- Local/OSS 未创建空实现或虚假测试；未读取云凭据，未执行真实云集成。无登录/媒体/支付等模块变更。

## 尚未完成事项与解除条件

1. 由独立 reviewer 对 [Local/OSS 审查包](LOCAL_OSS_REVIEW_PACKAGE.md)逐条作出 PASS/修改意见。现有 [TASKS ST-005](TASKS.md) 要求作者独立，[SECURITY Decision Record](SECURITY.md) 又禁止自动多 Agent；本次没有擅自创建审查 Agent。
2. Local 设计 PASS 后实现 Linux 专属 root、锁、原子 envelope、FD 快照与取消清理；运行全部共享契约及 TEST-013 的真实进程中止、symlink、损坏和重启验证。
3. OSS 先解决 capability 与 provider 原语差异，再编写官方 SDK Adapter、错误/取消/请求绑定和离线契约测试；真实云通过证据另行记录，不以 mock 代替。
4. Local/OSS 实现后完成独立安全复核及全模块验收。没有这些证据，不将 M1 或四层标记“全部完成”。

