# Storage Verification Plan — 0.1.0-dev

## Three Different Evidence Levels

1. **M1-A static validation**：Schema、artifact path、ID/状态/依赖/需求—测试—验收映射；本次可执行。
2. **M1-B/C runtime tests**：真实 ByteSource、对象、snapshot、并发、filesystem；当前 NOT_RUN。
3. **Cloud integration**：签名使用、IAM/error 差异、Provider-specific conditional 行为；当前 DEFERRED，不能借 Memory mock 宣称通过。

机器可读用例在 [validation/cases.yaml](validation/cases.yaml)，与以下 ID 一致；“有用例”不是“已通过”。

## Traceability Matrix

| Test ID | Requirement | Acceptance | Scenario and expected result |
| --- | --- | --- | --- |
| TEST-001 | REQ-001 | AC-001 | 拒绝 `../a`, `a//b`, `a/./b`, `/a`, `a%2fb`, backslash、非 NFC、孤立 surrogate；普通 Unicode key 保留大小写；未触发 Adapter。 |
| TEST-002 | REQ-002 | AC-002 | 空对象；默认覆盖竞争两写恰好一成功；显式 overwrite；length 不符、16MiB+1、流失败不替换旧对象；内存预算耗尽不驱逐。 |
| TEST-003 | REQ-003 | AC-003 | get/head info 对应 bytes；并发覆盖后旧读流仍为旧版本；不存在 false，permission/auth/timeout 仍抛错；提前结束释放 handle。 |
| TEST-004 | REQ-004 | AC-004 | 缺失单 key delete 成功，prefix 不能递归；ifRevision 不符/已缺失报 precondition-failed，新版不会被旧条件删除。 |
| TEST-005 | REQ-005 | AC-005 | 多页静态集合恰好完整一次；空页带 cursor 继续；scope/prefix/cursor 注入和 pageSize>1000 拒绝；其它 namespace 不可见；>10000 对象拒绝无界扫描。 |
| TEST-006 | REQ-006 | AC-006 | copy 保留 bytes+contentType+metadata、生成新 revision；源缺失/中途失败不变目标；同 key 拒绝；目标条件并发不被绕过。 |
| TEST-007 | REQ-007 | AC-007 | M1 move=false，调用在 read/write/delete 计数均为 0 时拒绝；真实部分移动/恢复正例留到开启该能力前。 |
| TEST-008 | REQ-008 | AC-008 | Range [1,3] 返回3 bytes，end越界截断、start越界/空对象异常；能力 false 不消费流；ifRevision 失败；capability 返回值外部修改不影响内部。 |
| TEST-009 | REQ-009 | AC-009 | 无 signer 的两种 URL 请求及 multipart 返回 unsupported-capability，零网络/credential 消费，不返回伪 URL；正例需未来真实 Provider。 |
| TEST-010 | REQ-010 | AC-010 | 2KiB metadata 边界、ASCII/control/key大小限制；替换不合并旧 map；revision 不复用、etag 不作 checksum；外部改返回 map 不污染存储。 |
| TEST-011 | REQ-011 | AC-011 | 提交前/后故障、deadline/abort、get流中途失败、read重试<=2 attempts、mutation=1 attempt、outcome unknown、Observer抛错不改结果/挂起调用最多16个、日志不含 canary secret/key。 |
| TEST-012 | REQ-012 | AC-012 | 无 config/audit module、禁用 Observer仍能全流程；Core 不 import Provider SDK 或读环境；namespace binding 不被外部 options 改写。 |
| TEST-013 | REQ-013 | AC-013 | 独立 tmp root 的 symlink/恶意 lock/截断 header/二实例锁竞争都拒绝；发布前后 kill worker 后重启读取完整版本；tmp 不在 list，清理不碰无关文件。 |
| TEST-014 | REQ-014 | AC-014 | package private、依赖锁定、Core 类型中无云 SDK、无 DB/migration/HTTP 服务；typecheck/build成功，manifest支持范围与实测一致。 |

## Runtime Matrix

| Profile / Adapter | State today | Required runs |
| --- | --- | --- |
| Node 24.x / Memory | NOT_IMPLEMENTED | ST-004: TEST-001..012/014，包含 failure/security 子集 |
| Node 24.x / Local Linux | NOT_IMPLEMENTED | ST-007: 同上 + TEST-013、进程恢复、独立安全 review |
| Fake failure adapter | PLANNED | 仅为错误注入，不作为生产 Provider，不代替真实 Local 行为 |
| S3 / R2 / OSS / COS / MinIO | DEFERRED | 授权测试 namespace，签名/条件语义单独验收 |

N/A：HTTP UI/E2E（无对外服务）、数据库测试/Migration（无数据库）。未适用不等于所有 Runtime 测试均 N/A。

## Static Check Commands

验证脚本是模块专用开发检查，不是 APF CLI、Resolver 或 Runtime 实现。

```sh
node modules/storage/validation/validate-spec.cjs
```

依赖为 `ajv` 8（2020-12）与 `js-yaml` 4。使用环境已有包；干净环境可在临时目录安装并把该目录的 `node_modules` 加入 NODE_PATH，勿往仓库根添加 package。精确执行版本记录在 REVIEW 中。脚本只检查静态文档/Schema/fixture，不尝试网络或实际对象存储。

## Future Runtime Commands

ST-001 必须建立下列 package scripts；**现在不要运行或把不存在的脚本记为 PASS**。

```sh
npm --prefix modules/storage/implementations/typescript ci
npm --prefix modules/storage/implementations/typescript run typecheck
npm --prefix modules/storage/implementations/typescript run build
npm --prefix modules/storage/implementations/typescript test
npm --prefix modules/storage/implementations/typescript run test:contract
npm --prefix modules/storage/implementations/typescript run test:failure
npm --prefix modules/storage/implementations/typescript run test:security
```

首个依赖锁文件建立前用 npm install，后续只用 ci；不得将 install 与 ci 成功当行为测试成功。Local 所有测试隔离在新临时 root，没有生产资源，失败清理也要核验归属。

## Results and Gaps

本次静态结果见 [REVIEW.md](REVIEW.md)；所有 Runtime Cases 仍 NOT_RUN，Implementation/Test/Security/Acceptance/Release Gate 不能据静态检查通过。

signed URL 正例（headers/TTL/replay/credential expiry）、guarded move 正例/partial failure、multipart session 尚无 Adapter，未来开启能力前必须增加对应真实 Contract Tests；当前明确不支持且有阴性测试任务，不留下空实现。
