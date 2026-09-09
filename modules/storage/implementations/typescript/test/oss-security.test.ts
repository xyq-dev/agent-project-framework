import assert from 'node:assert/strict';
import {it} from 'node:test';
import {createRequire} from 'node:module';
import {readFile, chmod, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createOssAdapterForTest} from '../src/adapters/oss.js';
import type {OssCredentials, OssOptions} from '../src/adapters/oss.js';
import {Context, ObserverDispatcher} from '../src/context.js';
import {narrowTransport, Ticket} from '../src/adapters/oss-transport.js';
import type {RequestFunction} from '../src/adapters/oss-transport.js';
import {ossFixture, errorResponse} from './oss-fixture.js';
import {content, errorIs, source} from './helpers.js';

it('TEST-008/011: conservative OSS capabilities reject before source, credentials and requests', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  const before = f.requests.length, creds = f.credentialCalls; let consumed = 0;
  async function* input() {consumed++; yield Buffer.from('x');}
  for (const promise of [f.storage.put('x', input()), f.storage.put('x', input(), {overwrite: true, condition: {kind: 'if-revision', revision: 'v'}}),
    f.storage.copy('missing', 'x'), f.storage.copy('missing', 'x', {destinationCondition: {kind: 'if-absent'}}), f.storage.delete('x', {ifRevision: 'v'}),
    f.storage.move('x', 'y', {sourceRevision: 'v'}), f.storage.signedUploadUrl('x'), f.storage.signedDownloadUrl('x'), f.storage.multipart()]) await assert.rejects(promise, errorIs('unsupported-capability'));
  assert.equal(consumed, 0); assert.equal(f.credentialCalls, creds); assert.equal(f.requests.length, before);
  assert.deepEqual(f.storage.capabilities().supported, ['put', 'get', 'head', 'exists', 'delete', 'list', 'metadata', 'capability-negotiation', 'copy', 'range-read', 'conditional-read']);
});
it('TEST-011: fixed namespace/bucket/region and endpoint options cannot be overridden; long UTF8 keys fit provider layout', async t => {
  const namespace = '命'.repeat(170), key = '键'.repeat(170);
  const f = await ossFixture({options: {namespace}}); t.after(() => f.dispose());
  await f.storage.put(key, source('value'), {overwrite: true, metadata: {'apf-user': 'legal user key', empty: ''}});
  const put = f.requests.find(r => r.method === 'PUT')!;
  assert(Buffer.byteLength(put.path) < 1024); assert(put.path.startsWith(`apf-storage/v1/${createHash('sha256').update(namespace).digest('hex')}/objects/`));
  assert.equal(await content(f.storage, key), 'value');
  const heavy = {a: '"\\'.repeat(1023) + '"'};
  await f.storage.put('metadata-boundary', source('x'), {overwrite: true, metadata: heavy});
  assert.deepEqual((await f.storage.head('metadata-boundary')).metadata, heavy);
  const reserved = {'apf-format': 'user', 'apf-namespace': 'user', 'apf-binding': 'user', 'apf-key-sha256': 'user', 'apf-user': 'user'};
  await f.storage.put('reserved-user-keys', source('x'), {overwrite: true, metadata: reserved});
  assert.deepEqual((await f.storage.head('reserved-user-keys')).metadata, reserved);
  for (const extra of [{endpoint: 'https://evil.invalid'}, {proxy: 'https://evil.invalid'}, {sdkOptions: {bucket: 'other'}}]) await assert.rejects(createOssAdapterForTest({...f.options, ...extra} as OssOptions, f.request), errorIs('invalid-input'));
  f.state.credentials = {...f.state.credentials, endpoint: 'https://evil.invalid'} as OssCredentials;
  const before = f.requests.length; await assert.rejects(f.storage.head(key), errorIs('authentication-failed')); assert.equal(f.requests.length, before);
});
it('TEST-007/011: HEAD 404 is confirmed with current GET; only explicit NoSuchKey is absence', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  let code = 'NoSuchKey', status = 404;
  f.state.hook = async (req, res) => {if (req.method === 'HEAD') {res.writeHead(404); res.end(); return true;} if (req.method === 'GET') {errorResponse(res, status, code); return true;} return false;};
  assert.equal(await f.storage.exists('missing'), false);
  for (const [provider, http, expected] of [['NoSuchBucket', 404, 'provider-error'], ['AccessDenied', 403, 'permission-denied'], ['InvalidAccessKeyId', 403, 'authentication-failed']] as const) {
    code = provider; status = http; const before = f.requests.length;
    await assert.rejects(f.storage.exists('missing'), errorIs(expected)); assert.equal(f.requests.length - before, 2);
  }
  f.state.hook = async (req, res) => {res.writeHead(404); res.end(); return true;};
  await assert.rejects(f.storage.exists('missing'), errorIs('provider-error'));
  f.state.hook = undefined; await f.storage.put('present', source('body'), {overwrite: true});
  f.state.hook = async (req, res) => {if (req.method === 'HEAD') {res.writeHead(404); res.end(); return true;} return false;};
  assert.equal((await f.storage.head('present')).sizeBytes, 4);
});
it('TEST-010/011: markers, canonical metadata, symlinks, encodings and malformed response headers fail closed', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  await f.storage.put('item', source('body'), {overwrite: true, metadata: {a: 'b'}});
  const obj = [...f.objects.values()][0]!, saved = {...obj.headers};
  for (const patch of [
    {'x-oss-meta-apf-format': '2'}, {'x-oss-meta-apf-binding': 'other'}, {'x-oss-meta-apf-namespace': 'other'}, {'x-oss-meta-apf-key-sha256': 'other'},
    {'x-oss-meta-apf-unknown': 'x'}, {'x-oss-object-type': 'Symlink'}, {'content-encoding': 'gzip'},
    {'x-oss-meta-apf-user': Buffer.from('{"a":"wrong","a":"b"}').toString('base64url')}, {'x-oss-meta-apf-user': 'e30='}, {'x-oss-meta-apf-user': Buffer.from([255]).toString('base64url')},
    {'content-type': ''}, {'last-modified': 'not a date'},
  ]) {
    obj.headers = {...saved, ...patch}; await assert.rejects(f.storage.get('item'), errorIs('integrity-error'));
  }
  obj.headers = saved; assert.equal(await content(f.storage, 'item'), 'body');
  f.state.hook = async (req, res) => {if (req.method === 'GET') {res.writeHead(200, [...Object.entries(saved), ['X-Oss-Meta-Apf-User', saved['x-oss-meta-apf-user']!]]); res.end('body'); return true;} return false;};
  await assert.rejects(f.storage.get('item'), errorIs('integrity-error'));
  f.state.hook = undefined;
});
it('TEST-011: official V4 requests use fresh credential snapshots; stale STS and raw provider errors never dispatch', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  await f.storage.put('item', source('body'), {overwrite: true}); assert(f.requests.every(r => r.v4));
  f.state.credentials = {...f.state.credentials, accessKeyId: 'ROTATED_TEST_ID'};
  await f.storage.head('item'); assert.equal(f.requests.at(-1)!.credentialId, 'ROTATED_TEST_ID');
  f.state.credentials = {...f.state.credentials, expiresAt: new Date(Date.now() - 1000).toISOString()};
  const before = f.requests.length; await assert.rejects(f.storage.head('item'), errorIs('authentication-failed')); assert.equal(f.requests.length, before);
  await assert.rejects(ossFixture({options: {async credentials() {throw new Error('SECRET_PROVIDER_CANARY');}}}), e => {
    errorIs('authentication-failed')(e); assert(!JSON.stringify(e).includes('CANARY')); assert(!String(e).includes('CANARY')); return true;
  });
});
it('TEST-011: actual SDK debug namespace/wildcard deny before credentials and leave global debug unchanged', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  const r = createRequire(import.meta.url); const debug = createRequire(r.resolve('ali-oss'))('debug') as {enable(s: string): void; disable(): string; enabled(s: string): boolean};
  const previous = debug.disable();
  try {
    for (const setting of ['ali-oss', 'ali-oss:*', '*']) {
      debug.enable(setting); const before = f.requests.length, creds = f.credentialCalls;
      await assert.rejects(f.storage.head('never'), errorIs('permission-denied'));
      assert.equal(f.credentialCalls, creds); assert.equal(f.requests.length, before); assert(debug.enabled(setting === 'ali-oss:*' ? 'ali-oss:object' : 'ali-oss'));
      let calls = 0; await assert.rejects(createOssAdapterForTest({...f.options, async credentials() {calls++; return {...f.state.credentials};}}, f.request), errorIs('permission-denied')); assert.equal(calls, 0);
    }
  } finally {debug.enable(previous);}
});
it('TEST-011: narrow transport rejects changed method/origin/path/query, redirect/proxy and caller agent before dispatch', async () => {
  const ctx = new Context('get', 1000, undefined, new ObserverDispatcher(undefined)); let called = 0;
  const request = (() => {called++; throw new Error('must not call');}) as unknown as RequestFunction;
  const transport = narrowTransport(request);
  const expected = {origin: 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com', path: '/fixed', query: {}, method: 'GET' as const, mutation: false};
  try {
    for (const url of ['http://test-bucket.oss-cn-hangzhou.aliyuncs.com/fixed', 'https://evil.invalid/fixed', expected.origin + '/other', expected.origin + '/fixed?versionId=old']) {
      const ctxTicket = new Ticket(expected, ctx, () => {}); await assert.rejects(transport.request(url, {method: 'GET', headers: {}, ctx: ctxTicket}), errorIs('integrity-error'));
    }
    for (const extra of [{method: 'PUT'}, {proxy: 'x'}, {agent: {}}, {httpsAgent: {}}, {enableProxy: true}]) await assert.rejects(transport.request(expected.origin + '/fixed', {method: 'GET', headers: {}, ctx: new Ticket(expected, ctx, () => {}), ...extra}), errorIs('integrity-error'));
    assert.equal(called, 0);
  } finally {ctx.finish();}
});
it('TEST-011/013: OSS spool requires private trusted directory and cleanup retains unrelated owned files', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  const {writeFile} = await import('node:fs/promises'); const path = f.root + '/host-owned-file'; await writeFile(path, 'keep', {mode: 0o600});
  await f.storage.put('x', source('x'), {overwrite: true}); assert.equal(await readFile(path, 'utf8'), 'keep');
  await chmod(f.root, 0o755);
  const before = f.requests.length; await assert.rejects(f.storage.put('y', source('x'), {overwrite: true}), errorIs('integrity-error')); assert.equal(f.requests.length, before);
  await chmod(f.root, 0o700); assert.deepEqual(await readdir(f.root), ['host-owned-file']);
});
