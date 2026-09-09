# STORAGE_M1_B_IMPLEMENTATION_REPORT

更新：2026-09-09 UTC。当前增量包含 M1-C Local 和用户授权的 OSS 首版。**四层初始 profile 代码已实现；104 项测试通过。最终独立实现审查、真实 OSS 验证与整体验收未完成。**

## 执行与基线

- 仓库：xyq-dev/agent-project-framework；main 基线 `a6556a41ee7bd35007cc9226b40c9679c8bdf3bc`。
- 交付分支：`feat/storage-runtime-v0.1`；[草稿 PR #3](https://github.com/xyq-dev/agent-project-framework/pull/3)。本次父提交 `81a49ccaeea334a346fe639a937db37d0ac27ddf`；前序 Core/Memory 提交 `1b3bf0b7a1f4e09ec70d24a997b6c3baa915617e`。
- 工作区是 GitHub API 文件镜像，无本地 `.git`。开工前核验 92 个远端文件与基线，保留此前设计审查文档修改。实际新提交和回读见 PR 与 STATUS，不声称执行 git checkout。
- 实现与作者自检：当前 Codex；未调用 Cursor。用户明确授权一个独立安全审查 Agent，使用 `storage_security_review` / GPT-5.6 Sol 极高路线；没有自行扩大 Agent 数量。
- 初始 Local/OSS 设计 PASS 由独立 reviewer 留痕后才开始代码。最终复核过程中 Agent 报额度用尽；历史结论保留，**实现者不补写独立 PASS**。

## 任务结果

| Task | 当前结果 | 证据与边界 |
| --- | --- | --- |
| ST-001～004 | COMPLETE | 原 Core/Memory 43 项继续通过；新增内部 Context.cancel 支持 adapter 生命周期，公共 Storage 消费 API 不变 |
| ST-005 | DESIGN PASS | [独立记录](INDEPENDENT_SECURITY_REVIEW.md) L-001～L-007；namespace manifest、锁生命周期、FD snapshot、原子 envelope、清理与恢复 |
| ST-006 | IMPLEMENTED / TESTED | Local 29 项；global publication mutex 比同 key 锁更严格地串行化写入/删除；最终独立实施复核待完成 |
| ST-007 | BLOCKED | 独立最终 Security 与 acceptor 决策未完成；不把作者测试视为验收 |
| OSS-001 | DESIGN PASS | O-001～O-009 保守能力 profile |
| OSS-002/003 | IMPLEMENTED / OFFLINE TESTED | 官方 ali-oss 6.23.0、V4 signer/XML parser、窄 HTTPS transport、完整磁盘 staging、版本确认、GET/HEAD/delete/list/copy |
| OSS-004 | DEFERRED BY APPROVED PROFILE | 签名下载端口后续单独审查；两种 signing、move、multipart 均明确 false，无假成功实现 |
| OSS-005 | OFFLINE PASS / CLOUD NOT_RUN | 32 项 SDK+loopback 测试；[真实云 smoke 入口](implementations/typescript/test/oss-cloud-smoke.ts)未调用，无授权测试 bucket/namespace/凭据 |

## 实现说明

Local 使用固定内部目录、SHA256 逻辑键文件名和单一 envelope；root 的 manifest 永久绑定 namespace。目录 0700、文件 0600、有效 UID、no-follow、inode、单链接普通文件、strict JSON/UTF-8/长度均验证。完整 staging 后 fsync，串行检查条件再 rename；metadata/body 同 FD 读取。close 拒绝新操作、取消旧 context/流，等待实际 I/O 与 close 完成，再核验锁 inode/token；超时保留锁，后台 settle 不自动解锁，宿主显式重试 close 才可完成。rename/unlink 不确定失败后实例失效，需关闭重开重建索引。

OSS 使用固定官方 HTTPS origin、bucket/region/namespace 和 `apf-storage/v1/SHA256(namespace)/objects/key`；最长合法 namespace+key 不会因编码前缀超长而丢失公共契约。用户 metadata 独立 canonical base64url JSON，格式/namespace/binding/key digest 为保留标记；拒绝 foreign/symlink/gzip/无效版本响应。写前完整验证来源与实际长度，再取宿主凭据；PUT 成功只 HEAD 其确切版本，验证返回 info。当前条件读不读取历史版本冒充当前。HEAD404 只在 GET 明确 NoSuchKey 后作为不存在；list 用最多 4 并发当前 HEAD 补 metadata，保留 provider 顺序与空页续页。

SDK 和 transport 均不重试 mutation；Core 只对可重试读取最多 2 次。窄 transport 固定方法/URL/query，正常生产 TLS、无 proxy/redirect，成功 XML 4MiB、错误 64KiB，取消销毁实际 request/response/socket。每次获取凭据和注入/dispatch 前检查真实 SDK debug namespace；不修改宿主日志配置。宿主不得在请求执行中动态开启 SDK debug。

## 真实执行的测试

环境：Linux x64、Node 24.19.0、npm 11.9.0、TypeScript 5.9.3、@types/node 24.13.3；私有 ESM 包。安装脚本禁用；依赖精确锁定。

| Command | Result | Counts |
| --- | --- | --- |
| npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000 | PASS / exit 0 | 重装锁定依赖 |
| npm run typecheck | PASS / exit 0 | strict/noEmit |
| npm run build | PASS / exit 0 | src/test 全量编译 |
| npm test | PASS / exit 0 | **104 tests, 104 pass, 0 fail/skip/cancel** |
| npm run test:contract | PASS / exit 0 | 42：同一 suite 在 Memory/Local/OSS 各 14 项；OSS 条件能力为明确拒绝断言 |
| npm run test:failure | PASS / exit 0 | 37 |
| npm run test:security | PASS / exit 0 | 25 |
| npm audit --omit=dev --json | PASS / exit 0 | 当前数据库报告已知漏洞 0；不是无漏洞承诺 |
| node modules/storage/validation/validate-spec.cjs | PASS / exit 0 | 10 组、13 个阴性 fixture、14 个映射；Ajv8.20.0/js-yaml4.1.1 |
| node validation/validate-standard.cjs | PASS / exit 0 | 9 组、9 个阴性 fixture、46 个 bootstrap 目标；仅内存模拟 |

分组执行是同一批 104 项，不重复计数。按 Adapter：Core/Memory 43、Local 29、OSS 离线 32。完整命令与 31 个源码/测试/包文件 SHA256 见 [runtime-results.json](validation/runtime-results.json)。14 个通用 TEST/AC 的 Memory/Local 结果见 [cases.yaml](validation/cases.yaml)。

| 覆盖组 | 实际关键断言 |
| --- | --- |
| TEST-001/012/014 | key/配置校验、无副作用拒绝、严格依赖锁、Core 无 Provider SDK/环境读取；模块支持与代码路径一致 |
| TEST-002/004/008 | create/CAS/copy 竞争仅一胜者（Memory/Local）；OSS 不支持条件提前拒绝；长度/来源/预算失败不发布残缺对象 |
| TEST-003/010 | 旧 snapshot 跨覆盖/删除；metadata 绑定、版本更新、Range、损坏文件/响应拒绝、早退与未消费超时 |
| TEST-005/006 | 分页作用域、prefix/binding、流式复制；OSS list 有界补全、空页带 cursor、foreign/畸形 XML 拒绝 |
| TEST-007/009/011 | no fake signer/move/multipart；unknown outcome、读重试最多 2 次、mutation 单次；凭据轮换/过期、debug 拒绝、真实 socket 关闭 |
| TEST-013 Local | namespace 重开、root/内部目录/文件 symlink/权限/硬链接/FIFO、重复 JSON/非法 header、manifest/lock 替换、配额、晚到 open/read/rename/unlink/dirsync、close 重试；4 个受控 SIGKILL 阶段恢复 |

首轮实际失败已修：manifest 错误分类与清理顺序；SDK unused ClusterClient 导入需要下述测试环境 shim；HEAD503 无正文不能识别 SlowDown，改为含 XML 的 GET 验证明确 rate-limit；畸形 list XML 统一 integrity-error；落实独立 I-002 的带域/版本 SHA256 base64url 标记，并补齐2KiB引号/反斜线 metadata 的编码膨胀上限与重复大小写 header 拒绝。最终上述命令均通过，无已知未解决测试失败。

## 独立复核与剩余事项

- 独立 reviewer 已完成设计并自行运行过 Local 首轮 26/26 测试；提出重复 JSON、发布前 temp inode 核验、pending read/unlink/dirsync 与目录矩阵证据，作者已修复/补测。该首轮记录不能冒充后续全部代码复核。
- **最终 Local/OSS 实现 Security Review：PENDING**。工具返回 Agent usage limit，后续会话无法恢复 live Agent；尚未对最终 104 项/31 文件做独立结论。下一位独立 reviewer 从现有记录及差异继续，不重做已通过设计。
- **真实 OSS：NOT_RUN**。没有授权测试 bucket/namespace/凭据；未读取用户环境 Secrets，也未接触其他业务项目的 OSS。
- smoke 入口需显式传入测试 OssOptions 与只清理该次记录版本的 host callback；它覆盖 9 项 smoke 行为，**不等于完整云验收**。若 PUT outcome unknown，宿主需针对该次唯一逻辑 key 人工核对；不扩大为全桶扫描/删除。
- 补充未完成的高风险验证：最终审查应核验 FD close 异常时的资源/锁保留、上传 DNS/connect/流中途取消的阶段矩阵、生产 TLS/IAM 拒绝、OSS delete marker/历史版本清理及真实服务端错误差异。现有离线 socket 测试与静态代码不代替这些证据。
- 签名上传/下载、move、multipart 明确未开放；登录、配置、审计、业务权限、媒体、通知、支付等蓝图不属于本次 Runtime 交付。

## 兼容性与测试限制

Local 只支持 Node 24/Linux、普通本地文件系统、当前有效用户独占可信 root。无 NFS、多主机/敌对同机写入者或管理员隔离、断电耐久性承诺。默认单对象 16MiB、最多 10000 对象、staging 128MiB、16 个并发 lease；持久存储总量由宿主磁盘配额管理，不称为进程 RSS 上限。Memory 默认 64MiB 受控缓冲，旧 snapshot 同样计费。

OSS 需要 bucket 已为 Versioning Enabled，不代为开启。每个实例 staging 默认 128MiB/16 lease；OSS 仅允许显式覆盖 put/copy；无条件 delete 仅删除当前可见对象，不擦除历史版本。实例会在无效 versionId 时失效；重建时重新验证版本配置。

Work Mode 沙箱阻止 os.networkInterfaces 枚举；官方 SDK 的未使用 ClusterClient 在 import 时调用它。**仅离线测试**首次同步加载 SDK 时临时返回空接口表，并 finally 恢复/断言原函数；src 无此补丁。HTTP loopback 测试真实传输/关闭 socket，但不验证 TLS、真实 OSS/IAM 或生产 SDK 启动环境。真实云入口没有该 shim。

## Gate 与交付

Implementation 出口：PASS（批准初始 profile 的代码/作者测试/追踪齐备），状态进入 TESTING。Test：本地与离线证据 PASS，扩展云范围 PARTIAL；Security/Acceptance/Release：PENDING。无 Gate override。

工作仅交付专题分支和草稿 PR；不合并 main，不 pack/npm publish/Tag/Release/部署。采用标准模板不复制此 Runtime，不继承任何测试/Gate。回滚为使用此前已知参考提交；Local 不自动迁移/修复/清空 root，崩溃锁必须由宿主确认旧进程已停止后人工处理。
