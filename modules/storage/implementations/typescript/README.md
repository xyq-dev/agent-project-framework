# TypeScript Storage Reference

私有参考包，Core/Memory/Local/OSS 初始 profile 已实现；112 项本地/离线测试通过。独立实施复核消息已完成；正式 Gate 与真实 OSS 验证未完成；状态和逐项测试见 [实施报告](../../STORAGE_M1_B_IMPLEMENTATION_REPORT.md)。

Node 24.x，TypeScript strict ESM；OSS 使用精确锁定的 ali-oss 6.23.0。Core 不导入 Provider SDK，SDK 只在创建 OSS adapter 时加载。

## 运行

在本目录执行：

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
```

独立检查：`npm run build`、`npm run test:contract`、`npm run test:failure`、`npm run test:security`。构建文件和依赖不提交到 Git。

## 示例

构建后，在本目录保存为一个 .mjs 文件运行：

```js
import {createStorage, createMemoryAdapter} from './dist/src/index.js';

const storage = createStorage({
  namespace: 'example',
  adapter: createMemoryAdapter({namespace: 'example'}),
});
const info = await storage.put('notes/hello.txt', {
  async *[Symbol.asyncIterator]() {
    yield new TextEncoder().encode('Hello APF');
  },
}, {contentType: 'text/plain'});

const read = await storage.get(info.key, {ifRevision: info.revision});
try {
  for await (const chunk of read.body) process.stdout.write(chunk);
} finally {
  await read.body.return();
}
```

Memory/Local 默认写入只允许创建；覆盖必须指定 `overwrite: true`，可同时提供 `condition: {kind: 'if-revision', revision}`。copy 只支持同一 binding，保留 metadata 并生成新 revision。

## Memory 能力与边界

支持 put/get/head/exists/delete/list、metadata、能力发现、copy、range-read、conditional-read/write/delete。move、两种 signed URL、multipart 返回 `unsupported-capability`。

默认对象上限 16MiB、总受控缓冲 64MiB、最多 10000 对象；已打开旧快照也占用预算。自定义 Adapter 的上限更小时，应给 `createStorage` 传入与之匹配的 limits。

Memory 数据仅存在于当前实例/进程。流需消费或显式关闭，最长运行时间由 deadline 限制。Observer 是最多 16 个未结算调用的有界尽力通知，不能充当可靠审计。鉴权由宿主完成。

此包未发布；采用 APF 项目模板不会自动安装或复制它。作者测试不代表独立安全审查或生产验收通过。


## Local 使用与关闭

```js
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalAdapter, createStorage} from './dist/src/index.js';

