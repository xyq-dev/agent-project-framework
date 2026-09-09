import assert from 'node:assert/strict';
import {createServer, request as httpRequest} from 'node:http';
import type {IncomingMessage, ServerResponse, RequestOptions} from 'node:http';
import type {AddressInfo} from 'node:net';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import os from 'node:os';
import {mock} from 'node:test';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createStorage} from '../src/index.js';
import {createOssAdapterForTest} from '../src/adapters/oss.js';
import type {OssOptions, OssCredentials, OssStorageAdapter} from '../src/adapters/oss.js';
import type {RequestFunction} from '../src/adapters/oss-transport.js';
export interface FakeObject {bytes: Buffer; headers: Record<string, string>; version: string}
export type Hook = (request: IncomingMessage, response: ServerResponse, body: Buffer, url: URL) => boolean | Promise<boolean>;
const xml = (v: string): string => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function errorResponse(response: ServerResponse, status: number, code: string) {response.writeHead(status, {'content-type': 'application/xml'}); response.end(`<Error><Code>${code}</Code><Message>FAKE_PRIVATE_ERROR</Message></Error>`);}
let sdkLoaded = false;
export async function ossFixture(config: {options?: Partial<OssOptions>; hook?: Hook; versioning?: string} = {}) {
  // This sandbox denies interface enumeration in the SDK's unused ClusterClient import.
  // Scope the stub to module loading, restore immediately, and never ship it in src/.
  if (!sdkLoaded) {
    const original = os.networkInterfaces;
    const interfaces = mock.method(os, 'networkInterfaces', () => ({}));
    try {createRequire(import.meta.url)('ali-oss'); sdkLoaded = true;} finally {interfaces.mock.restore();}
    assert.equal(os.networkInterfaces, original);
  }
  const root = await mkdtemp(join(tmpdir(), 'apf-oss-test-'));
  const objects = new Map<string, FakeObject>(), versions = new Map<string, FakeObject>();
  const requests: {method: string; path: string; query: string; length: string | undefined; v4: boolean; range: string | undefined; credentialId: string | undefined}[] = [];
  let count = 0, credentialCalls = 0, adapter: OssStorageAdapter | undefined;
  const state: {hook: Hook | undefined; versioning: string; credentials: OssCredentials} = {hook: config.hook, versioning: config.versioning ?? 'Enabled', credentials: {accessKeyId: 'TEST_ACCESS_ID', accessKeySecret: 'TEST_SECRET_CANARY', securityToken: 'TEST_STS_CANARY', expiresAt: new Date(Date.now() + 3600000).toISOString()}};
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com');
      const path = decodeURIComponent(url.pathname.slice(1));
      const auth = req.headers.authorization ?? '';
      requests.push({method: req.method!, path, query: url.search, length: req.headers['content-length'], v4: auth.startsWith('OSS4-HMAC-SHA256 '), range: req.headers.range, credentialId: /Credential=([^/]+)/.exec(auth)?.[1]});
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer); const bytes = Buffer.concat(chunks);
      if (await state.hook?.(req, res, bytes, url)) return;
      if (url.searchParams.has('versioning')) {res.end(`<VersioningConfiguration><Status>${state.versioning}</Status></VersioningConfiguration>`); return;}
      if (url.searchParams.get('list-type') === '2') {
        const prefix = url.searchParams.get('prefix') ?? '', limit = Number(url.searchParams.get('max-keys'));
        const offset = Number((url.searchParams.get('continuation-token') ?? 'next:0').slice(5));
        const keys = [...objects.keys()].filter(k => k.startsWith(prefix)).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
        const page = keys.slice(offset, offset + limit), more = keys.length > offset + page.length;
        res.end(`<ListBucketResult><Name>test-bucket</Name><Prefix>${xml(prefix)}</Prefix><MaxKeys>${limit}</MaxKeys><KeyCount>${page.length}</KeyCount><IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>next:${offset + page.length}</NextContinuationToken>` : ''}${page.map(k => `<Contents><Key>${xml(k)}</Key><LastModified>2026-09-09T00:00:00.000Z</LastModified><ETag>hint</ETag><Type>Normal</Type><Size>${objects.get(k)!.bytes.length}</Size><StorageClass>Standard</StorageClass></Contents>`).join('')}</ListBucketResult>`); return;
      }
      if (req.method === 'PUT') {
        const version = `version-${++count}`, headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) if (key.startsWith('x-oss-meta-') && typeof value === 'string') headers[key] = value;
        Object.assign(headers, {'content-type': req.headers['content-type'] ?? 'application/octet-stream', 'content-length': String(bytes.length), 'last-modified': new Date().toUTCString(), 'x-oss-version-id': version, 'x-oss-object-type': 'Normal', etag: '"' + createHash('md5').update(bytes).digest('hex') + '"'});
        const obj = {bytes, headers, version}; objects.set(path, obj); versions.set(path + '\0' + version, obj);
        res.writeHead(200, {'x-oss-version-id': version}); res.end(); return;
      }
      if (req.method === 'DELETE') {objects.delete(path); res.writeHead(204); res.end(); return;}
      const version = url.searchParams.get('versionId'), obj = version ? versions.get(path + '\0' + version) : objects.get(path);
      if (!obj) {errorResponse(res, 404, 'NoSuchKey'); return;}
      let body = obj.bytes, status = 200; const headers = {...obj.headers};
      if (req.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range)!;
        const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
        if (start >= body.length) {errorResponse(res, 416, 'InvalidRange'); return;}
        headers['content-range'] = `bytes ${start}-${end}/${body.length}`; body = body.subarray(start, end + 1); headers['content-length'] = String(body.length); status = 206;
      }
      res.writeHead(status, headers); res.end(req.method === 'HEAD' ? undefined : body);
    } catch {if (!res.destroyed) res.destroy();}
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const request = ((url: string, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    const logical = new URL(url);
    return httpRequest(`http://127.0.0.1:${port}${logical.pathname}${logical.search}`, options, callback);
  }) as RequestFunction;
  const options: OssOptions = {region: 'oss-cn-hangzhou', bucket: 'test-bucket', namespace: 'oss-test', spoolRoot: root,
    async credentials() {credentialCalls++; return {...state.credentials};}, ...config.options};
  const dispose = async () => {try {await adapter?.close();} finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, {recursive: true, force: true});}};
  try {adapter = await createOssAdapterForTest(options, request);}
  catch (e) {await dispose(); throw e;}
  const storage = createStorage({adapter, namespace: adapter.descriptor.namespace}, {maxObjectBytes: adapter.descriptor.maxObjectBytes});
  return {adapter, storage, root, objects, versions, requests, state, request, options, get credentialCalls() {return credentialCalls;}, dispose};
}
