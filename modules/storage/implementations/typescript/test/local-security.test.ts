import assert from 'node:assert/strict';
import {it} from 'node:test';
import {mkdtemp, rm, readFile, writeFile, unlink, readdir, symlink, link, chmod, rename, mkdir, lstat, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn, fork} from 'node:child_process';
import {once} from 'node:events';
import {createLocalAdapter, createStorage} from '../src/index.js';
import {localFixture} from './local-fixture.js';
import {content, errorIs, source, text} from './helpers.js';
const objectPath = (root: string, key: string) => join(root, 'objects', createHash('sha256').update(key).digest('hex'));

it('TEST-001/013: private root, manifest binding, restart and cursor instance isolation', async t => {
  const f = await localFixture();
  await f.storage.put('a', source('persist')); await f.storage.put('b', source('B'));
  const cursor = (await f.storage.list({pageSize: 1})).nextCursor!;
  const manifest = await readFile(join(f.root, 'manifest.json'), 'utf8');
  await assert.rejects(createLocalAdapter({root: f.root, namespace: 'local-test'}), errorIs('unavailable'));
  await f.adapter.close();
  await assert.rejects(createLocalAdapter({root: f.root, namespace: 'other'}), errorIs('integrity-error'));
  const adapter = await createLocalAdapter({root: f.root, namespace: 'local-test'}); t.after(async () => {await adapter.close(); await rm(f.root, {recursive: true, force: true});});
  const s = createStorage({adapter, namespace: 'local-test'});
  assert.equal(await content(s, 'a'), 'persist');
  assert.equal(await readFile(join(f.root, 'manifest.json'), 'utf8'), manifest);
  await assert.rejects(s.list({cursor}), errorIs('invalid-cursor'));
  assert.equal((await lstat(f.root)).mode & 0o777, 0o700);
  assert.equal((await lstat(objectPath(f.root, 'a'))).mode & 0o777, 0o600);
});
it('TEST-013: nonempty foreign root, missing/malformed/unknown manifest and unsafe modes fail without repair', async () => {
  for (const variant of ['foreign', 'missing', 'malformed', 'unknown', 'duplicate', 'mode']) {
    const root = await mkdtemp(join(tmpdir(), 'apf-reject-'));
    try {
      if (variant === 'foreign') await writeFile(join(root, 'unrelated'), 'keep', {mode: 0o600});
      else {
        const adapter = await createLocalAdapter({root, namespace: 'test'}); await adapter.close();
        const path = join(root, 'manifest.json');
        if (variant === 'missing') await unlink(path);
        if (variant === 'malformed') await writeFile(path, '{');
        if (variant === 'unknown') await writeFile(path, JSON.stringify({...JSON.parse(await readFile(path, 'utf8')), extra: true}));
        if (variant === 'duplicate') await writeFile(path, (await readFile(path, 'utf8')).replace('{', '{"formatVersion":2,'));
        if (variant === 'mode') await chmod(root, 0o755);
      }
      await assert.rejects(createLocalAdapter({root, namespace: 'test'}), errorIs('integrity-error'));
      if (variant === 'foreign') assert.equal(await readFile(join(root, 'unrelated'), 'utf8'), 'keep');
      if (variant === 'mode') assert.equal((await lstat(root)).mode & 0o777, 0o755);
    } finally {await rm(root, {recursive: true, force: true});}
  }
});
it('TEST-001/013: object symlink, hardlink and FIFO reject without following or blocking', async t => {
  const f = await localFixture(); t.after(() => f.dispose());
  await f.storage.put('item', source('secret'));
  const path = objectPath(f.root, 'item'), saved = join(f.root, 'tmp', 'saved');
  await rename(path, saved); await symlink(saved, path);
  await assert.rejects(f.storage.get('item'), errorIs('integrity-error')); await unlink(path);
  await link(saved, path);
  await assert.rejects(f.storage.head('item'), errorIs('integrity-error')); await unlink(path);
  const child = spawn('mkfifo', ['-m', '600', path]); assert.equal((await once(child, 'exit'))[0], 0);
  await assert.rejects(f.storage.get('item', {timeoutMs: 1000}), errorIs('integrity-error')); await unlink(path);
  await rename(saved, path);
  assert.equal(await content(f.storage, 'item'), 'secret');
});
it('TEST-010/013: strict envelope rejects corrupt UTF8, header, key/digest, size and trailing bytes', async t => {
  const f = await localFixture(); t.after(() => f.dispose());
  await f.storage.put('item', source('body'));
  const path = objectPath(f.root, 'item'), good = await readFile(path);
  const length = good.readUInt32BE(8), h = JSON.parse(good.subarray(12, 12 + length).toString());
  const modified = (field: object) => {const header = Buffer.from(JSON.stringify({...h, ...field})); const prefix = Buffer.from(good.subarray(0, 12)); prefix.writeUInt32BE(header.length, 8); return Buffer.concat([prefix, header, Buffer.from('body')]);};
  const badUtf = Buffer.from(good); badUtf[12] = 0xff;
  const huge = Buffer.from(good); huge.writeUInt32BE(65537, 8);
  const duplicateHeader = Buffer.from(good.subarray(12, 12 + length).toString().replace('{', '{"sizeBytes":99,'));
  const dupPrefix = Buffer.from(good.subarray(0, 12)); dupPrefix.writeUInt32BE(duplicateHeader.length, 8);
  const duplicate = Buffer.concat([dupPrefix, duplicateHeader, Buffer.from('body')]);
  for (const bad of [Buffer.from('bad'), badUtf, huge, duplicate, Buffer.concat([good, Buffer.from('extra')]), good.subarray(0, good.length - 1), modified({extra: 1}), modified({key: 'other'}), modified({sizeBytes: -1}), modified({revision: 'etag'}), modified({metadata: {'invalid_key': 'x'}}), modified({formatVersion: 2})]) {
    await writeFile(path, bad); await assert.rejects(f.storage.get('item'), errorIs('integrity-error'));
  }
  await writeFile(path, good);
  assert.equal(await content(f.storage, 'item'), 'body');
});
it('TEST-001/013: initial root/internal directory symlinks, files and modes reject; tmp identity is checked', async () => {
  for (const name of ['objects', 'tmp']) for (const variant of ['symlink', 'file', 'mode']) {
    const f = await localFixture(); await f.adapter.close();
    const backup = await mkdtemp(join(tmpdir(), 'apf-dir-backup-'));
    try {
      const path = join(f.root, name), old = join(backup, 'saved');
      if (variant === 'mode') await chmod(path, 0o755);
      else {await rename(path, old); if (variant === 'file') await writeFile(path, 'x', {mode: 0o600}); else await symlink(old, path);}
      await assert.rejects(createLocalAdapter({root: f.root, namespace: 'local-test'}), errorIs('integrity-error'));
    } finally {await rm(f.root, {recursive: true, force: true}); await rm(backup, {recursive: true, force: true});}
  }
  const f = await localFixture();
  try {await rename(join(f.root, 'tmp'), join(f.root, 'tmp-old')); await mkdir(join(f.root, 'tmp'), {mode: 0o700}); await assert.rejects(f.storage.put('x', source('x')), errorIs('integrity-error')); await f.adapter.close();}
  finally {await rm(f.root, {recursive: true, force: true});}
});
it('TEST-013: replaced directory/manifest/lock identities fail closed and never unlink an unknown lock', async () => {
  for (const variant of ['objects', 'manifest', 'lock']) {
    const f = await localFixture();
    try {
      if (variant === 'objects') {await rename(join(f.root, 'objects'), join(f.root, 'old-objects')); await mkdir(join(f.root, 'objects'), {mode: 0o700});}
      else {
        const path = join(f.root, variant === 'lock' ? 'writer.lock' : 'manifest.json');
        const data = await readFile(path); await rename(path, path + '.old'); await writeFile(path, data, {mode: 0o600});
      }
      await assert.rejects(f.storage.list(), errorIs('integrity-error'));
      if (variant === 'lock') {await assert.rejects(f.adapter.close(), errorIs('integrity-error')); await access(join(f.root, 'writer.lock'));}
      else await f.adapter.close();
    } finally {await rm(f.root, {recursive: true, force: true});}
  }
});
it('TEST-003/007/013: early return, dormant timeout and close cancel snapshots and input, retaining stored data', async t => {
  const f = await localFixture(); t.after(() => rm(f.root, {recursive: true, force: true}));
  await f.storage.put('item', source('body'));
  const first = await f.storage.get('item'); await first.body.return?.();
  const expired = await f.storage.get('item', {timeoutMs: 25});
  await new Promise(resolve => setTimeout(resolve, 40)); await assert.rejects(expired.body.next(), errorIs('timeout'));
  const read = await f.storage.get('item');
  const started = new Promise<void>(resolve => {
    async function* blocked() {yield Buffer.from('x'); resolve(); await new Promise<void>(() => {});}
    const put = f.storage.put('other', blocked()); void assert.rejects(put, errorIs('aborted'));
  });
  await started; await f.adapter.close({timeoutMs: 1000});
  await assert.rejects(read.body.next(), errorIs('aborted'));
  const next = await createLocalAdapter({root: f.root, namespace: 'local-test'});
  assert.equal(await content(createStorage({adapter: next, namespace: 'local-test'}), 'item'), 'body'); await next.close();
  assert.deepEqual(await readdir(join(f.root, 'tmp')), []);
});
it('TEST-013: controlled process SIGKILL at staging/before/racing/after rename exposes only complete records', {timeout: 15000}, async () => {
  for (const phase of ['during-staging', 'before-rename', 'race-rename', 'after-rename']) {
    const root = await mkdtemp(join(tmpdir(), 'apf-crash-'));
    try {
      const adapter = await createLocalAdapter({root, namespace: 'crash-test'});
      const s = createStorage({adapter, namespace: 'crash-test'}); await s.put('record', source('old complete value')); await adapter.close();
      const child = fork(new URL('./local-crash-worker.js', import.meta.url), [root, phase], {stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
      const exited = once(child, 'exit'); await once(child, 'message'); child.kill('SIGKILL'); await exited;
      await assert.rejects(createLocalAdapter({root, namespace: 'crash-test'}), errorIs('unavailable'));
      // Test-owned root only, after observed worker death. Runtime has no stale-lock recovery API.
      await unlink(join(root, 'writer.lock'));
      const restarted = await createLocalAdapter({root, namespace: 'crash-test'});
      const value = await content(createStorage({adapter: restarted, namespace: 'crash-test'}), 'record');
      assert(phase === 'race-rename' ? ['old complete value', 'new complete value'].includes(value) : value === (phase === 'after-rename' ? 'new complete value' : 'old complete value'));
      assert.equal((await createStorage({adapter: restarted, namespace: 'crash-test'}).list()).items.length, 1);
      const residual = await readdir(join(root, 'tmp')); assert(residual.length > 0);
      await restarted.close(); assert.deepEqual(await readdir(join(root, 'tmp')), residual);
    } finally {await rm(root, {recursive: true, force: true});}
  }
});
