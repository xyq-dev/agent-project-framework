# TypeScript Storage Reference

私有参考包，已实现 Core + Memory。Local/OSS 尚未实现；状态和逐项测试见 [实施报告](../../STORAGE_M1_B_IMPLEMENTATION_REPORT.md)。

Node 24.x，TypeScript strict ESM，无外部 Runtime 依赖。

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

默认写入只允许创建；覆盖必须指定 `overwrite: true`，可同时提供 `condition: {kind: 'if-revision', revision}`。copy 只支持同一 binding，保留 metadata 并生成新 revision。

## 能力与边界

支持 put/get/head/exists/delete/list、metadata、能力发现、copy、range-read、conditional-read/write/delete。move、两种 signed URL、multipart 返回 `unsupported-capability`。

默认对象上限 16MiB、总受控缓冲 64MiB、最多 10000 对象；已打开旧快照也占用预算。自定义 Adapter 的上限更小时，应给 `createStorage` 传入与之匹配的 limits。

Memory 数据仅存在于当前实例/进程。流需消费或显式关闭，最长运行时间由 deadline 限制。Observer 是最多 16 个未结算调用的有界尽力通知，不能充当可靠审计。鉴权由宿主完成。

此包未发布；采用 APF 项目模板不会自动安装或复制它。Core/Memory 的验证不代表 Local、OSS 或生产验收通过。

