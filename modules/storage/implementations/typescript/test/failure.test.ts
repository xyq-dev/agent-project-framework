import assert from 'node:assert/strict';
import {it} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createMemoryAdapter, createStorage, StorageError} from '../src/index.js';
import type {ByteSource, Observation, StorageAdapter} from '../src/index.js';
import {bytes, content, errorIs, fixture, instrument, latch, source, text, tick} from './helpers.js';

it('TEST-002: max object boundary and overflow leave existing data intact', async t => {
  const f = fixture(); t.after(() => f.dispose()); const s = f.storage;
  const limit = s.capabilities().limits.maxObjectBytes;
  const old = await s.put('large', source(new Uint8Array(limit)), {contentLength: limit});
  await assert.rejects(s.put('large', source(new Uint8Array(limit + 1)), {overwrite: true}), errorIs('limit-exceeded'));
  await assert.rejects(s.put('large', source('x'), {overwrite: true, contentLength: limit + 1}), errorIs('limit-exceeded'));
  assert.equal((await s.head('large')).revision, old.revision);
});
it('TEST-002/011: stored and in-flight memory share one budget without evicting old data', async t => {
  const f = fixture({maxObjectBytes: 8, maxTotalBytes: 16}); t.after(() => f.dispose()); const s = f.storage;
  await s.put('old', source('original'));
  const gate = latch(), entered = latch(), abort = new AbortController();
  async function* body() {yield bytes('12345678'); entered.release(); await gate.promise;}
  const pending = s.put('old', body(), {overwrite: true, signal: abort.signal});
  const rejected = assert.rejects(pending, errorIs('aborted', 'not-applied'));
  await entered.promise;
  await assert.rejects(s.put('other', source('x')), errorIs('limit-exceeded'));
  abort.abort('PRIVATE_ABORT_REASON'); gate.release(); await rejected; await tick();
  assert.equal(await content(s, 'old'), 'original');
  await s.put('other', source('reusable'));
});
it('TEST-003/011: pinned snapshots remain budgeted and return before first next releases them', async t => {
  const f = fixture({maxObjectBytes: 8, maxTotalBytes: 16}); t.after(() => f.dispose()); const s = f.storage;
  await s.put('key', source('old-data')); const snapshot = await s.get('key');
  await s.put('key', source('new-data'), {overwrite: true});
  await assert.rejects(s.put('key', source('next'), {overwrite: true}), errorIs('limit-exceeded'));
  await snapshot.body.return?.();
  await s.put('key', source('next'), {overwrite: true});
  assert.equal(await content(s, 'key'), 'next');
});
it('TEST-005: maximum object count rejects additions but permits replacing an existing key', async t => {
  const f = fixture({maxObjects: 2}); t.after(() => f.dispose()); const s = f.storage;
  await s.put('one', source('')); await s.put('two', source(''));
  await assert.rejects(s.put('three', source('')), errorIs('limit-exceeded'));
  await s.put('one', source('replacement'), {overwrite: true});
  assert.deepEqual((await s.list()).items.map(i => i.key), ['one', 'two']);
  assert.throws(() => createMemoryAdapter({namespace: 'too-many', maxObjects: 10001}), errorIs('invalid-input'));
});
it('TEST-003/011: exists propagates permission/authentication/integrity errors', async () => {
  for (const code of ['permission-denied', 'authentication-failed', 'integrity-error', 'provider-error'] as const) {
    const base = createMemoryAdapter({namespace: code}), {adapter} = instrument(base);
    let calls = 0;
    adapter.head = async (_key, _revision, ctx) => {calls++; throw new StorageError(code, ctx.operation);};
    const s = createStorage({adapter, namespace: code});
    await assert.rejects(s.exists('private'), errorIs(code));
    assert.equal(calls, 1);
  }
});
it('TEST-011: transient reads retry at most once and then either succeed or preserve failure', async () => {
  const base = createMemoryAdapter({namespace: 'retry'}), {adapter} = instrument(base);
  await createStorage({adapter: base, namespace: 'retry'}).put('key', source('x'));
  let calls = 0;
  adapter.head = async (...args) => {calls++; if (calls === 1) throw new StorageError('unavailable', args[2].operation); return base.head(...args);};
  const s = createStorage({adapter, namespace: 'retry'});
  assert.equal(await s.exists('key'), true); assert.equal(calls, 2);
  for (const code of ['timeout', 'rate-limited', 'unavailable'] as const) {
    calls = 0;
    adapter.head = async (_key, _revision, ctx) => {calls++; throw new StorageError(code, ctx.operation);};
    await assert.rejects(s.exists('key'), errorIs(code)); assert.equal(calls, 2);
  }
});
it('TEST-011: a committed mutation with response loss reports unknown and is not replayed', async () => {
  const base = createMemoryAdapter({namespace: 'unknown'}), {adapter} = instrument(base);
  let writes = 0;
  adapter.put = async (...args) => {writes++; await base.put(...args); throw new Error('SECRET_PROVIDER_PATH');};
  const s = createStorage({adapter, namespace: 'unknown'});
  await assert.rejects(s.put('key', source('published')), error => {
    errorIs('provider-error', 'unknown')(error);
    assert(error instanceof StorageError); assert.equal(error.retryable, false);
    assert(!JSON.stringify(error).includes('SECRET')); assert(!error.stack?.includes('SECRET_PROVIDER_PATH'));
    return true;
  });
  assert.equal(writes, 1);
  assert.equal(await content(createStorage({adapter: base, namespace: 'unknown'}), 'key'), 'published');
});
it('TEST-011: transient mutation failure never retries and no body consumption occurs before cancellation', async () => {
  const {adapter, counts} = instrument(createMemoryAdapter({namespace: 'write-retry'}));
  const original = adapter.put; let writes = 0;
  adapter.put = async (...args) => {writes++; if (writes) throw new StorageError('unavailable', args[3].operation); return original(...args);};
  const s = createStorage({adapter, namespace: 'write-retry'});
  await assert.rejects(s.put('key', source('x')), errorIs('unavailable')); assert.equal(writes, 1);
  const abort = new AbortController(); abort.abort(); let consumed = false;
  async function* body() {consumed = true; yield bytes('x');}
  await assert.rejects(s.put('key', body(), {signal: abort.signal}), errorIs('aborted'));
  assert.equal(consumed, false); assert.equal(counts.put, 0);
});
it('TEST-011: a hung input is timed out and cooperatively closed', async () => {
  const {storage: s} = fixture(); let closed = 0;
  const body: ByteSource = {[Symbol.asyncIterator]() {return {
    next: () => new Promise<IteratorResult<Uint8Array>>(() => {}),
    async return() {closed++; return {done: true, value: undefined};},
  };}};
  await assert.rejects(s.put('hung', body, {timeoutMs: 15}), errorIs('timeout', 'not-applied'));
  await tick(); assert.equal(closed, 1); assert.equal(await s.exists('hung'), false);
});
it('TEST-003/011: an abandoned read expires and releases its old snapshot without next()', async t => {
  const f = fixture({maxObjectBytes: 8, maxTotalBytes: 16}); t.after(() => f.dispose()); const s = f.storage;
  await s.put('key', source('old-data'));
  const old = await s.get('key', {timeoutMs: 15});
  await s.put('key', source('new-data'), {overwrite: true});
  await new Promise(resolve => setTimeout(resolve, 25));
  await assert.rejects(old.body.next(), errorIs('timeout'));
  await s.put('key', source('reused'), {overwrite: true});
});
it('TEST-003/011: early iteration break calls adapter return exactly once', async () => {
  const base = createMemoryAdapter({namespace: 'close'}), {adapter} = instrument(base);
  const s = createStorage({adapter, namespace: 'close'}); await s.put('key', source('x'.repeat(100000)));
  let closes = 0;
  adapter.get = async (...args) => {const read = await base.get(...args), ret = read.body.return!.bind(read.body);
    read.body.return = async value => {closes++; return ret(value);}; return read;};
  const read = await s.get('key'); for await (const _ of read.body) break;
  assert.equal(closes, 1);
});
it('TEST-011: body failure after bytes are emitted does not restart get', async () => {
  const base = createMemoryAdapter({namespace: 'body-failure'}), {adapter} = instrument(base);
  const s = createStorage({adapter, namespace: 'body-failure'}); await s.put('key', source('abcdef'));
  let gets = 0;
  adapter.get = async (...args) => {gets++; const read = await base.get(...args); await read.body.return?.();
    async function* broken() {yield bytes('abc'); throw new StorageError('unavailable', 'get');}
    return {...read, body: broken()};};
  const read = await s.get('key'); assert.equal((await read.body.next()).done, false);
  await assert.rejects(read.body.next(), errorIs('unavailable')); assert.equal(gets, 1);
});
it('TEST-006/011: copy source failure cannot publish a partial destination', async () => {
  const base = createMemoryAdapter({namespace: 'copy-failure'}), {adapter} = instrument(base);
  const s = createStorage({adapter, namespace: 'copy-failure'});
  await s.put('src', source('source')); const dst = await s.put('dst', source('keep'));
  adapter.get = async (...args) => {const read = await base.get(...args); await read.body.return?.();
    async function* broken() {yield bytes('s'); throw new StorageError('unavailable', 'get');}
    return {...read, body: broken()};};
  await assert.rejects(s.copy('src', 'dst', {overwrite: true}), errorIs('unavailable', 'not-applied'));
  assert.equal((await s.head('dst')).revision, dst.revision);
});
it('TEST-005: a non-null empty page is preserved instead of claiming end-of-list', async () => {
  const base = createMemoryAdapter({namespace: 'empty-page'}), {adapter} = instrument(base);
  adapter.list = async () => ({items: [], nextCursor: 'provider-continuation'});
  const page = await createStorage({adapter, namespace: 'empty-page'}).list();
  assert.deepEqual(page, {items: [], nextCursor: 'provider-continuation'});
});
it('TEST-011/012: observer failures do not change success and events contain no input secrets', async t => {
  const events: Readonly<Observation>[] = [];
  const f = fixture({}, {}, event => {events.push(event); throw new Error('OBSERVER_CANARY');}); t.after(() => f.dispose());
  await f.storage.put('PRIVATE_KEY', source('BODY_CANARY'), {metadata: {secret: 'METADATA_CANARY'}});
  assert.equal(await content(f.storage, 'PRIVATE_KEY'), 'BODY_CANARY'); await tick();
  assert(events.length >= 2);
  const json = JSON.stringify(events); for (const secret of ['PRIVATE_KEY', 'BODY_CANARY', 'METADATA_CANARY', 'OBSERVER_CANARY']) assert(!json.includes(secret));
  assert(events.every(event => Object.keys(event).every(k => ['operation', 'outcome', 'errorCode', 'durationMs', 'bytes'].includes(k))));
});
it('TEST-011: at most 16 unsettled observer calls exist; slots free only after settlement', async t => {
  const gate = latch(); let calls = 0;
  const f = fixture({}, {}, async () => {calls++; await gate.promise;}); t.after(() => f.dispose());
  await Promise.all(Array.from({length: 24}, (_, i) => f.storage.put(`event-${i}`, source('x')))); await tick();
  assert.equal(calls, 16); gate.release(); await tick();
  await f.storage.put('after-settle', source('x')); await tick(); assert.equal(calls, 17);
});
it('TEST-014: private isolated package has exact locked dependencies and provider-free Core', async () => {
  const root = new URL('../', import.meta.url);
  // Tests run from dist/test; package files sit one level above dist.
  const pkg = JSON.parse(await readFile(new URL('../package.json', root), 'utf8')) as {private: boolean; devDependencies: Record<string, string>; dependencies: Record<string, string>};
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', root), 'utf8')) as {packages: Record<string, {version?: string; integrity?: string}>};
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.dependencies, {'ali-oss': '6.23.0'});
  for (const [name, version] of Object.entries({...pkg.devDependencies, ...pkg.dependencies})) {
    assert.match(version, /^\d+\.\d+\.\d+$/); assert.equal(lock.packages[`node_modules/${name}`]?.version, version);
    assert(lock.packages[`node_modules/${name}`]?.integrity);
  }
  for (const filename of ['core.ts', 'types.ts', 'validation.ts', 'context.ts', 'streams.ts']) {
    const code = await readFile(new URL(`../src/${filename}`, root), 'utf8');
    assert(!/process\.env|node:fs|ali-oss|fetch\(/.test(code));
  }
});

