import assert from 'node:assert/strict';
import {it} from 'node:test';
import {createMemoryAdapter, createStorage} from '../src/index.js';
import type {ByteSource, CapabilityId, PutOptions, StorageAdapter} from '../src/index.js';
import {bytes, errorIs, fixture, instrument, source} from './helpers.js';

it('TEST-001: all key rejection cases fail before adapter calls or byte consumption', async () => {
  const {adapter, counts} = instrument(createMemoryAdapter({namespace: 'keys'}));
  const s = createStorage({adapter, namespace: 'keys'});
  let consumed = 0;
  async function* body() {consumed++; yield bytes('private');}
  for (const k of ['', '../a', 'a//b', 'a/./b', '/a', 'a/', 'a%2fb', 'a\\b', 'https:x', 'e\u0301', '\ud800', 'x\u0000', 'x\u0085', 'x'.repeat(513), '中'.repeat(171)]) {
    await assert.rejects(s.put(k, body()), errorIs('invalid-input'));
  }
  assert.equal(consumed, 0); assert(Object.values(counts).every(n => n === 0));
});
it('TEST-007/009: disabled move, signatures and multipart have zero I/O', async () => {
  const {adapter, counts} = instrument(createMemoryAdapter({namespace: 'disabled'}));
  const s = createStorage({adapter, namespace: 'disabled'});
  await assert.rejects(s.move('a', 'b', {sourceRevision: 'revision'}), errorIs('unsupported-capability'));
  await assert.rejects(s.signedUploadUrl('a'), errorIs('unsupported-capability'));
  await assert.rejects(s.signedDownloadUrl('a'), errorIs('unsupported-capability'));
  await assert.rejects(s.multipart(), errorIs('unsupported-capability'));
  assert(Object.values(counts).every(n => n === 0));
});
it('TEST-008: unsupported conditional write/copy reject before consuming source or reading objects', async () => {
  const base = createMemoryAdapter({namespace: 'limited'}), {adapter, counts} = instrument(base);
  const limited: StorageAdapter = {...adapter, descriptor: {...base.descriptor, supported: base.descriptor.supported.filter(c => c !== 'conditional-write')}};
  const s = createStorage({adapter: limited, namespace: 'limited'});
  let consumed = false;
  async function* body() {consumed = true; yield bytes('payload');}
  await assert.rejects(s.put('a', body()), errorIs('unsupported-capability'));
  await assert.rejects(s.copy('a', 'b'), errorIs('unsupported-capability'));
  assert.equal(consumed, false); assert(Object.values(counts).every(n => n === 0));
  await s.put('a', source('explicit'), {overwrite: true});
  assert.equal(counts.put, 1);
});
it('TEST-008/012: all unknown options and contradictory conditions are rejected', async t => {
  const f = fixture(); t.after(() => f.dispose()); const s = f.storage;
  const invalid: unknown[] = [{bucket: 'other'}, {namespace: 'other'}, {acl: 'public-read'}, {overwrite: 'true'},
    {condition: {kind: 'if-absent'}, overwrite: true}, {condition: {kind: 'if-revision', revision: 'r'}},
    {condition: {kind: 'if-absent', revision: 'r'}}, {condition: {kind: 'if-revision', revision: 'r', ignored: true}, overwrite: true},
    {timeoutMs: 0}, {timeoutMs: 120001}, {signal: {}}, {contentLength: -1}, {contentLength: NaN},
    {contentType: null}, {metadata: null}, {overwrite: null}, {timeoutMs: null},
    Object.defineProperty({}, 'overwrite', {get() {throw new Error('must not execute accessor');}, enumerable: true})];
  for (const options of invalid) await assert.rejects(s.put('a', source('x'), options as PutOptions), errorIs('invalid-input'));
  await assert.rejects(s.put('a', 'x' as unknown as ByteSource), errorIs('invalid-input'));
  await assert.rejects(s.get('a', {range: {start: 4, endInclusive: 3}}), errorIs('invalid-input'));
  await assert.rejects(s.head('a', {range: {start: 0}} as never), errorIs('invalid-input'));
  await assert.rejects(s.list({prefix: null} as never), errorIs('invalid-input'));
  await assert.rejects(s.list({pageSize: null} as never), errorIs('invalid-input'));
});
it('TEST-010: exact metadata size boundary, count and ASCII policy', async t => {
  const f = fixture(); t.after(() => f.dispose()); const s = f.storage;
  await s.put('boundary', source('ok'), {metadata: {a: 'x'.repeat(2047)}});
  await assert.rejects(s.put('over', source('x'), {metadata: {a: 'x'.repeat(2048)}}), errorIs('limit-exceeded'));
  await assert.rejects(s.put('count', source('x'), {metadata: Object.fromEntries(Array.from({length: 33}, (_, i) => [`k${i}`, '']))}), errorIs('limit-exceeded'));
  for (const metadata of [{Bad: 'x'}, {'a_': 'x'}, {a: '中文'}, {a: '\n'}, {a: 4}, {['x'.repeat(64)]: 'x'}]) {
    await assert.rejects(s.put('bad', source('x'), {metadata} as never), errorIs('invalid-input'));
  }
  for (const contentType of ['', 'x\r\ninjected', '中文', 'x'.repeat(256)]) await assert.rejects(s.put('bad', source('x'), {contentType}), errorIs('invalid-input'));
});
it('TEST-005: cursor injection and invalid pagination fail closed', async t => {
  const f = fixture(); t.after(() => f.dispose()); const s = f.storage;
  for (const cursor of ['../outside', 'a'.repeat(8193), '', Buffer.from('{"v":1,"path":"/secret"}').toString('base64url'), '%%%']) await assert.rejects(s.list({cursor}), errorIs('invalid-cursor'));
  for (const pageSize of [0, 1001, 1.5, NaN]) await assert.rejects(s.list({pageSize}), errorIs('invalid-input'));
  await assert.rejects(s.list({prefix: '../'}), errorIs('invalid-input'));
});
it('TEST-012: binding and configured limits are validated without environment reads', () => {
  const adapter = createMemoryAdapter({namespace: 'actual', maxObjectBytes: 100});
  assert.throws(() => createStorage({adapter, namespace: 'wrong'}), errorIs('invalid-input'));
  assert.throws(() => createStorage({adapter, namespace: 'actual'}), errorIs('invalid-input'));
  assert.throws(() => createStorage({adapter, namespace: 'actual'}, {maxObjectBytes: 100, listPageSize: 20, maxListPageSize: 10}), errorIs('invalid-input'));
  const supported = [...adapter.descriptor.supported, 'multipart' as CapabilityId];
  assert.throws(() => createStorage({adapter: {...instrument(adapter).adapter, descriptor: {...adapter.descriptor, supported}}, namespace: 'actual'}, {maxObjectBytes: 100}), errorIs('unsupported-capability'));
});

