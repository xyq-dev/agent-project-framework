# OSS 真实环境验证与交接

日期：2026-09-10 UTC。对象：`storage@0.1.0-dev`，源码提交 `609b32724d70f3e1ce5225a2cb415b0e7918edd4`。**执行状态：NOT_RUN**。

本文件把 OSS-005 剩余工作变成可执行的验收清单；不是云测试结果或云资源授权。已有 34 项 SDK/loopback 测试和 9 项真实云 smoke 入口，后者尚未调用。当前会话只能读写 GitHub，没有 Node/Linux 执行环境，也没有获准的测试资源或凭据注入。源代码、依赖锁和原测试记录未因本文件变化。

## 开始前需要的输入

由维护者 `xyq-dev` 指定测试资源及执行宿主，宿主运维人员核验下表。可在任务中记录非秘密配置；任何 AccessKeySecret、STS token、签名 URL 都不进入聊天、Git、日志或报告。

| 输入 | 必须明确的值或条件 |
| --- | --- |
| 源码与执行环境 | 固定上述源码提交，Node 24.x/Linux、真实网络与正常证书信任；记录实际 Node/npm/OS/SDK 版本。SDK 为 lockfile 中的 ali-oss 6.23.0。 |
| 测试 bucket / region | 专用非生产 bucket；region 为 adapter 接受的 `oss-...` 值；Versioning 已经 Enabled。初始化只查询，不创建或修改 bucket。 |
| namespace / 范围 | 本次独占且事先确认无既有对象的合法 namespace；记录对应物理前缀 `apf-storage/v1/SHA256(namespace)/objects/`，后续只操作本次产生的确切 key/version。 |
| 临时目录 | 宿主新建并独占的可信绝对路径 `spoolRoot`，有效 UID 所有、0700；不复用活动实例或其他项目的目录。 |
| 凭据入口 | 宿主提供 `credentials({purpose, signal})`，返回 `{accessKeyId, accessKeySecret, securityToken?, expiresAt?}`。带 STS token 必须带有效期，按当前实现留足超过 60 秒裕量。记录注入方式，不记录值。 |
| 权限与负例身份 | 已授权的测试读写身份和受限/过期测试身份；权限覆盖实际操作及单独的精确版本核对/清理。权限不足就记录失败，不临时扩权或改 IAM。 |
| 精确版本清理 | 宿主提供 `cleanupExactVersions(created)`，仅删除清单中的 `physicalKey + revision`；普通 delete 不能替代历史版本清理。指定失败后的人工处理责任人。 |
| 故障注入 | 网络/响应丢失等测试只能在另行确认的宿主测试装置中执行；不得降低生产 transport 的 TLS 校验或启用 SDK debug。 |

安全/验收 reviewer 在运行前核对权限和清理范围。若新增 IAM、bucket 设置或故障注入装置变更，另立明确任务；“继续开发”不作为这些资源操作的授权。

## 已有 smoke 如何运行

1. 在获准的 Linux 宿主检出固定源码，并在 `modules/storage/implementations/typescript/` 按 [包 README](implementations/typescript/README.md) 安装锁定依赖、执行 typecheck/build 和离线测试。保留完整汇总，不把退出码或空 suite 当成功。
2. 宿主专用 runner 注入上述 `OssOptions` 与精确版本清理回调，显式导入编译后的 `dist/test/oss-cloud-smoke.js`，调用 `verifyOssCloud(options, cleanupExactVersions)`。接口源码见 [oss.ts](implementations/typescript/src/adapters/oss.ts) 与 [smoke](implementations/typescript/test/oss-cloud-smoke.ts)。
3. 入口创建随机 `verification/<uuid>/source` 和 `copy`，依次检查新 key 确认、PUT 版本确认、GET 快照、当前 HEAD 条件、同字节新版本、旧 revision 拒绝、流式 copy、list 补全和 range，共 9 项。
4. 完整成功、adapter 关闭和精确版本清理均成功后才记 smoke PASS。verify 或 close 失败仍会尝试 cleanup；多项错误以 AggregateError 保留。初始化失败在该 helper 之前，不应假造已创建版本清单。
5. 记录本次实际命令、源码 SHA、执行环境、9 个检查名及清理核验。普通 `npm test` 不会运行真实云入口。本文没有提供带凭据的通用 CLI，也没有声称额外矩阵已有自动化 runner。

## 必需的云端验收矩阵

下表全为 **NOT_RUN**。责任分工：宿主执行者运行并保留证据，独立 reviewer 验证行为，security-reviewer 核验身份/数据控制，acceptor 决定对应 Gate。