it('TEST-011: empty-chunk infinite input cannot starve its deadline', async () => {
  const {storage: s} = fixture(); let closed = false;
  async function* emptyForever() {try {while (true) yield new Uint8Array(0);} finally {closed = true;}}
  await assert.rejects(s.put('empty-loop', emptyForever(), {timeoutMs: 10}), errorIs('timeout'));
  await tick(); assert.equal(closed, true); assert.equal(await s.exists('empty-loop'), false);
});
it('TEST-003/011: late adapter read handles are closed after timeout', async () => {
  const base = createMemoryAdapter({namespace: 'late'}), {adapter} = instrument(base);
  const direct = createStorage({adapter: base, namespace: 'late'});
  const info = await direct.put('key', source('x')); let closed = 0;
  adapter.get = async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
    const body: AsyncIterableIterator<Uint8Array> = {
      [Symbol.asyncIterator]() {return this;}, async next() {return {done: true, value: undefined};},
      async return() {closed++; return {done: true, value: undefined};},
    };
    return {info, body, returnedBytes: 1};
  };
  await assert.rejects(createStorage({adapter, namespace: 'late'}).get('key', {timeoutMs: 5}), errorIs('timeout'));
  await new Promise(resolve => setTimeout(resolve, 35)); assert.equal(closed, 1);
});
it('TEST-003/010: provider-only fields are not spread into ObjectInfo', async () => {
  const base = createMemoryAdapter({namespace: 'output'}), {adapter} = instrument(base);
  const s = createStorage({adapter, namespace: 'output'}); await s.put('key', source('x'));
  adapter.head = async (...args) => ({...await base.head(...args), rawPath: '/private/canary', credentials: 'secret'});
  const info = await s.head('key'); assert(!('rawPath' in info)); assert(!('credentials' in info));
});