it('TEST-008: unsupported range and revision reads fail before touching the adapter', async () => {
  const base = createMemoryAdapter({namespace: 'limited-reads'}), {adapter, counts} = instrument(base);
  const limited: StorageAdapter = {...adapter, descriptor: {...base.descriptor, supported: base.descriptor.supported.filter(c => c !== 'conditional-read' && c !== 'range-read')}};
  const s = createStorage({adapter: limited, namespace: 'limited-reads'});
  await assert.rejects(s.get('key', {range: {start: 0}}), errorIs('unsupported-capability'));
  await assert.rejects(s.head('key', {ifRevision: 'r'}), errorIs('unsupported-capability'));
  await assert.rejects(s.copy('a', 'b', {sourceRevision: 'r'}), errorIs('unsupported-capability'));
  assert(Object.values(counts).every(n => n === 0));
});
it('TEST-001/002: malformed byte chunks and throwing source accessors are sanitized', async t => {
  const f = fixture(); t.after(() => f.dispose());
  async function* wrong() {yield 'not-bytes';}
  await assert.rejects(f.storage.put('wrong', wrong() as unknown as ByteSource), errorIs('invalid-input'));
  const accessor = Object.defineProperty({}, Symbol.asyncIterator, {get() {throw new Error('SECRET_SOURCE');}});
  await assert.rejects(f.storage.put('getter', accessor as ByteSource), errorIs('invalid-input'));
});
