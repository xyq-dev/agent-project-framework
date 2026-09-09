import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import type {TestContext} from 'node:test';
import type {Fixture} from './helpers.js';
import {bytes, content, errorIs, latch, source, text} from './helpers.js';

/** Run the same contract against each actually implemented adapter. */
export function contract(name: string, create: () => Fixture | Promise<Fixture>): void {
  async function use(t: TestContext): Promise<Fixture> {const f = await create(); t.after(() => f.dispose()); return f;}
  describe(name, () => {
    it('TEST-001/012: Unicode keys are exact and host config/audit packages are unnecessary', async t => {
      const {storage: s} = await use(t);
      await s.put('目录/照片-A.txt', source('Hello'));
      assert.equal(await content(s, '目录/照片-A.txt'), 'Hello');
      assert.equal(await s.exists('目录/照片-a.txt'), false);
      assert.deepEqual((await s.list({prefix: '目录/'})).items.map(x => x.key), ['目录/照片-A.txt']);
    });
    it('TEST-002: empty object and explicit overwrite publish complete values', async t => {
      const {storage: s} = await use(t);
      const empty = await s.put('empty', source(''));
      assert.equal(empty.sizeBytes, 0);
      assert.equal(await content(s, 'empty'), '');
      await assert.rejects(s.put('empty', source('bad')), errorIs('precondition-failed', 'not-applied'));
      const next = await s.put('empty', source('new'), {overwrite: true});
      assert.notEqual(empty.revision, next.revision);
      assert.equal(await content(s, 'empty'), 'new');
    });
    it('TEST-002/008: concurrent create-if-absent has exactly one winner', async t => {
      const {storage: s} = await use(t), gate = latch();
      async function* pending(value: string) {yield bytes(value); await gate.promise;}
      const attempts = [s.put('race', pending('A')), s.put('race', pending('B'))];
      gate.release();
      const results = await Promise.allSettled(attempts);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const rejected = results.find(r => r.status === 'rejected');
      assert(rejected?.status === 'rejected'); errorIs('precondition-failed')(rejected.reason);
      assert(['A', 'B'].includes(await content(s, 'race')));
    });
    it('TEST-002: declared length mismatch never replaces the old object', async t => {
      const {storage: s} = await use(t);
      const old = await s.put('old', source('original'));
      for (const length of [0, 1, 99]) await assert.rejects(s.put('old', source('new'), {overwrite: true, contentLength: length}), errorIs('invalid-input'));
      assert.equal((await s.head('old')).revision, old.revision);
      assert.equal(await content(s, 'old'), 'original');
    });
    it('TEST-002: mid-input failure preserves content and metadata', async t => {
      const {storage: s} = await use(t);
      const old = await s.put('old', source('original'), {metadata: {owner: 'first'}});
      async function* broken() {yield bytes('partial'); throw new Error('PRIVATE_PROVIDER_DETAIL');}
      await assert.rejects(s.put('old', broken(), {overwrite: true, metadata: {owner: 'second'}}), errorIs('invalid-input'));
      assert.deepEqual(await s.head('old'), old);
      assert.equal(await content(s, 'old'), 'original');
    });
    it('TEST-003/010: opened reads retain one revision across overwrite and delete', async t => {
      const {storage: s} = await use(t);
      const old = await s.put('snapshot', source('old content'), {metadata: {tag: 'old'}});
      const read = await s.get('snapshot');
      await s.put('snapshot', source('new content'), {overwrite: true, metadata: {tag: 'new'}});
      await s.delete('snapshot');
      assert.deepEqual(read.info, old);
      assert.equal(await text(read.body), 'old content');
      assert.equal(await s.exists('snapshot'), false);
    });
    it('TEST-004: exact delete does not delete a prefix and absent is idempotent', async t => {
      const {storage: s} = await use(t);
      await s.put('folder/item', source('keep'));
      assert.deepEqual(await s.delete('folder'), {absent: true});
      assert.equal(await content(s, 'folder/item'), 'keep');
      await s.delete('folder/item'); await s.delete('folder/item');
      await assert.rejects(s.delete('folder/item', {ifRevision: 'missing'}), errorIs('precondition-failed'));
    });
    it('TEST-004/008: stale revisions cannot change or remove replacements', async t => {
      const {storage: s} = await use(t);
      const a = await s.put('conditional', source('a'));
      const b = await s.put('conditional', source('b'), {overwrite: true, condition: {kind: 'if-revision', revision: a.revision}});
      await assert.rejects(s.put('conditional', source('c'), {overwrite: true, condition: {kind: 'if-revision', revision: a.revision}}), errorIs('precondition-failed'));
      await assert.rejects(s.delete('conditional', {ifRevision: a.revision}), errorIs('precondition-failed'));
      await assert.rejects(s.head('conditional', {ifRevision: a.revision}), errorIs('precondition-failed'));
      await assert.rejects(s.get('conditional', {ifRevision: a.revision}), errorIs('precondition-failed'));
      assert.equal(await content(s, 'conditional'), 'b');
      await s.delete('conditional', {ifRevision: b.revision});
      await assert.rejects(s.head('conditional', {ifRevision: b.revision}), errorIs('precondition-failed'));
    });
    it('TEST-008: concurrent compare-and-swap cannot both succeed', async t => {
      const {storage: s} = await use(t);
      const old = await s.put('cas', source('old'));
      const result = await Promise.allSettled(['A', 'B'].map(value => s.put('cas', source(value), {overwrite: true, condition: {kind: 'if-revision', revision: old.revision}})));
      assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(result.filter(r => r.status === 'rejected').length, 1);
    });
    it('TEST-005: pagination completes exactly once and scopes cursors to prefix and binding', async t => {
      const {storage: s} = await use(t), {storage: other} = await use(t);
      for (const k of ['img/a', 'img/b', 'image', 'other/c', 'img/中文']) await s.put(k, source(k));
      const first = await s.list({prefix: 'img/', pageSize: 1});
      assert(first.nextCursor);
      const names = first.items.map(x => x.key);
      let cursor: string | null = first.nextCursor;
      while (cursor) {const page = await s.list({prefix: 'img/', cursor, pageSize: 2}); names.push(...page.items.map(x => x.key)); cursor = page.nextCursor;}
      assert.deepEqual(names, ['img/a', 'img/b', 'img/中文']);
      await assert.rejects(s.list({prefix: 'other/', cursor: first.nextCursor}), errorIs('invalid-cursor'));
      await assert.rejects(other.list({prefix: 'img/', cursor: first.nextCursor}), errorIs('invalid-cursor'));
      assert.equal((await s.list({prefix: 'img'})).items.length, 3);
      assert.equal((await other.list()).items.length, 0);
    });
    it('TEST-006: copy preserves content and metadata but creates a new revision', async t => {
      const {storage: s} = await use(t);
      const src = await s.put('source', source('copy me'), {contentType: 'text/plain', metadata: {purpose: 'contract'}});
      const dst = await s.copy('source', 'target', {sourceRevision: src.revision});
      assert.equal(await content(s, 'target'), 'copy me');
      assert.equal(dst.contentType, src.contentType); assert.deepEqual(dst.metadata, src.metadata);
      assert.notEqual(dst.revision, src.revision);
      await assert.rejects(s.copy('source', 'source'), errorIs('invalid-input'));
      await assert.rejects(s.copy('missing', 'target', {overwrite: true}), errorIs('not-found'));
      await assert.rejects(s.copy('source', 'target'), errorIs('precondition-failed'));
      assert.equal((await s.head('target')).revision, dst.revision);
    });
    it('TEST-006: concurrent copy targets enforce the same atomic absence condition', async t => {
      const {storage: s} = await use(t);
      await s.put('src', source('data'));
      const results = await Promise.allSettled([s.copy('src', 'dst'), s.copy('src', 'dst')]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(await content(s, 'dst'), 'data');
    });
    it('TEST-008: ranges report whole-object info and exact returned bytes', async t => {
      const {storage: s} = await use(t);
      const info = await s.put('range', source('abcdef'));
      const r = await s.get('range', {range: {start: 1, endInclusive: 3}, ifRevision: info.revision});
      assert.equal(r.info.sizeBytes, 6); assert.equal(r.returnedBytes, 3); assert.equal(await text(r.body), 'bcd');
      assert.equal(await text((await s.get('range', {range: {start: 4, endInclusive: 999}})).body), 'ef');
      await assert.rejects(s.get('range', {range: {start: 6}}), errorIs('range-not-satisfiable'));
      await s.put('zero', source(''));
      await assert.rejects(s.get('zero', {range: {start: 0}}), errorIs('range-not-satisfiable'));
    });
    it('TEST-010: metadata replacement and defensive copies preserve stored values', async t => {
      const {storage: s} = await use(t);
      const input = {tag: 'old'};
      const first = await s.put('meta', source('same'), {metadata: input}); input.tag = 'mutated';
      (first.metadata as Record<string, string>).tag = 'output mutation';
      assert.equal((await s.head('meta')).metadata.tag, 'old');
      const second = await s.put('meta', source('same'), {overwrite: true, metadata: {other: 'new'}});
      assert.notEqual(second.revision, first.revision);
      assert.equal(second.etag, undefined); assert.equal(second.checksum, undefined);
      assert.deepEqual((await s.head('meta')).metadata, {other: 'new'});
      const read = await s.get('meta'); const chunk = await read.body.next(); assert(!chunk.done); chunk.value.fill(0); await read.body.return?.();
      assert.equal(await content(s, 'meta'), 'same');
      const caps = s.capabilities(); caps.supported.length = 0; caps.limits.maxObjectBytes = 1;
      assert(s.capabilities().supported.includes('put')); assert(s.capabilities().limits.maxObjectBytes > 1);
    });
  });
}
