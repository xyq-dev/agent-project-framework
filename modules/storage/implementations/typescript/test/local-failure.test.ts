import assert from 'node:assert/strict';
import {it} from 'node:test';
import {rename, readdir, access, rm, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createLocalAdapter} from '../src/index.js';
import {secureOpen, readAll, writeAll} from '../src/adapters/files.js';
import type {FileHandle} from 'node:fs/promises';
import {localFixture} from './local-fixture.js';
import {content, errorIs, latch, source, tick} from './helpers.js';

it('TEST-009/013: live staging and object-count quotas reject without evicting or partial publication', async t => {
  const f = await localFixture({maxStagingBytes: 700, maxObjects: 1}); t.after(() => f.dispose());
  const old = await f.storage.put('old', source('stable'));
  await assert.rejects(f.storage.put('old', source(new Uint8Array(500)), {overwrite: true}), errorIs('limit-exceeded'));
  await assert.rejects(f.storage.put('other', source('x')), errorIs('limit-exceeded'));
  assert.equal((await f.storage.head('old')).revision, old.revision); assert.equal(await content(f.storage, 'old'), 'stable');
  assert.deepEqual(await readdir(join(f.root, 'tmp')), []);
});
it('TEST-007/013: pre-publication ENOSPC and post-publication sync failures preserve truthful outcomes', async t => {
  let phase = 'normal';
  const f = await localFixture({}, {
    async phase(p) {if (phase === 'space' && p === 'staged') throw Object.assign(new Error('private disk path'), {code: 'ENOSPC'});},
    async syncDirectory() {if (phase === 'sync') throw Object.assign(new Error('private disk path'), {code: 'EIO'});},
  }); t.after(() => f.dispose());
  await f.storage.put('old', source('old'));
  phase = 'space'; await assert.rejects(f.storage.put('old', source('new'), {overwrite: true}), errorIs('limit-exceeded', 'not-applied'));
  assert.equal(await content(f.storage, 'old'), 'old');
  phase = 'sync'; await assert.rejects(f.storage.put('old', source('new'), {overwrite: true}), errorIs('provider-error', 'unknown'));
  assert.equal(await content(f.storage, 'old'), 'new');
});
it('TEST-007/013: late rename holds close lock until actual I/O settles; timeout cannot enable a second writer', async t => {
  const dispatched = latch(), finish = latch(); let calls = 0;
  const f = await localFixture({}, {async rename(from, to) {calls++; dispatched.release(); await finish.promise; await rename(from, to);}});
  t.after(() => rm(f.root, {recursive: true, force: true}));
  const put = f.storage.put('late', source('complete'), {timeoutMs: 40});
  const rejected = assert.rejects(put, errorIs('timeout', 'unknown'));
  await dispatched.promise; await rejected;
  await assert.rejects(f.adapter.close({timeoutMs: 10}), errorIs('timeout'));
  await access(join(f.root, 'writer.lock'));
  await assert.rejects(createLocalAdapter({root: f.root, namespace: 'local-test'}), errorIs('unavailable'));
  finish.release(); await tick(); await access(join(f.root, 'writer.lock')); await f.adapter.close({timeoutMs: 1000}); assert.equal(calls, 1);
  const next = await createLocalAdapter({root: f.root, namespace: 'local-test'}); await next.close();
  assert.deepEqual(await readdir(join(f.root, 'tmp')), []);
});
it('TEST-007/013: pending actual read/unlink/directory-sync retain lock through close timeout and explicit retry', async () => {
  for (const phase of ['read', 'unlink', 'sync']) {
    const entered = latch(), finish = latch(), settled = latch(); let delayed = false;
    const f = await localFixture({}, {
      async read(...args) {if (delayed && phase === 'read') {entered.release(); await finish.promise;} const result = await readAll(...args); if (delayed && phase === 'read') settled.release(); return result;},
      async unlink(path) {if (delayed && phase === 'unlink') {entered.release(); await finish.promise;} await unlink(path); if (delayed && phase === 'unlink') settled.release();},
      async syncDirectory() {if (delayed && phase === 'sync') {entered.release(); await finish.promise; settled.release();}},
    });
    try {
      await f.storage.put('x', source('body')); delayed = true;
      const operation = phase === 'read' ? (await f.storage.get('x')).body.next() : f.storage.delete('x');
      const rejected = assert.rejects(operation, errorIs('aborted', phase === 'read' ? 'not-applied' : 'unknown'));
      await entered.promise; await assert.rejects(f.adapter.close({timeoutMs: 10}), errorIs('timeout'));
      await rejected; await assert.rejects(createLocalAdapter({root: f.root, namespace: 'local-test'}), errorIs('unavailable'));
      finish.release(); await settled.promise; await tick(); await access(join(f.root, 'writer.lock'));
      await f.adapter.close({timeoutMs: 1000}); const next = await createLocalAdapter({root: f.root, namespace: 'local-test'}); await next.close();
    } finally {await rm(f.root, {recursive: true, force: true});}
  }
});
it('TEST-003/013: a late open is actually closed before the writer lock can be released', async t => {
  const entered = latch(), finish = latch(); let captured: FileHandle | undefined, delay = false;
  const f = await localFixture({}, {async openObject(path, op) {const fd = await secureOpen(path, op); if (delay) {captured = fd; entered.release(); await finish.promise;} return fd;}});
  t.after(() => rm(f.root, {recursive: true, force: true})); await f.storage.put('x', source('x')); delay = true;
  const read = assert.rejects(f.storage.get('x'), errorIs('aborted'));
  await entered.promise; await assert.rejects(f.adapter.close({timeoutMs: 10}), errorIs('timeout'));
  await read; assert(captured && captured.fd >= 0); finish.release(); await f.adapter.close({timeoutMs: 1000}); assert.equal(captured.fd, -1);
});
it('TEST-013: file loops handle repeated short reads/writes and reject zero progress', async () => {
  const data = Buffer.alloc(9); let written = 0;
  const partial = {
    async write(b: Uint8Array, offset: number, length: number, pos: number) {const n = Math.min(length, 2); data.set(b.subarray(offset, offset + n), pos); written += n; return {bytesWritten: n};},
    async read(b: Uint8Array, offset: number, length: number, pos: number) {const n = Math.min(length, 2); b.set(data.subarray(pos, pos + n), offset); return {bytesRead: n};},
  } as unknown as FileHandle;
  await writeAll(partial, Buffer.from('123456789'), 0); assert.equal(written, 9); assert.equal((await readAll(partial, 9, 0, 'get')).toString(), '123456789');
  await assert.rejects(readAll({read: async () => ({bytesRead: 0})} as unknown as FileHandle, 1, 0, 'get'), errorIs('integrity-error'));
  await assert.rejects(writeAll({write: async () => ({bytesWritten: 0})} as unknown as FileHandle, Buffer.from('x'), 0), errorIs('integrity-error'));
});
it('TEST-007/013: uncertain rename invalidates the object index until explicit close and reopen', async t => {
  let broken = false;
  const f = await localFixture({}, {async rename(from, to) {if (broken) throw Object.assign(new Error('disk uncertainty'), {code: 'EIO'}); await rename(from, to);}});
  t.after(() => rm(f.root, {recursive: true, force: true})); await f.storage.put('old', source('old')); broken = true;
  await assert.rejects(f.storage.put('old', source('new'), {overwrite: true}), errorIs('provider-error', 'unknown'));
  await assert.rejects(f.storage.head('old'), errorIs('integrity-error')); await f.adapter.close();
  const next = await localFixture({root: f.root}); assert.equal(await content(next.storage, 'old'), 'old'); await next.adapter.close();
});
