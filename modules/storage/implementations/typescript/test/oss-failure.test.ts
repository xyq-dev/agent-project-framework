import assert from 'node:assert/strict';
import {it} from 'node:test';
import {readdir} from 'node:fs/promises';
import {once} from 'node:events';
import {createServer as httpServer, request as httpRequest} from 'node:http';
import type {IncomingMessage, RequestOptions} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {createServer as tcpServer} from 'node:net';
import type {AddressInfo, Socket} from 'node:net';
import {Readable} from 'node:stream';
import {Context, ObserverDispatcher} from '../src/context.js';
import {narrowTransport, Ticket} from '../src/adapters/oss-transport.js';
import type {RequestFunction} from '../src/adapters/oss-transport.js';
import {withCloudCleanup} from './oss-cloud-smoke.js';
import {ossFixture, errorResponse} from './oss-fixture.js';
import {content, errorIs, latch, source, text} from './helpers.js';

it('TEST-002/007: complete input staging precedes credentials/network and enforces length/byte budget', async t => {
  const f = await ossFixture({options: {maxObjectBytes: 64, maxStagingBytes: 96}}); t.after(() => f.dispose());
  const before = f.requests.length, creds = f.credentialCalls;
  async function* bad() {yield Buffer.from('part'); throw new Error('PRIVATE_SOURCE');}
  for (const [body, options] of [[bad(), {}], [source('long'), {contentLength: 2}], [source('short'), {contentLength: 50}], [source(new Uint8Array(65)), {}]] as const) await assert.rejects(f.storage.put('bad', body, {overwrite: true, ...options}));
  assert.equal(f.requests.length, before); assert.equal(f.credentialCalls, creds); assert.deepEqual(await readdir(f.root), []);
  await f.storage.put('valid', source('abc'), {overwrite: true, contentLength: 3}); assert.equal(f.requests.find(r => r.method === 'PUT')!.length, '3');
});
it('TEST-002/009: concurrent staging reserves shared bytes until cancellation cleanup; no eviction', async t => {
  const f = await ossFixture({options: {maxObjectBytes: 64, maxStagingBytes: 80}}); t.after(() => f.dispose());
  const staged = latch(), finish = latch(), controller = new AbortController();
  async function* pending() {yield new Uint8Array(60); staged.release(); await finish.promise;}
  const put = assert.rejects(f.storage.put('pending', pending(), {overwrite: true, signal: controller.signal}), errorIs('aborted'));
  await staged.promise; await assert.rejects(f.storage.put('other', source(new Uint8Array(30)), {overwrite: true}), errorIs('limit-exceeded'));
  controller.abort(); await put; await assert.rejects(f.adapter.close({timeoutMs: 10}), errorIs('timeout'));
  assert.equal((await readdir(f.root)).length, 1);
  finish.release(); await f.adapter.close(); assert.deepEqual(await readdir(f.root), []); assert.equal(f.requests.filter(r => r.method === 'PUT').length, 0);
});
it('TEST-010/011: versioning must be Enabled; invalid current/PUT versions fail closed and invalidate instance', async () => {
  for (const state of ['Suspended', 'Disabled', '']) await assert.rejects(ossFixture({versioning: state}), errorIs('unsupported-capability'));
  for (const kind of ['head', 'get', 'put']) for (const value of ['', 'null']) {
    const f = await ossFixture();
    try {
      await f.storage.put('item', source('body'), {overwrite: true});
      if (kind === 'put') f.state.hook = async (req, res) => {if (req.method === 'PUT') {res.writeHead(200, value ? {'x-oss-version-id': value} : {}); res.end(); return true;} return false;};
      else {const obj = [...f.objects.values()][0]!; if (value) obj.headers['x-oss-version-id'] = value; else delete obj.headers['x-oss-version-id'];}
      const promise = kind === 'put' ? f.storage.put('item', source('new'), {overwrite: true}) : kind === 'head' ? f.storage.head('item') : f.storage.get('item');
      await assert.rejects(promise, errorIs('integrity-error', kind === 'put' ? 'unknown' : 'not-applied'));
      const before = f.requests.length; await assert.rejects(f.storage.head('item'), errorIs('integrity-error')); assert.equal(f.requests.length, before);
    } finally {await f.dispose();}
  }
});
it('TEST-002/007: PUT confirmation targets exact returned version; lost acknowledgement is unknown and never replayed', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  const info = await f.storage.put('item', source('same'), {overwrite: true});
  assert.equal(new URLSearchParams(f.requests.at(-1)!.query).get('versionId'), info.revision);
  f.state.hook = async (req, res) => {if (req.method === 'PUT') {res.destroy(); return true;} return false;};
  const before = f.requests.filter(r => r.method === 'PUT').length;
  await assert.rejects(f.storage.put('item', source('new'), {overwrite: true}), errorIs('unavailable', 'unknown'));
  assert.equal(f.requests.filter(r => r.method === 'PUT').length - before, 1);
  f.state.hook = async (req, res, _, url) => {if (req.method === 'HEAD' && url.searchParams.has('versionId')) {errorResponse(res, 500, 'InternalError'); return true;} return false;};
  const count = f.requests.length; await assert.rejects(f.storage.put('item', source('published'), {overwrite: true}), errorIs('unavailable', 'unknown'));
  assert.equal(f.requests.length - count, 2); f.state.hook = undefined; assert.equal(await content(f.storage, 'item'), 'published');
});
it('TEST-007: eligible reads retry once before body; permissions and malformed error XML never become absence', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  let calls = 0;
  f.state.hook = async (_req, res) => {calls++; errorResponse(res, 503, 'SlowDown'); return true;};
  await assert.rejects(f.storage.get('x'), errorIs('rate-limited')); assert.equal(calls, 2);
  calls = 0; f.state.hook = async (_req, res) => {calls++; res.writeHead(404); res.end('<not-valid'); return true;};
  await assert.rejects(f.storage.exists('x'), errorIs('provider-error')); assert.equal(calls, 2); // one HEAD + one confirming GET, no retry
});
it('TEST-008/010: ignored and malformed ranges reject; info is derived from the same current response', async t => {
  const f = await ossFixture(); t.after(() => f.dispose()); await f.storage.put('item', source('abcdef'), {overwrite: true});
  const obj = [...f.objects.values()][0]!;
  for (const [status, range, length] of [[200, undefined, 6], [206, 'bytes 0-2/6', 3], [206, 'bytes 1-3/*', 3], [206, 'bytes 1-3/6', 2]] as const) {
    f.state.hook = async (req, res) => {if (req.method === 'GET') {res.writeHead(status, {...obj.headers, 'content-length': String(length), ...(range ? {'content-range': range} : {})}); res.end(obj.bytes.subarray(0, length)); return true;} return false;};
    await assert.rejects(f.storage.get('item', {range: {start: 1, endInclusive: 3}}), errorIs('integrity-error'));
  }
  f.state.hook = undefined; const old = await f.storage.head('item'); await f.storage.put('item', source('abcdef'), {overwrite: true});
  const before = f.requests.length; await assert.rejects(f.storage.get('item', {ifRevision: old.revision}), errorIs('precondition-failed'));
  assert.equal(f.requests.length - before, 1); assert.equal(f.requests.at(-1)!.query, '');
});
it('TEST-003/007: incomplete body, early return and never-consumed deadline close the actual response socket', async t => {
  const f = await ossFixture(); t.after(() => f.dispose()); await f.storage.put('item', source('abcdef'), {overwrite: true});
  const obj = [...f.objects.values()][0]!; let closed = latch();
  f.state.hook = async (req, res) => {if (req.method === 'GET') {res.on('close', () => closed.release()); res.writeHead(200, obj.headers); res.write('a'); return true;} return false;};
  const first = await f.storage.get('item'); await first.body.next(); await first.body.return?.(); await closed.promise;
  closed = latch(); const never = await f.storage.get('item', {timeoutMs: 40}); await closed.promise; await assert.rejects(never.body.next(), errorIs('timeout'));
  f.state.hook = async (req, res) => {if (req.method === 'GET') {res.writeHead(200, obj.headers); res.end('a'); return true;} return false;};
  const short = await f.storage.get('item'); await assert.rejects(text(short.body), errorIs('integrity-error'));
});
it('TEST-007/011: redirects and oversized success/error XML stop at bounded transport and never follow location', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  for (const [status, size, expected] of [[302, 0, 'integrity-error'], [200, 4 * 1024 * 1024 + 1, 'limit-exceeded'], [500, 64 * 1024 + 1, 'limit-exceeded']] as const) {
    f.state.hook = async (_req, res) => {res.writeHead(status, {location: 'https://evil.invalid/'}); res.end(Buffer.alloc(size, 120)); return true;};
    const before = f.requests.length; await assert.rejects(f.storage.list(), errorIs(expected)); assert.equal(f.requests.length - before, 1);
  }
});
it('TEST-005/007: list preserves empty continuation, bounded enrichment concurrency and fails on foreign keys', async t => {
  const f = await ossFixture(); t.after(() => f.dispose());
  for (let n = 0; n < 8; n++) await f.storage.put(`p/${n}`, source(String(n)), {overwrite: true});
  let active = 0, max = 0;
  f.state.hook = async (req, res) => {if (req.method === 'HEAD') {active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; errorResponse(res, 404, 'NoSuchKey'); return true;} if (req.method === 'GET' && req.url?.startsWith('/apf-storage/')) {errorResponse(res, 404, 'NoSuchKey'); return true;} return false;};
  const page = await f.storage.list({prefix: 'p/', pageSize: 6}); assert.deepEqual(page.items, []); assert(page.nextCursor); assert.equal(max, 4);
  f.state.hook = async (_req, res) => {res.end('<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>foreign/key</Key></Contents></ListBucketResult>'); return true;};
  await assert.rejects(f.storage.list(), errorIs('integrity-error'));
  f.state.hook = async (_req, res) => {res.end('<Unexpected/>'); return true;};
  await assert.rejects(f.storage.list(), errorIs('integrity-error'));
});
it('TEST-007/013: upload timeout destroys socket and closes staged file before close resolves', async t => {
  const entered = latch(), closed = latch();
  const f = await ossFixture({hook: async (req, res) => {if (req.method === 'PUT') {res.on('close', () => closed.release()); entered.release(); return true;} return false;}}); t.after(() => f.dispose());
  const operation = assert.rejects(f.storage.put('item', source(new Uint8Array(128000)), {overwrite: true, timeoutMs: 80}), errorIs('timeout', 'unknown'));
  await entered.promise; assert.equal((await readdir(f.root)).length, 1); await operation; await closed.promise; await f.adapter.close(); assert.deepEqual(await readdir(f.root), []);
});
it('TEST-007/013: cancellation drains real requests during lookup, TLS handshake and partial upload', {timeout: 10000}, async () => {
  for (const phase of ['lookup', 'tls-handshake', 'upload']) {
    const entered = latch(), attached = latch(), sockets = new Set<Socket>(); let requests = 0, lateLookup: (() => void) | undefined, clientSocket: Socket | undefined;
    const server = phase === 'tls-handshake' ? tcpServer(() => {entered.release();}) : httpServer((req, _res) => {
      requests++;
      req.on('error', () => {});
      req.once('data', () => {req.pause(); entered.release();});
    });
    server.on('connection', socket => {sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => {sockets.delete(socket);});});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    const ctx = new Context(phase === 'upload' ? 'put' : 'get', 3000, undefined, new ObserverDispatcher(undefined));
    let captured: ReturnType<typeof httpRequest> | undefined, produced = 0;
    const bytes = Buffer.alloc(65536);
    const stream = phase === 'upload' ? new Readable({read() {produced += bytes.length; this.push(produced <= 32 * 1024 * 1024 ? bytes : null);}}) : undefined;
    const request = ((_: string, options: RequestOptions, callback: (res: IncomingMessage) => void) => {
      captured = phase === 'tls-handshake' ? httpsRequest(`https://127.0.0.1:${port}/test`, options, callback) :
        httpRequest(`http://${phase === 'lookup' ? 'lookup.test' : '127.0.0.1'}:${port}/test`, {
          ...options, family: 4,
          ...(phase === 'lookup' ? {lookup: (_host: string, _opts: unknown, cb: (error: null, address: string, family: number) => void) => {
            lateLookup = () => cb(null, '127.0.0.1', 4); entered.release();
          }} : {}),
        }, callback);
      captured.once('socket', socket => {clientSocket = socket; attached.release();});
      return captured;
    }) as RequestFunction;
    const ticket = new Ticket({origin: 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com', path: '/test', query: {}, method: phase === 'upload' ? 'PUT' : 'GET', mutation: phase === 'upload'}, ctx, () => {});
    try {
      const operation = narrowTransport(request).request(ticket.expected.origin + '/test', {ctx: ticket, method: ticket.expected.method, headers: {}, ...(stream ? {stream} : {})});
      const rejected = assert.rejects(operation, errorIs('aborted', phase === 'upload' ? 'unknown' : 'not-applied'));
      await entered.promise; await attached.promise; ctx.cancel(); await rejected; await ticket.settled;
      assert(captured?.destroyed); assert(clientSocket?.destroyed);
      if (stream) {if (!stream.closed) await once(stream, 'close'); assert(stream.destroyed); assert(produced < 32 * 1024 * 1024);}
      lateLookup?.(); await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(requests, phase === 'upload' ? 1 : 0);
    } finally {
      ctx.finish(); captured?.destroy(); stream?.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
});
it('TEST-007/013: cloud verification cleanup runs after failed close and preserves all failures', async () => {
  for (const failed of [[], ['close'], ['verify', 'close', 'cleanup']]) {
    const calls: string[] = [], errors: Error[] = [];
    const action = (phase: string) => async () => {calls.push(phase); if (failed.includes(phase)) {const error = new Error(phase); errors.push(error); throw error;} return 'verified';};
    const result = withCloudCleanup(action('verify'), async () => {await action('close')();}, async () => {await action('cleanup')();});
    if (failed.length === 0) assert.equal(await result, 'verified');
    else await assert.rejects(result, error => {
      if (errors.length === 1) assert.equal(error, errors[0]);
      else {assert(error instanceof AggregateError); assert.deepEqual(error.errors, errors);}
      return true;
    });
    assert.deepEqual(calls, ['verify', 'close', 'cleanup']);
  }
});
