# STORAGE_M1_B_IMPLEMENTATION_REPORT

更新：2026-09-10 UTC。当前增量包含 M1-C Local 和用户授权的 OSS 首版。**四层初始 profile 代码已实现；112 项测试通过。原始 ST-007 Memory/Local 范围已获独立正式验收；OSS 离线范围审查通过，真实 OSS 验证与全模块验收未完成。**

本日只补正式决定与交接文档；下列运行、测试、依赖及静态 Node 校验均为2026-09-09或其注明的前次记录，未改动源码/测试/锁文件，未在本日重跑。正式决定见 [STORAGE_M1_ACCEPTANCE_REVIEW.md](STORAGE_M1_ACCEPTANCE_REVIEW.md)。

## 执行与基线

- 仓库：xyq-dev/agent-project-framework；main 基线 `a6556a41ee7bd35007cc9226b40c9679c8bdf3bc`。
- 交付分支：`feat/storage-runtime-v0.1`；[草稿 PR #3](https://github.com/xyq-dev/agent-project-framework/pull/3)。安全复核增量父提交 `36677e8cee9025c9f77541876609bd780f23a006`；前序 Core/Memory 提交 `1b3bf0b7a1f4e09ec70d24a997b6c3baa915617e`。
- 工作区是 GitHub API 文件镜像，无本地 `.git`。本次开工前核验全部 108 个远端文件与本地 blob 一致，无未同步改动。实际新提交和回读见 PR 与 STATUS，不声称执行 git checkout。
- 实现与作者自检：当前 Codex；未调用 Cursor。用户明确授权一个独立安全审查 Agent，使用 `storage_security_review` / GPT-5.6 Sol 极高路线；没有自行扩大 Agent 数量。
- 初始 Local/OSS 设计 PASS 由独立 reviewer 留痕后才开始代码。2026-09-09独立发现与最终复核已送达，正式报告追加前额度中断，作者将消息原样存为独立转录文件；2026-09-10独立Agent完成正式分范围决定，原设计和消息记录继续保持原文。

## 任务结果

| Task | 当前结果 | 证据与边界 |
| --- | --- | --- |
| ST-001～004 | COMPLETE | Core/Memory 44 项通过（原 43 项加严格 cursor 回归）；新增内部 Context.cancel 支持 adapter 生命周期，公共 Storage 消费 API 不变 |
| ST-005 | DESIGN PASS | [独立记录](INDEPENDENT_SECURITY_REVIEW.md) L-001～L-007；namespace manifest、锁生命周期、FD snapshot、原子 envelope、清理与恢复 |
| ST-006 | COMPLETE | Local34项；global publication mutex严格串行化发布；独立实施/安全Gate已正式通过原始ST-007范围 |
| ST-007 | COMPLETE / scoped acceptance PASS | 独立reviewer/security-reviewer/acceptor已正式接受原始Memory/Local范围，含OSS全模块与Release不由此通过 |
| OSS-001 | DESIGN PASS | O-001～O-009 保守能力 profile |
| OSS-002/003 | IMPLEMENTED / OFFLINE TESTED | 官方 ali-oss 6.23.0、V4 signer/XML parser、窄 HTTPS transport、完整磁盘 staging、版本确认、GET/HEAD/delete/list/copy |
| OSS-004 | DEFERRED BY APPROVED PROFILE | 签名下载端口后续单独审查；两种 signing、move、multipart 均明确 false，无假成功实现 |
| OSS-005 | OFFLINE PASS / CLOUD NOT_RUN | 34 项 SDK+loopback 测试；[真实云 smoke 入口](implementations/typescript/test/oss-cloud-smoke.ts)未调用，无授权测试 bucket/namespace/凭据 |

## 实现说明

Local 使用固定内部目录、SHA256 逻辑键文件名和单一 envelope；root 的 manifest 永久绑定 namespace。目录 0700、文件 0600、有效 UID、no-follow、inode、单链接普通文件、strict JSON/UTF-8/长度均验证。完整 staging 后 fsync，串行检查条件再 rename；metadata/body 同 FD 读取。close 拒绝新操作、取消旧 context/流，等待实际 I/O 与 close 完成，再核验锁 inode/token；超时保留锁，后台 settle 不自动解锁，宿主显式重试 close 才可完成。rename/unlink 不确定失败后实例失效，需关闭重开重建索引。

OSS 使用固定官方 HTTPS origin、bucket/region/namespace 和 `apf-storage/v1/SHA256(namespace)/objects/key`；最长合法 namespace+key 不会因编码前缀超长而丢失公共契约。用户 metadata 独立 canonical base64url JSON，格式/namespace/binding/key digest 为保留标记；拒绝 foreign/symlink/gzip/无效版本响应。写前完整验证来源与实际长度，再取宿主凭据；PUT 成功只 HEAD 其确切版本，验证返回 info。当前条件读不读取历史版本冒充当前。HEAD404 只在 GET 明确 NoSuchKey 后作为不存在；list 用最多 4 并发当前 HEAD 补 metadata，保留 provider 顺序与空页续页。

SDK 和 transport 均不重试 mutation；Core 只对可重试读取最多 2 次。窄 transport 固定方法/URL/query，正常生产 TLS、无 proxy/redirect，成功 XML 4MiB、错误 64KiB，取消销毁实际 request/response/socket。每次获取凭据和注入/dispatch 前检查真实 SDK debug namespace；不修改宿主日志配置。宿主不得在请求执行中动态开启 SDK debug。

## 真实执行的测试

环境：Linux x64、Node 24.19.0、npm 11.9.0、TypeScript 5.9.3、@types/node 24.13.3；私有 ESM 包。安装脚本禁用；依赖精确锁定。

| Command | Result | Counts |
| --- | --- | --- |
| npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000 | PASS / exit 0 | 此前重装通过；本轮锁文件未变化 |
| npm run typecheck | PASS / exit 0 | strict/noEmit |
| npm run build | PASS / exit 0 | src/test 全量编译 |
| npm test | PASS / exit 0 | **112 tests, 112 pass, 0 fail/skip/cancel** |
| npm run test:contract | PASS / exit 0 | 42：同一 suite 在 Memory/Local/OSS 各 14 项；OSS 条件能力为明确拒绝断言 |
| npm run test:failure | PASS / exit 0 | 43 |
| npm run test:security | PASS / exit 0 | 27 |
| npm audit --omit=dev --json | PASS / exit 0 | 此前同一锁文件 audit 已知漏洞 0；本轮不重复网络 audit |
| node modules/storage/validation/validate-spec.cjs | PASS / exit 0 | 10 组、13 个阴性 fixture、14 个映射；Ajv8.20.0/js-yaml4.1.1 |
| node validation/validate-standard.cjs | PASS / exit 0 | 9 组、9 个阴性 fixture、46 个 bootstrap 目标；仅内存模拟 |

分组执行是同一批 112 项，不重复计数。按 Adapter：Core/Memory 44、Local 34、OSS 离线 34。完整命令与 31 个源码/测试/包文件 SHA256 见 [runtime-results.json](validation/runtime-results.json)。14 个通用 TEST/AC 的 Memory/Local 结果见 [cases.yaml](validation/cases.yaml)。

| 覆盖组 | 实际关键断言 |
| --- | --- |
| TEST-001/012/014 | key/配置校验、无副作用拒绝、严格依赖锁、Core 无 Provider SDK/环境读取；模块支持与代码路径一致 |
| TEST-002/004/008 | create/CAS/copy 竞争仅一胜者（Memory/Local）；OSS 不支持条件提前拒绝；长度/来源/预算失败不发布残缺对象 |
| TEST-003/010 | 旧 snapshot 跨覆盖/删除；metadata 绑定、版本更新、Range、损坏文件/响应拒绝、早退与未消费超时 |
| TEST-005/006 | 分页作用域、prefix/binding、流式复制；OSS list 有界补全、空页带 cursor、foreign/畸形 XML 拒绝 |
| TEST-007/009/011 | no fake signer/move/multipart；unknown outcome、读重试最多 2 次、mutation 单次；凭据轮换/过期、debug 拒绝、真实 socket 关闭 |
| TEST-013 Local | namespace 重开、root/内部目录/文件 symlink/权限/硬链接/FIFO、重复 JSON/非法 header、manifest/lock 替换、配额、晚到 open/read/rename/unlink/dirsync、close 重试；4 个受控 SIGKILL 阶段恢复 |

首轮实际失败已修：manifest 错误分类与清理顺序；SDK unused ClusterClient 导入需要下述测试环境 shim；HEAD503 无正文不能识别 SlowDown，改为含 XML 的 GET 验证明确 rate-limit；畸形 list XML 统一 integrity-error；落实独立 I-002 的带域/版本 SHA256 base64url 标记，并补齐2KiB引号/反斜线 metadata 的编码膨胀上限与重复大小写 header 拒绝。最终上述命令均通过，无已知未解决测试失败。

## 本次安全复核整改

本轮新增 8 项回归，总数从 104 到 112。先前设计和首轮 Local 26/26 记录继续保留；本轮独立结论原文保存在 [INDEPENDENT_REVIEW_TRANSCRIPT.md](INDEPENDENT_REVIEW_TRANSCRIPT.md)，原独立文件保持历史记录。

| 问题 | 修复与实际验证 |
| --- | --- |
| M-001：Memory 非法 UTF-8 / 非规范 JSON cursor 被接受 | fatal UTF-8 与 canonical JSON round-trip；非法字节、重复字段、前置空白均拒绝，原合法 cursor 正常续页。基线回归失败，修复后通过 |
| FD close 拒绝后仍可能解锁 | Local/OSS 使用每实例 CloseGuard，只调用一次 handle.close；拒绝后封闭实例。Local 解锁前检查失败状态；Spool 保留文件和预算。真实 FD 注入失败覆盖 get/head/put/delete/list，并验证未释放和已释放 FD 两种失败，禁止盲目重试；并发已 staging 写在后续 dispatch 前也被阻断 |
| L-008：输入 next 尚未 settle 就释放 staging/lease | Core guardedInput 与 Spool 都请求协作 return，并等待 raw next + return 真正 settle。公共 abort 及时返回；Local close 超时仍锁定。延迟 next/return 分别释放及永久阻塞子进程两类测试通过；同步纠正旧 Local/OSS 测试的提前清理断言 |
| O-010：真实云 smoke 的 close 失败跳过 cleanup | 本地可测 withCloudCleanup 始终尝试 verify/close/exact-version cleanup，多个失败合并保存；未运行真实云或增加删除范围 |
| 网络取消阶段证据缺失 | 新增延迟 DNS lookup、等待 TLS 握手、部分上传时取消，验证实际 request/socket/stream 关闭，迟到 lookup 不产生请求。仅关闭时序，不证明真实云 TLS/IAM 策略 |

中间快照完整测试首遍退出 0 但输出缺少汇总，未计作通过；重跑得到完整结果。最终并发补测后的源码按全部命令重新验证，要求明确总数和零失败/跳过/取消，不能只以退出码计 PASS。静态模块检查首次未指定外部 Ajv 路径而无法加载；按既有依赖配置重跑，10 组/13 阴性/14 映射通过。没有隐藏失败或修改测试 Gate 来获取 PASS。

资源关闭实现参考 [Node FileHandle.close 文档](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandleclose)，具体失败行为由本轮故障注入验证；不依赖垃圾回收或数字 FD 状态推断关闭成功。

## 独立复核与剩余事项

- 2026-09-09独立reviewer确认修复并复测112项/typecheck；消息原文与源码摘要保留。2026-09-10续接的独立reviewer基于该证据与定向源码复核，正式签发原始ST-007 Memory/Local的Test/Security/Acceptance，以及OSS离线范围的Test/源码安全决定；协调者只原样入库，不自签high验收。
- **真实 OSS：NOT_RUN**。没有授权测试 bucket/namespace/凭据；未读取其他项目 Secrets 或云资源。
- smoke 需显式测试 OssOptions 与精确版本清理回调；只有本次成功记录的 physicalKey/revision 会交给回调，关闭失败也尝试清理。未知 PUT 可能产生未记录版本，宿主仍须在本次唯一逻辑 key 内核对，不扩大为全桶扫描。
- 仍需真实服务端/TLS/IAM拒绝、OSS delete marker/历史版本清理、响应丢失与服务端错误差异验证。9项smoke即使通过，也不代替完整云验收。输入、8组矩阵、unknown/精确清理限制与owner见 [OSS_CLOUD_VALIDATION.md](OSS_CLOUD_VALIDATION.md)。
- 签名上传/下载、move、multipart 未开放；登录、配置、审计、业务权限、媒体、通知、支付等蓝图不属于本次 Runtime 交付。

## 兼容性与测试限制

Local 只支持 Node 24/Linux、普通本地文件系统、当前有效用户独占可信 root。无 NFS、多主机/敌对同机写入者或管理员隔离、断电耐久性承诺。默认单对象 16MiB、最多 10000 对象、staging 128MiB、16 个并发 lease；持久存储总量由宿主磁盘配额管理，不称为进程 RSS 上限。Memory 默认 64MiB 受控缓冲，旧 snapshot 及未结束 producer 同样计费。输入源永久阻塞时只能由宿主终止旧进程后恢复，不承诺 deadline 强制中止任意宿主代码。

Local 解锁前任何 handle close 失败均封闭实例并保留锁；同一 handle 不重试，已 enter 的并发变更在 dispatch 前再次检查关闭失败状态。最后 unlink 锁之后的目录 sync/close 失败只能报告，不能恢复已移除锁，此前操作资源已关闭；宿主需检查磁盘/root。

OSS 需要 bucket 已为 Versioning Enabled，不代为开启。每个实例 staging 默认 128MiB/16 lease；OSS 仅允许显式覆盖 put/copy；无条件 delete 仅删除当前可见对象，不擦除历史版本。实例会在无效 versionId 时失效；重建时重新验证版本配置。

Work Mode 沙箱阻止 os.networkInterfaces 枚举；官方 SDK 的未使用 ClusterClient 在 import 时调用它。**仅离线测试**首次同步加载 SDK 时临时返回空接口表，并 finally 恢复/断言原函数；src 无此补丁。HTTP loopback 和本地 TLS 握手取消测试验证实际传输/关闭时序，不验证生产 TLS 证书/IAM、真实 OSS 或生产 SDK 启动环境。真实云入口没有该 shim。

## Gate 与交付

Implementation 出口：PASS。2026-09-10独立正式决定：原始ST-007 Memory/Local的Implementation/Test/Security/Acceptance PASS；OSS初始profile Implementation、离线Test与离线源码/安全审查PASS。真实OSS和含OSS全模块Test/Security/Acceptance仍PENDING，Release未授权；模块保持TESTING。无Gate override，未用离线证据豁免云验证。

工作仅交付专题分支和草稿 PR；不合并 main，不 pack/npm publish/Tag/Release/部署。采用标准模板不复制此 Runtime，不继承任何测试/Gate。回滚为使用此前已知参考提交；Local 不自动迁移/修复/清空 root，崩溃锁必须由宿主确认旧进程已停止后人工处理。

## 2026-09-10 正式验收与文档核验

独立角色 `/root/storage_gate_review` 交付正式分范围决定，协调者原样保存为 STORAGE_M1_ACCEPTANCE_REVIEW.md（只补文件末尾换行）。其列出的6个证据Git blob SHA均与所审提交609b327匹配；新决定不改写旧消息、原测试日期或112项结果。

本轮为文档/状态变更：18个既有文件更新、2个新文件；没有改src/test/package/lock/tsconfig、Gate规则或新项目默认状态。会话内JavaScript核验通过：110个相对引用存在；7处YAML变更仅为可解析的字符串/字符串数组且结构不变；14个AC与原TEST映射一致；31个运行时证据文件清单与112项历史汇总保持完整；正式独立文本与收到的决定一致。

本日 `npm test`、typecheck/build、分组测试和两个Node静态校验器均NOT_RUN，原因是当前无Node/Linux执行环境。上述文档核验是本日实际替代证据，不能宣称重跑了运行时。提交后以GitHub tree比较确认运行时和历史证据未变，再回读新报告与状态；实际交付SHA/结果记录到PR正文。