| ID | 执行内容与可观察结果 | 必留证据 |
| --- | --- | --- |
| CLOUD-001 | 在真实宿主冷启动官方 SDK，使用正常 TLS 和固定官方 origin；既有 Versioning=Enabled 可初始化。对事先授权且不符合 profile 的环境应 fail-closed，不修改配置。 | 实际环境/SDK 版本、初始化结果、资源范围确认；不使用离线 import shim。 |
| CLOUD-002 | 执行现有 9 项 smoke；服务端 revision 可确认且同字节重写仍产生新 revision；旧条件读取失败；范围和 metadata 保真。 | 九项结果、确切版本清单、关闭及清理结果。 |
| CLOUD-003 | 用预先准备的受限/过期身份，验证无读/写权限、无效凭据、过期 token、不存在 key 的区别；`exists` 只对可信 NoSuchKey 返回 false。 | 每个受限身份的权限范围、操作、公开错误 code/outcome；无误报缺失或权限外写入。 |
| CLOUD-004 | 验证实际证书信任、主机名检查、redirect/proxy 拒绝和取消后的 socket 结束；证书阴性由获准的隔离装置完成，正常真实 OSS 连接证据单列。 | 证书/路由配置摘要及拒绝结果、真实连接结果；本地 TLS 等待取消不能替代这些检查。 |
| CLOUD-005 | 在本次唯一 key 上验证当前对象删除、delete marker、历史版本、list/exists 的真实服务端差异；清理涵盖本次实际创建并核对的版本/marker。 | 当前与历史观察、准确的 key/version/marker 清单；不把当前不可见当全部历史已删除。 |
| CLOUD-006 | 在已批准装置中造成 PUT/DELETE 响应丢失，验证 mutation 不自动重放、不补偿删除、公开 outcome 保持 unknown；核对真实最终状态。 | 派发次数、公开结果、服务端核对和精确恢复结果；注入前已持久记录本次 key 归属。 |
| CLOUD-007 | 验证真实错误响应与分页/并发变化，包括权限/限流/暂时不可用的区别、空但有续页 cursor、不越 namespace、失效版本拒绝。 | 用例/输入边界/期望/实际及请求计数；无法取得的服务端故障仍写 NOT_RUN，不伪装成真实故障。 |
| CLOUD-008 | 正常、断流、取消和失败退出均核验实际请求/流/FD 结束、预算/临时文件归属；关闭失败不掩盖测试失败，云版本清理有独立结果。 | 资源关闭与临时目录核验、清理失败记录和接手人；不得释放或清理仍属于活动实例的目录。 |

即使 CLOUD-002 PASS，也不能使其他项或全模块 Test/Security/Acceptance 自动 PASS。任何必需项失败应修复并复测；不可执行项保持 PENDING，由适用 Gate 规则处理，本文不授予例外。

## unknown 与清理限制

smoke 的清理回调只得到成功记录的版本；PUT 已在服务端生效但确认失败时，可能存在未记录版本。随机 key 在 smoke 内部产生，失败返回也不保证交付完整 key 清单。因此 CLOUD-006 不能只调用现有 smoke 就算恢复测试完成：宿主需在专用故障 runner 中于派发前持久记录本次唯一 key 和资源归属，再注入失败。

正常 smoke 同样先分配本次独占 namespace；若失败后版本清单不完整，停止自动清理，交宿主在已授权的本次物理范围内只读核对、确认具体归属后按确切版本处理。不能猜测版本、全桶扫描/删除，或用清空 namespace 掩盖 unknown。记录遗留资源和责任人，清理失败不能报告成功。

Local/OSS 永久阻塞输入和失败 FD close 的处理遵循 [实施报告](STORAGE_M1_B_IMPLEMENTATION_REPORT.md)：先确认旧进程/实际 I/O 结束，再做人工恢复；不自动解锁或移交活动 spool。

## 结果交付与验收入口

执行者把脱敏证据提交专题分支，逐项记录：ID、日期、源码 SHA、宿主版本、测试资源范围、实际命令/runner、期望与实际、PASS/FAIL/NOT_RUN、错误 code/outcome、重放计数、清理结果、遗留事项 owner。含敏感配置的原始日志留在受控宿主，仓库只保留可审核的脱敏结果及证据索引。

独立 reviewer 按 [Gate 规则](../../.agent-project/gates.yaml) 审查 Test/Security，acceptor 更新 [ACCEPTANCE](ACCEPTANCE.md)；维护者按用户授权决定 main 合并。npm 发布、Tag/Release、部署及生产使用仍须其各自的明确授权。当前缺少的输入为测试 bucket、region、本次 namespace、执行宿主与凭据注入方式、精确版本清理负责人；密钥本身不需要提供给聊天。
