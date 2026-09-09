import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Readable} from 'node:stream';
import {Context, ObserverDispatcher} from '../context.js';
import {fail, StorageError, publicError} from '../errors.js';
import type {ErrorCode} from '../errors.js';
import type {AdapterDescriptor, ByteSource, ObjectInfo, OperationContext, ReadResult, StorageAdapter, ValidatedList, ValidatedPut, ValidatedRead} from '../types.js';
import {cloneInfo, contentType, DEFAULT_LIMITS, integer, key as validKey, metadata, provided, rangeBounds, record, revision} from '../validation.js';
import {directory, fsError, Spool, trustedRoot} from './files.js';
import type {Temp} from './files.js';
import {Lifecycle} from './lifecycle.js';
import {narrowTransport, Ticket} from './oss-transport.js';
import type {Expected, RequestFunction} from './oss-transport.js';

export interface OssCredentials {accessKeyId: string; accessKeySecret: string; securityToken?: string; expiresAt?: string}
export type OssCredentialProvider = (input: Readonly<{purpose: 'initialize' | 'read' | 'write'; signal: AbortSignal}>) => Promise<OssCredentials>;
export interface OssOptions {namespace: string; region: string; bucket: string; spoolRoot: string; credentials: OssCredentialProvider; maxObjectBytes?: number; maxStagingBytes?: number; maxInFlight?: number}
export interface OssStorageAdapter extends StorageAdapter {close(options?: {timeoutMs?: number}): Promise<void>}
interface SdkResult {status?: number; versionStatus?: string; res?: {status: number; headers: Record<string, unknown>}; stream?: Readable; objects?: {name: unknown}[]; isTruncated?: boolean; nextContinuationToken?: unknown}
interface Sdk {
  parseXML(input: Buffer): Promise<unknown>;
  getBucketVersioning(bucket: string, options: object): Promise<SdkResult>;
  put(key: string, body: Buffer, options: object): Promise<SdkResult>;
  putStream(key: string, body: Readable, options: object): Promise<SdkResult>;
  getStream(key: string, options: object): Promise<SdkResult>;
  head(key: string, options: object): Promise<SdkResult>;
  delete(key: string, options: object): Promise<SdkResult>;
  listV2(query: object, options: object): Promise<SdkResult>;
}
type SdkConstructor = new (options: object) => Sdk;
const hash = (s: string): string => createHash('sha256').update(s).digest('hex');
const marker = (domain: 'namespace' | 'key', value: string): string => createHash('sha256').update('apf-storage/v1\0' + domain + '\0' + value).digest('base64url');
const utf8 = new TextDecoder('utf-8', {fatal: true});
const require = createRequire(import.meta.url);
const markerNames = ['x-oss-meta-apf-format', 'x-oss-meta-apf-namespace', 'x-oss-meta-apf-binding', 'x-oss-meta-apf-key-sha256', 'x-oss-meta-apf-user'];
const canonical = (input: Readonly<Record<string, string>>): string => JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
const pathOf = (physical: string): string => '/' + physical.split('/').map(encodeURIComponent).join('/');