const root = await mkdtemp(join(tmpdir(), 'apf-example-')); // 新建专属 0700 目录
const adapter = await createLocalAdapter({namespace: 'example', root});
const storage = createStorage({adapter, namespace: 'example'});
try {
  await storage.put('hello.txt', {async *[Symbol.asyncIterator]() {yield Buffer.from('Hello');}});
} finally {
  await adapter.close(); // 保留已写数据；显式等待取消、实际 I/O/FD 关闭和 writer lock 释放
}
```

仅 Node24/Linux 普通本地文件系统；root/祖先可信，root 与内部目录归有效 UID 且 0700，文件 0600。初始 root 必须为空；重开只接受本实现合法 manifest 与相同 namespace。使用 SHA256(key) 文件名与严格单 envelope，不直接把 key 作为路径。

默认对象 16MiB、对象数 10000、live staging 128MiB、并发 lease 16；get 的 lease 保持到 body 完成/关闭/超时。可用 maxObjectBytes/maxObjects/maxStagingBytes/maxInFlight 调整有界策略；更小对象上限应同步传给 createStorage。

close 超时保留锁且禁止新操作；后台 I/O settle 不自动解锁，宿主可以显式再次 close 等待完成。实例 rename/unlink 不确定失败后需 close 并重开重建索引。发生进程崩溃时，宿主必须先确认所有使用该 root 的进程已退出、备份并核验 root 归属，再人工处理 writer.lock；没有自动 stale-lock stealing/目录修复/扫描删除功能。历史 tmp 不参与 list，不自动清除；应纳入磁盘空间运维。SIGKILL 测试不等于断电耐久性/NFS/恶意同机写入者隔离。

输入源的 `next()` 和协作 `return()` 必须实际结束后才释放 staging/lease。公共调用可以先返回 aborted/timeout；如果宿主输入源永久阻塞，adapter.close 会超时并保留锁，需结束旧进程后按恢复流程处理。Memory 同样保留尚未结束输入占用的缓冲预算。

文件或目录 handle.close 一旦报错，该实例停止接收新操作；不会再次 close 同一 handle，也不通过数字 FD 猜测清理成功。失败发生在解锁前时，重复 adapter.close 仍报错并保留写锁；对应临时文件与预算保持占用。最后解锁已 unlink 后的目录 sync/close 失败会报错，但不能恢复已经移除的锁；此时所有操作资源已先完成关闭，宿主仍应核验磁盘与 root 状态。

## OSS 使用与受支持能力

宿主提供已有 Versioning=Enabled 的测试/应用 bucket、region（如 oss-cn-hangzhou）、namespace、独立可信 spoolRoot（0700）和异步 credentials provider。adapter 不创建 bucket、不改 ACL/版本状态、不读环境凭据或背景刷新。

```js
import {createOssAdapter, createStorage} from './dist/src/index.js';
// hostOptions 由应用安全配置注入：namespace, region, bucket, spoolRoot, credentials。
// credentials({purpose, signal}) 返回 {accessKeyId, accessKeySecret, securityToken?, expiresAt?}。
// STS token 必须携带大于 60 秒裕量的 future expiresAt；推荐由宿主提供短期凭据。
const adapter = await createOssAdapter(hostOptions);
const storage = createStorage({adapter, namespace: hostOptions.namespace});
try {
  await storage.put('hello.txt', {async *[Symbol.asyncIterator]() {yield Buffer.from('Hello');}}, {overwrite: true});
} finally {await adapter.close();}
```

这是需补入 hostOptions 的集成片段，不能把凭据填入仓库或聊天。宿主先完成业务授权再调用 Storage。

| 能力 | Memory / Local | OSS 初始 profile |
| --- | --- | --- |
| put/get/head/exists/delete/list/metadata/capabilities/copy | 支持 | 支持；put/copy 仅显式 overwrite:true |
| range-read / conditional-read | 支持 | 支持；比较同一当前响应的 versionId |
| conditional-write / conditional-delete | 支持 | 不支持；默认 put/copy 与任何目标条件在源/凭据/网络前拒绝 |
| signed upload/download / move / multipart | 不支持 | 不支持 |

不要用 HEAD+PUT 模拟 OSS 原子创建或 CAS。revision 为服务端版本 ID，缺失/null 令实例失效；PUT 后使用确切 versionId HEAD 确认，确认失败 unknown，不重试或补偿删除。delete 只隐藏当前对象，历史版本仍存在。

物理前缀 apf-storage/v1/SHA256(namespace)/objects/；保留 metadata 标记验证格式/namespace/binding/key，用户 metadata 按 ASCII key 排序后编码成独立 canonical base64url JSON（编码上限6144B，解码后仍为2KiB规则）；namespace/key 标记是带 apf-storage/v1 和用途域分隔的 SHA256 base64url 摘要。最大合法 key 不因 namespace 编码而超出 provider 长度；拒绝未带本格式标记的读取、OSS symlink、异常编码/Range/长度。list 以最多4并发 HEAD 补完整信息。

默认 live staging 128MiB、并发16、对象16MiB；完整源验证后才取凭据/PUT，实际网络和文件 I/O 结束后才清理自己文件。SDK 使用官方 V4 signer/XML parser 与专用 HTTPS transport，关闭重试、代理、重定向；所有调用错误和观察事件脱敏。不要在在途操作期间动态开启 ali-oss debug；adapter 在初始化/每次凭据和 dispatch 前拒绝已开启的真实 SDK debug namespace。

OSS staging 也等待输入源 next/return 结束；关闭失败后实例不可复用，临时文件不会被当作已清理。spoolRoot 由宿主独占管理，不允许把尚未关闭实例的目录交给另一个实例。

## OSS 验证边界

npm test 包含34项 OSS 离线测试，执行官方 SDK + 真实 loopback HTTP socket；不调用阿里云。Work Mode 无接口枚举能力，仅测试首次加载 SDK 未使用 ClusterClient 时 mock 空网络接口并立即 restore，生产 src 不含 shim。

真实云 smoke 函数位于 [test/oss-cloud-smoke.ts](test/oss-cloud-smoke.ts)，编译后可由宿主专用 runner 显式调用 verifyOssCloud(options, cleanupExactVersions)。它只对随机唯一逻辑 key 做9项实际 smoke 检查，cleanup 回调仅接收本次成功记录的 physicalKey/versionId；宿主必须提供真实测试范围授权与精确版本清理，不能扩大为批量/全桶删除。调用方需处理 unknown PUT 的人工核对；它不覆盖完整 IAM/TLS/delete-marker/故障矩阵。

verify 或 adapter.close 失败仍会尝试精确版本 cleanup；多个失败以 AggregateError 保留，不能只因 cleanup 成功就报告 smoke PASS。离线验证了该退出控制和 DNS lookup、TLS 握手等待、部分上传的实际 request/socket 取消；握手取消不证明证书校验、真实 OSS 或 IAM 已验收。

当前真实 OSS NOT_RUN；独立代码复核和112项复测已完成，正式报告追加前额度中断；正式 Gate 仍 PENDING。不能把本参考包当作已经完成生产验收的存储服务。