class OssAdapter implements OssStorageAdapter {
  readonly descriptor: Readonly<AdapterDescriptor>;
  readonly #region: string;
  readonly #bucket: string;
  readonly #origin: string;
  readonly #prefix: string;
  readonly #binding: string;
  readonly #scope = randomUUID();
  readonly #provider: OssCredentialProvider;
  readonly #root: string;
  readonly #budget: number;
  readonly #life: Lifecycle;
  #spool!: Spool;
  #invalid = false;
  #SDK!: SdkConstructor;
  #debug!: (namespace: string) => boolean;
  constructor(input: OssOptions, private readonly request?: RequestFunction) {
    const o = record(input, ['namespace', 'region', 'bucket', 'spoolRoot', 'credentials', 'maxObjectBytes', 'maxStagingBytes', 'maxInFlight'], 'head');
    if (typeof o.region !== 'string' || !/^oss-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(o.region) || o.region.length > 63 ||
      typeof o.bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(o.bucket) || typeof o.spoolRoot !== 'string' || typeof o.credentials !== 'function') fail('invalid-input', 'head');
    this.#region = o.region; this.#bucket = o.bucket; this.#root = o.spoolRoot;
    this.#provider = o.credentials as OssCredentialProvider;
    this.#origin = `https://${this.#bucket}.${this.#region}.aliyuncs.com`;
    const namespace = validKey(o.namespace, 'head');
    this.#prefix = `apf-storage/v1/${hash(namespace)}/objects/`;
    this.#binding = hash(JSON.stringify([this.#region, this.#bucket, namespace]));
    this.#budget = integer(provided(o.maxStagingBytes, 128 * 1024 * 1024), 1, Number.MAX_SAFE_INTEGER, 'head');
    this.#life = new Lifecycle(integer(provided(o.maxInFlight, 16), 2, 128, 'head'));
    this.descriptor = Object.freeze({id: 'oss', namespace, maxObjectBytes: integer(provided(o.maxObjectBytes, DEFAULT_LIMITS.maxObjectBytes), 1, 2 ** 31 - 1, 'head'),
      maxListPageSize: 1000, consistency: 'provider-current-version-snapshot', durability: 'oss-versioning-enabled',
      supported: Object.freeze(['put', 'get', 'head', 'exists', 'delete', 'list', 'metadata', 'capability-negotiation', 'copy', 'range-read', 'conditional-read'] as const)});
  }
  #guard = (): void => {
    if (this.#invalid) fail('integrity-error', 'head');
    if (['ali-oss', 'ali-oss:object', 'ali-oss:sts', 'ali-oss:multipart-copy'].some(ns => this.#debug(ns))) fail('permission-denied', 'head');
  };
  async init(): Promise<this> {
    const ctx = new Context('head', 30000, undefined, new ObserverDispatcher(undefined));
    try {
      const sdkPath = require.resolve('ali-oss');
      const sdkRequire = createRequire(sdkPath);
      const pkg = sdkRequire('../package.json') as {version?: unknown};
      if (pkg.version !== '6.23.0') fail('unsupported-capability', 'head');
      const debug = sdkRequire('debug') as {enabled: (name: string) => boolean};
      this.#debug = name => debug.enabled(name);
      this.#guard();
      this.#SDK = require('ali-oss') as SdkConstructor;
      const identity = await trustedRoot(this.#root);
      this.#spool = new Spool(this.#root, identity, this.#budget);
      await this.#spool.accountResiduals();
      const {result} = await this.#call(ctx, '', {}, 'GET', 'initialize', (sdk, opts) => sdk.getBucketVersioning(this.#bucket, opts), {versioning: ''});
      if (result.versionStatus !== 'Enabled') fail('unsupported-capability', 'head');
      ctx.finish(); return this;
    } catch (e) {ctx.finish(e); return fsError(e, 'head');}
  }
  async close(options: {timeoutMs?: number} = {}): Promise<void> {
    const o = record(options, ['timeoutMs'], 'head');
    await this.#life.drain(integer(provided(o.timeoutMs, 30000), 1, 120000, 'head'));
  }
  async #credentials(ctx: OperationContext, purpose: 'initialize' | 'read' | 'write'): Promise<OssCredentials> {
    this.#guard(); ctx.check();
    try {
      const supplied = await ctx.wait(Promise.resolve().then(() => this.#provider(Object.freeze({purpose, signal: ctx.signal}))));
      const c = record(supplied, ['accessKeyId', 'accessKeySecret', 'securityToken', 'expiresAt'], ctx.operation);
      const field = (v: unknown): string => {if (typeof v !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(v)) fail('authentication-failed', ctx.operation); return v;};
      const accessKeyId = field(c.accessKeyId), accessKeySecret = field(c.accessKeySecret);
      let securityToken: string | undefined, expiresAt: string | undefined;
      if (c.securityToken !== undefined) securityToken = field(c.securityToken);
      if (c.expiresAt !== undefined) {
        if (typeof c.expiresAt !== 'string' || !Number.isFinite(Date.parse(c.expiresAt)) || Date.parse(c.expiresAt) <= Date.now() + 60000) fail('authentication-failed', ctx.operation);
        expiresAt = c.expiresAt;
      }
      if (securityToken && !expiresAt) fail('authentication-failed', ctx.operation);
      this.#guard(); ctx.check();
      return Object.freeze({accessKeyId, accessKeySecret, ...(securityToken ? {securityToken} : {}), ...(expiresAt ? {expiresAt} : {})});
    } catch (e) {if (e instanceof StorageError && ['aborted', 'timeout', 'permission-denied'].includes(e.code)) throw e; fail('authentication-failed', ctx.operation);}
  }
  async #call(ctx: OperationContext, physical: string, options: object, method: Expected['method'], purpose: 'initialize' | 'read' | 'write',
    invoke: (sdk: Sdk, options: object) => Promise<SdkResult>, query: Readonly<Record<string, string>> = {}): Promise<{result: SdkResult; ticket: Ticket}> {
    const credentials = await this.#credentials(ctx, purpose);
    const ticket = new Ticket({origin: this.#origin, path: pathOf(physical), query, method, mutation: method === 'PUT' || method === 'DELETE'}, ctx, this.#guard);
    this.#guard(); ctx.check();
    const sdk = new this.#SDK({accessKeyId: credentials.accessKeyId, accessKeySecret: credentials.accessKeySecret,
      ...(credentials.securityToken ? {stsToken: credentials.securityToken} : {}), region: this.#region, bucket: this.#bucket,
      endpoint: `https://${this.#region}.aliyuncs.com`, secure: true, authorizationV4: true, retryMax: 0,
      // Suppress the SDK's generic STS reminder via its explicit interval option;
      // no refresh callback/timer exists: each request gets a new host snapshot.
      enableProxy: false, refreshSTSTokenInterval: 300000, urllib: narrowTransport(this.request), timeout: 120000});
    try {
      const result = await invoke(sdk, {...options, ctx: ticket});
      ctx.check(); return {result, ticket};
    } catch (e) {
      ticket.destroy(); await ticket.settled;
      if (ticket.failure) throw publicError(ticket.failure, ctx.operation, ctx.outcome);
      if (e instanceof StorageError) throw e;
      const raw = e as {status?: unknown; code?: unknown};
      let code: ErrorCode = 'provider-error';
      if (ticket.status === 404 && method === 'HEAD') throw new Head404();
      if (ticket.status === 404 && raw.code === 'NoSuchKey' && ticket.errorBody && method === 'GET') code = 'not-found';
      else if ((ticket.status === 401 || ticket.status === 403) && ['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'SecurityTokenExpired', 'InvalidSecurityToken'].includes(String(raw.code))) code = 'authentication-failed';
      else if (ticket.status === 403 && raw.code === 'AccessDenied') code = 'permission-denied';
      else if (ticket.status === 416 && raw.code === 'InvalidRange') code = 'range-not-satisfiable';
      else if (ticket.status === 429 || ticket.status === 503 && raw.code === 'SlowDown') code = 'rate-limited';
      else if (ticket.status === 500 || ticket.status === 502 || ticket.status === 503 || ticket.status === 504) code = 'unavailable';
      throw new StorageError(code, ctx.operation, ctx.outcome === 'not-applied' ? 'not-applied' : 'unknown');
    }
  }
  #version(headers: Record<string, unknown>, ctx: OperationContext): string {
    const v = headers['x-oss-version-id'];
    if (typeof v !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(v) || v === 'null') {this.#invalid = true; fail('integrity-error', ctx.operation);}
    return revision(v, ctx.operation);
  }
  #info(key: string, result: SdkResult, ctx: OperationContext, range?: ValidatedRead['range']): {info: ObjectInfo; returned: number} {
    try {
      const h = result.res?.headers;
      if (!h) fail('integrity-error', ctx.operation);
      const version = this.#version(h, ctx);
      if (h['x-oss-object-type'] !== 'Normal' || h['content-encoding'] && h['content-encoding'] !== 'identity') fail('integrity-error', ctx.operation);
      for (const name of Object.keys(h)) if (name.startsWith('x-oss-meta-') && !markerNames.includes(name)) fail('integrity-error', ctx.operation);
      if (h['x-oss-meta-apf-format'] !== '1' || h['x-oss-meta-apf-namespace'] !== marker('namespace', this.descriptor.namespace) ||
        h['x-oss-meta-apf-binding'] !== this.#binding || h['x-oss-meta-apf-key-sha256'] !== marker('key', key)) fail('integrity-error', ctx.operation);
      const encoded = h['x-oss-meta-apf-user'];
      if (typeof encoded !== 'string' || encoded.length > 6144 || !/^[A-Za-z0-9_-]+$/.test(encoded)) fail('integrity-error', ctx.operation);
      const raw = Buffer.from(encoded, 'base64url');
      if (raw.toString('base64url') !== encoded) fail('integrity-error', ctx.operation);
      const user = metadata(JSON.parse(utf8.decode(raw)) as unknown, ctx.operation);
      if (canonical(user) !== utf8.decode(raw)) fail('integrity-error', ctx.operation);
      const number = (v: unknown): number => {if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v)) fail('integrity-error', ctx.operation); return integer(Number(v), 0, this.descriptor.maxObjectBytes, ctx.operation);};
      const returned = number(h['content-length']); let sizeBytes = returned;
      if (range) {
        if (result.res?.status !== 206 || typeof h['content-range'] !== 'string') fail('integrity-error', ctx.operation);
        const match = /^bytes (0|[1-9][0-9]*)-(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)$/.exec(h['content-range']);
        if (!match) fail('integrity-error', ctx.operation);
        sizeBytes = number(match[3]); const bounds = rangeBounds(sizeBytes, range, ctx.operation);
        if (Number(match[1]) !== bounds.start || Number(match[2]) !== bounds.end - 1 || returned !== bounds.end - bounds.start) fail('integrity-error', ctx.operation);
      } else if (result.res?.status !== 200 || h['content-range'] !== undefined) fail('integrity-error', ctx.operation);
      if (typeof h['last-modified'] !== 'string') fail('integrity-error', ctx.operation);
      const modifiedAt = new Date(h['last-modified']).toISOString();
      const etag = h.etag;
      if (etag !== undefined && (typeof etag !== 'string' || !/^[\x20-\x7e]{1,256}$/.test(etag))) fail('integrity-error', ctx.operation);
      return {info: {key, sizeBytes, contentType: contentType(h['content-type'], ctx.operation), metadata: user, revision: version, modifiedAt,
        ...(typeof etag === 'string' ? {etag} : {})}, returned};
    } catch {return fail('integrity-error', ctx.operation);}
  }
  async #read(key: string, options: ValidatedRead, ctx: OperationContext): Promise<{result: SdkResult; ticket: Ticket}> {
    const headers = options.range ? {Range: `bytes=${options.range.start}-${options.range.endInclusive ?? ''}`} : {};
    try {return await this.#call(ctx, this.#prefix + key, {headers}, 'GET', 'read', (sdk, opts) => sdk.getStream(this.#prefix + key, opts));}
    catch (e) {if (e instanceof StorageError && e.code === 'not-found' && options.ifRevision !== undefined) fail('precondition-failed', ctx.operation); throw e;}
  }
  async #head(key: string, requested: string | undefined, ctx: OperationContext, versionId?: string): Promise<ObjectInfo> {
    try {
      const {result} = await this.#call(ctx, this.#prefix + key, versionId ? {versionId} : {}, 'HEAD', 'read', (sdk, opts) => sdk.head(this.#prefix + key, opts), versionId ? {versionId} : {});
      const info = this.#info(key, result, ctx).info;
      if (requested !== undefined && info.revision !== requested) fail('precondition-failed', ctx.operation);
      if (versionId && info.revision !== versionId) {this.#invalid = true; fail('integrity-error', ctx.operation);}
      return cloneInfo(info);
    } catch (e) {
      if (!(e instanceof Head404) || versionId) throw e;
      const {result, ticket} = await this.#read(key, {ifRevision: requested, range: undefined}, ctx);
      try {
        const info = this.#info(key, result, ctx).info;
        if (requested !== undefined && info.revision !== requested) fail('precondition-failed', ctx.operation);
        return cloneInfo(info);
      } finally {ticket.destroy(); result.stream?.destroy(); await ticket.settled;}
    }
  }
  async head(key: string, requested: string | undefined, ctx: OperationContext): Promise<ObjectInfo> {
    const leave = this.#life.enter(ctx);
    try {return await this.#head(key, requested, ctx);} finally {leave();}
  }
  async get(key: string, options: ValidatedRead, ctx: OperationContext): Promise<ReadResult> {
    const leave = this.#life.enter(ctx); let transferred = false;
    let ticket: Ticket | undefined;
    try {
      const opened = await this.#read(key, options, ctx); ticket = opened.ticket;
      const {info, returned} = this.#info(key, opened.result, ctx, options.range);
      if (options.ifRevision !== undefined && info.revision !== options.ifRevision) fail('precondition-failed', ctx.operation);
      const stream = opened.result.stream;
      if (!(stream instanceof Readable)) fail('integrity-error', ctx.operation);
      const iterator = stream[Symbol.asyncIterator](); const wire = ticket;
      let size = 0, closed = false, pending: Promise<unknown> = Promise.resolve(), closePromise: Promise<void> | undefined;
      const close = (): Promise<void> => {
        closed = true; wire.destroy(); stream.destroy();
        if (!closePromise) closePromise = (async () => {await pending.catch(() => {}); await wire.settled; ctx.signal.removeEventListener('abort', abort); leave();})();
        return closePromise;
      };
      const abort = (): void => {void close().catch(() => {});};
      const body: AsyncIterableIterator<Uint8Array> = {
        [Symbol.asyncIterator]() {return this;},
        async next() {
          ctx.check(); if (closed) return {done: true, value: undefined};
          const action = pending.then(async () => {
            ctx.check(); const next = await iterator.next(); ctx.check();
            if (next.done) {if (size !== returned) fail('integrity-error', ctx.operation); return {done: true as const, value: undefined};}
            if (!(next.value instanceof Uint8Array) || next.value.byteLength > returned - size) fail('integrity-error', ctx.operation);
            size += next.value.byteLength; return {done: false as const, value: new Uint8Array(next.value)};
          }); pending = action;
          try {const result = await action; if (result.done) await close(); return result;}
          catch (e) {await close(); if (ctx.signal.aborted) ctx.check(); if (e instanceof StorageError) throw e; fail('integrity-error', ctx.operation);}
        },
        async return() {await close(); return {done: true, value: undefined};},
        async throw() {await close(); fail('aborted', ctx.operation);},
      };
      transferred = true; ctx.signal.addEventListener('abort', abort, {once: true});
      if (ctx.signal.aborted) {await close(); ctx.check();}
      return {info: cloneInfo(info), returnedBytes: returned, body};
    } finally {if (!transferred) {ticket?.destroy(); await ticket?.settled; leave();}}
  }
  async put(key: string, body: ByteSource, options: ValidatedPut, ctx: OperationContext): Promise<ObjectInfo> {
    if (options.condition || !options.overwrite) fail('unsupported-capability', ctx.operation);
    const leave = this.#life.enter(ctx); let staged: Temp | undefined, stream: Readable | undefined;
    try {
      this.#guard(); await directory(this.#root, this.#spool.identity, ctx.operation); ctx.check();
      staged = await this.#spool.stage(body, options.maxObjectBytes, options.contentLength, ctx);
      const meta = {'apf-format': '1', 'apf-namespace': marker('namespace', this.descriptor.namespace), 'apf-binding': this.#binding,
        'apf-key-sha256': marker('key', key), 'apf-user': Buffer.from(canonical(options.metadata)).toString('base64url')};
      const size = staged.bytes;
      if (size > 0) stream = staged.fd.createReadStream({autoClose: false, start: 0, end: size - 1});
      const input = stream;
      const {result} = await this.#call(ctx, this.#prefix + key, {meta, mime: options.contentType, contentLength: size}, 'PUT', 'write',
        (sdk, opts) => input ? sdk.putStream(this.#prefix + key, input, opts) : sdk.put(this.#prefix + key, Buffer.alloc(0), opts));
      ctx.markApplied();
      const versionId = this.#version(result.res?.headers ?? {}, ctx);
      const info = await this.#head(key, undefined, ctx, versionId);
      if (info.sizeBytes !== size || info.contentType !== options.contentType || canonical(info.metadata) !== canonical(options.metadata)) fail('integrity-error', ctx.operation);
      return info;
    } catch (e) {return fsError(e, ctx.operation);}
    finally {
      try {
        if (stream && !stream.closed) {await new Promise<void>(resolve => {stream!.once('close', resolve); stream!.destroy();});}
        if (staged) await this.#spool.cleanup(staged, ctx.operation);
      } finally {leave();}
    }
  }
  async delete(key: string, requested: string | undefined, ctx: OperationContext): Promise<{absent: true}> {
    if (requested !== undefined) fail('unsupported-capability', ctx.operation);
    const leave = this.#life.enter(ctx);
    try {await this.#call(ctx, this.#prefix + key, {}, 'DELETE', 'write', (sdk, opts) => sdk.delete(this.#prefix + key, opts)); ctx.markApplied(); return {absent: true};}
    finally {leave();}
  }
  async list(options: ValidatedList, ctx: OperationContext): Promise<{items: ObjectInfo[]; nextCursor: string | null}> {
    const leave = this.#life.enter(ctx);
    try {
      let token: string | undefined;
      if (options.cursor !== undefined) {
        try {
          const raw = Buffer.from(options.cursor, 'base64url');
          if (options.cursor.length > 8192 || raw.toString('base64url') !== options.cursor) throw new Error();
          const c = record(JSON.parse(utf8.decode(raw)) as unknown, ['v', 'adapter', 'binding', 'instance', 'namespace', 'prefix', 'token'], ctx.operation);
          if (JSON.stringify(c) !== utf8.decode(raw)) throw new Error();
          if (c.v !== 1 || c.adapter !== 'oss' || c.binding !== this.#binding || c.instance !== this.#scope || c.namespace !== this.descriptor.namespace || c.prefix !== options.prefix ||
            typeof c.token !== 'string' || c.token.length === 0 || Buffer.byteLength(c.token) > 4096 || !c.token.isWellFormed()) throw new Error();
          token = c.token;
        } catch {fail('invalid-cursor', ctx.operation);}
      }
      const query = {'list-type': '2', prefix: this.#prefix + options.prefix, 'max-keys': String(options.pageSize), ...(token ? {'continuation-token': token} : {})};
      const {result} = await this.#call(ctx, '', {}, 'GET', 'read', async (sdk, opts) => {
        const result = await sdk.listV2({...query}, opts);
        const ticket = (opts as {ctx: Ticket}).ctx;
        if (!ticket.buffered) fail('integrity-error', ctx.operation);
        let raw: Record<string, unknown>;
        try {raw = record(await sdk.parseXML(ticket.buffered), null, ctx.operation);} catch {return fail('integrity-error', ctx.operation);}
        if (raw.Name !== this.#bucket || raw.Prefix !== query.prefix || raw.MaxKeys !== query['max-keys'] ||
          !['true', 'false'].includes(String(raw.IsTruncated)) || raw.KeyCount !== String(result.objects?.length ?? 0)) fail('integrity-error', ctx.operation);
        return result;
      }, query);
      if (!Array.isArray(result.objects) || result.objects.length > options.pageSize || typeof result.isTruncated !== 'boolean') fail('integrity-error', ctx.operation);
      const names = result.objects.map(item => {
        if (typeof item.name !== 'string' || !item.name.startsWith(this.#prefix + options.prefix)) fail('integrity-error', ctx.operation);
        try {return validKey(item.name.slice(this.#prefix.length), ctx.operation);} catch {return fail('integrity-error', ctx.operation);}
      });
      if (new Set(names).size !== names.length) fail('integrity-error', ctx.operation);
      const infos: (ObjectInfo | undefined)[] = new Array(names.length); let next = 0;
      const jobs = Array.from({length: Math.min(4, names.length)}, async () => {
        while (next < names.length) {
          const index = next++;
          try {infos[index] = await this.#head(names[index]!, undefined, ctx);}
          catch (e) {if (!(e instanceof StorageError && e.code === 'not-found')) throw e;}
        }
      });
      const results = await Promise.allSettled(jobs);
      const error = results.find(r => r.status === 'rejected'); if (error?.status === 'rejected') throw error.reason;
      let nextCursor: string | null = null;
      if (result.isTruncated) {
        const continuation = result.nextContinuationToken;
        if (typeof continuation !== 'string' || continuation.length === 0 || Buffer.byteLength(continuation) > 4096 || !continuation.isWellFormed()) fail('integrity-error', ctx.operation);
        nextCursor = Buffer.from(JSON.stringify({v: 1, adapter: 'oss', binding: this.#binding, instance: this.#scope, namespace: this.descriptor.namespace, prefix: options.prefix, token: continuation})).toString('base64url');
        if (nextCursor.length > 8192) fail('limit-exceeded', ctx.operation);
      }
      ctx.check(); return {items: infos.filter((x): x is ObjectInfo => x !== undefined).map(cloneInfo), nextCursor};
    } finally {leave();}
  }
}
class Head404 extends Error {}
export async function createOssAdapter(options: OssOptions): Promise<OssStorageAdapter> {return new OssAdapter(options).init();}
/** Private integration-test constructor. No transport override is accepted in public options. */
export async function createOssAdapterForTest(options: OssOptions, request: RequestFunction): Promise<OssStorageAdapter> {return new OssAdapter(options, request).init();}
