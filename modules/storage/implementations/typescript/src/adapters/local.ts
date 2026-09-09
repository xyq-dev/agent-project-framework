import {createHash, randomUUID} from 'node:crypto';
import {lstat, mkdir, open, rename, unlink} from 'node:fs/promises';
import type {FileHandle} from 'node:fs/promises';
import {join} from 'node:path';
import {fail, StorageError} from '../errors.js';
import type {AdapterDescriptor, ByteSource, ObjectInfo, Operation, OperationContext, ReadResult, StorageAdapter, ValidatedList, ValidatedPut, ValidatedRead} from '../types.js';
import {cloneInfo, contentType, DEFAULT_LIMITS, integer, key as validKey, metadata, provided, rangeBounds, record} from '../validation.js';
import {CloseGuard, CREATE, directory, entries, fsError, readAll, same, secureOpen, secureStat, Spool, syncDirectory, trustedRoot, writeAll} from './files.js';
import type {CloseResource, Identity, Temp} from './files.js';
import {Lifecycle, Mutex} from './lifecycle.js';

export interface LocalOptions {namespace: string; root: string; maxObjectBytes?: number; maxStagingBytes?: number; maxObjects?: number; maxInFlight?: number}
export interface LocalStorageAdapter extends StorageAdapter {close(options?: {timeoutMs?: number}): Promise<void>}
/** Internal test seam: not exported by the package entry point or accepted in public options. */
export interface LocalTestHooks {
  phase?: (phase: 'staged' | 'before-rename' | 'after-rename') => Promise<void>;
  rename?: typeof rename;
  openObject?: typeof secureOpen;
  syncDirectory?: typeof syncDirectory;
  read?: typeof readAll;
  unlink?: typeof unlink;
}
interface Manifest {formatVersion: 1; kind: 'apf-local'; namespace: string; bindingId: string}
interface Opened {fd: FileHandle; info: ObjectInfo; offset: number}
const magic = Buffer.from('APFST01\n');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = (key: string): string => createHash('sha256').update(key).digest('hex');
const utf8 = new TextDecoder('utf-8', {fatal: true});

async function jsonFile(path: string, op: Operation, close: CloseResource): Promise<{value: unknown; identity: Identity}> {
  const fd = await secureOpen(path, op, close);
  try {
    const s = await fd.stat();
    if (s.size < 2 || s.size > 8192) fail('integrity-error', op);
    const raw = utf8.decode(await readAll(fd, s.size, 0, op));
    const value: unknown = JSON.parse(raw);
    if (JSON.stringify(value) !== raw) fail('integrity-error', op);
    return {value, identity: {dev: s.dev, ino: s.ino}};
  } catch {return fail('integrity-error', op);} finally {await close(fd);}
}
async function envelope(fd: FileHandle, fileName: string, max: number, op: Operation): Promise<{info: ObjectInfo; offset: number}> {
  try {
    const s = await fd.stat();
    if (s.size < 14 || s.size > max + 65548) fail('integrity-error', op);
    const prefix = await readAll(fd, 12, 0, op);
    if (!prefix.subarray(0, 8).equals(magic)) fail('integrity-error', op);
    const length = prefix.readUInt32BE(8);
    if (length < 2 || length > 65536) fail('integrity-error', op);
    const raw = utf8.decode(await readAll(fd, length, 12, op));
    const parsed: unknown = JSON.parse(raw);
    if (JSON.stringify(parsed) !== raw) fail('integrity-error', op);
    const h = record(parsed,
      ['formatVersion', 'key', 'sizeBytes', 'contentType', 'metadata', 'revision', 'modifiedAt'], op);
    const key = validKey(h.key, op), sizeBytes = integer(h.sizeBytes, 0, max, op);
    if (h.formatVersion !== 1 || fileName !== digest(key) || typeof h.revision !== 'string' || !uuid.test(h.revision) ||
      typeof h.modifiedAt !== 'string' || new Date(h.modifiedAt).toISOString() !== h.modifiedAt || s.size !== 12 + length + sizeBytes) fail('integrity-error', op);
    return {info: {key, sizeBytes, contentType: contentType(h.contentType, op), metadata: metadata(h.metadata, op),
      revision: h.revision, modifiedAt: h.modifiedAt}, offset: 12 + length};
  } catch {return fail('integrity-error', op);}
}

class LocalAdapter implements LocalStorageAdapter {
  readonly descriptor: Readonly<AdapterDescriptor>;
  readonly #life: Lifecycle;
  readonly #closer = new CloseGuard(() => this.#life.seal());
  readonly #mutex = new Mutex();
  readonly #keys = new Set<string>();
  readonly #scope = randomUUID();
  readonly #root: string;
  readonly #maxObjects: number;
  readonly #maxStaging: number;
  readonly #lockToken = randomUUID();
  #rootId!: Identity;
  #objectsId!: Identity;
  #manifestId!: Identity;
  #lockId!: Identity;
  #manifest!: Manifest;
  #spool!: Spool;
  #unlocked = false;
  #uncertainMutation = false;
  #closePromise: Promise<void> | undefined;

  constructor(input: LocalOptions, private readonly hooks: LocalTestHooks) {
    const o = record(input, ['namespace', 'root', 'maxObjectBytes', 'maxStagingBytes', 'maxObjects', 'maxInFlight'], 'head');
    if (typeof o.root !== 'string') fail('invalid-input', 'head');
    this.#root = o.root;
    this.#maxObjects = integer(provided(o.maxObjects, 10000), 1, 10000, 'head');
    this.#maxStaging = integer(provided(o.maxStagingBytes, 128 * 1024 * 1024), 1, Number.MAX_SAFE_INTEGER, 'head');
    this.#life = new Lifecycle(integer(provided(o.maxInFlight, 16), 2, 128, 'head'));
    this.descriptor = Object.freeze({id: 'local', namespace: validKey(o.namespace, 'head'),
      maxObjectBytes: integer(provided(o.maxObjectBytes, DEFAULT_LIMITS.maxObjectBytes), 1, 2 ** 31 - 1, 'head'), maxListPageSize: 1000,
      consistency: 'single-writer-single-object-linearizable', durability: 'local-filesystem-process-crash',
      supported: Object.freeze(['put', 'get', 'head', 'exists', 'delete', 'list', 'metadata', 'capability-negotiation', 'copy', 'range-read', 'conditional-read', 'conditional-write', 'conditional-delete'] as const)});
  }
  async init(): Promise<this> {
    let locked = false;
    try {
      this.#rootId = await trustedRoot(this.#root);
      const initial = await entries(this.#root, 5, 'head', this.#closer.close);
      const fresh = initial.length === 0;
      if (!fresh && (initial.some(n => !['manifest.json', 'objects', 'tmp', 'writer.lock'].includes(n)) || !initial.includes('manifest.json'))) fail('integrity-error', 'head');
      let lock: FileHandle;
      try {lock = await open(join(this.#root, 'writer.lock'), CREATE, 0o600);}
      catch (e) {if ((e as {code?: string}).code === 'EEXIST') fail('unavailable', 'head'); throw e;}
      try {
        const s = await lock.stat(); secureStat(s, false, 'head'); this.#lockId = {dev: s.dev, ino: s.ino};
        await writeAll(lock, Buffer.from(JSON.stringify({token: this.#lockToken, pid: process.pid})), 0);
        await lock.sync(); locked = true;
      } finally {await this.#closer.close(lock);}
      if (fresh) {
        if ((await entries(this.#root, 2, 'head', this.#closer.close)).some(n => n !== 'writer.lock')) fail('integrity-error', 'head');
        this.#manifest = {formatVersion: 1, kind: 'apf-local', namespace: this.descriptor.namespace, bindingId: randomUUID()};
        const path = join(this.#root, randomUUID() + '.manifest');
        const file = await open(path, CREATE, 0o600);
        try {await writeAll(file, Buffer.from(JSON.stringify(this.#manifest)), 0); await file.sync();} finally {await this.#closer.close(file);}
        await mkdir(join(this.#root, 'objects'), {mode: 0o700});
        await mkdir(join(this.#root, 'tmp'), {mode: 0o700});
        await rename(path, join(this.#root, 'manifest.json'));
        await syncDirectory(this.#root, this.#closer.close);
      }
      const loaded = await jsonFile(join(this.#root, 'manifest.json'), 'head', this.#closer.close);
      let m: Record<string, unknown>;
      try {m = record(loaded.value, ['formatVersion', 'kind', 'namespace', 'bindingId'], 'head');} catch {fail('integrity-error', 'head');}
      if (m.formatVersion !== 1 || m.kind !== 'apf-local' || m.namespace !== this.descriptor.namespace || typeof m.bindingId !== 'string' || !uuid.test(m.bindingId)) fail('integrity-error', 'head');
      this.#manifest = m as unknown as Manifest;
      this.#manifestId = loaded.identity;
      this.#objectsId = await directory(join(this.#root, 'objects'), undefined, 'head');
      const tmpId = await directory(join(this.#root, 'tmp'), undefined, 'head');
      this.#spool = new Spool(join(this.#root, 'tmp'), tmpId, this.#maxStaging, this.#closer.close);
      await this.#spool.accountResiduals();
      for (const name of await entries(join(this.#root, 'objects'), this.#maxObjects, 'head', this.#closer.close)) {
        if (!/^[0-9a-f]{64}$/.test(name)) fail('integrity-error', 'head');
        const fd = await secureOpen(join(this.#root, 'objects', name), 'head', this.#closer.close);
        try {this.#keys.add((await envelope(fd, name, this.descriptor.maxObjectBytes, 'head')).info.key);} finally {await this.#closer.close(fd);}
      }
      await this.#guard('head');
      return this;
    } catch (e) {
      if (locked && !this.#closer.failed) {try {await this.#unlock();} catch { /* fail closed: retain an unverifiable lock */ }}
      return fsError(e, 'head');
    }
  }
  async #guard(op: Operation): Promise<void> {
    if (this.#closer.failed) fail('provider-error', op);
    try {
      if (this.#uncertainMutation) fail('integrity-error', op);
      await directory(this.#root, this.#rootId, op);
      await directory(join(this.#root, 'objects'), this.#objectsId, op);
      await directory(this.#spool.path, this.#spool.identity, op);
      const m = await jsonFile(join(this.#root, 'manifest.json'), op, this.#closer.close);
      if (!same(m.identity, this.#manifestId) || JSON.stringify(m.value) !== JSON.stringify(this.#manifest)) fail('integrity-error', op);
      await this.#verifyLock(op);
    } catch {fail('integrity-error', op);}
  }
  async #verifyLock(op: Operation): Promise<void> {
    const lock = await jsonFile(join(this.#root, 'writer.lock'), op, this.#closer.close);
    const value = record(lock.value, ['token', 'pid'], op);
    if (!same(lock.identity, this.#lockId) || value.token !== this.#lockToken || value.pid !== process.pid) fail('integrity-error', op);
  }
  async #unlock(): Promise<void> {
    if (this.#closer.failed) fail('provider-error', 'head');
    if (this.#unlocked) return;
    await directory(this.#root, this.#rootId, 'head');
    await this.#verifyLock('head');
    await unlink(join(this.#root, 'writer.lock'));
    await syncDirectory(this.#root, this.#closer.close);
    this.#unlocked = true;
  }
  async close(options: {timeoutMs?: number} = {}): Promise<void> {
    const o = record(options, ['timeoutMs'], 'head');
    const timeout = integer(provided(o.timeoutMs, 30000), 1, 120000, 'head');
    if (!this.#closePromise) {
      this.#closePromise = (async () => {await this.#life.drain(timeout); await this.#unlock();})().catch(e => {this.#closePromise = undefined; return fsError(e, 'head');});
    }
    return this.#closePromise;
  }
  async #opened(key: string, revision: string | undefined, ctx: OperationContext): Promise<Opened> {
    ctx.check();
    let fd: FileHandle;
    try {fd = await (this.hooks.openObject ?? secureOpen)(join(this.#root, 'objects', digest(key)), ctx.operation, this.#closer.close);}
    catch (e) {if ((e as {code?: string}).code === 'ENOENT') fail(revision === undefined ? 'not-found' : 'precondition-failed', ctx.operation); throw e;}
    try {
      ctx.check();
      const loaded = await envelope(fd, digest(key), this.descriptor.maxObjectBytes, ctx.operation);
      if (loaded.info.key !== key) fail('integrity-error', ctx.operation);
      if (revision !== undefined && loaded.info.revision !== revision) fail('precondition-failed', ctx.operation);
      ctx.check();
      return {fd, ...loaded};
    } catch (e) {await this.#closer.close(fd); throw e;}
  }
  async head(key: string, revision: string | undefined, ctx: OperationContext): Promise<ObjectInfo> {
    const leave = this.#life.enter(ctx);
    try {await this.#guard(ctx.operation); const opened = await this.#opened(key, revision, ctx); try {return cloneInfo(opened.info);} finally {await this.#closer.close(opened.fd);}}
    catch (e) {return fsError(e, ctx.operation);} finally {leave();}
  }
  async get(key: string, options: ValidatedRead, ctx: OperationContext): Promise<ReadResult> {
    const leave = this.#life.enter(ctx);
    let transferred = false, opened: Opened | undefined;
    try {
      await this.#guard(ctx.operation);
      opened = await this.#opened(key, options.ifRevision, ctx);
      const snapshot = opened;
      const read = this.hooks.read ?? readAll;
      const {start, end} = rangeBounds(snapshot.info.sizeBytes, options.range, ctx.operation);
      let position = start, closing = false;
      let pending: Promise<unknown> = Promise.resolve(), closePromise: Promise<void> | undefined;
      const close = (): Promise<void> => {
        closing = true;
        if (!closePromise) closePromise = (async () => {try {await pending.catch(() => {}); await this.#closer.close(snapshot.fd);} finally {ctx.signal.removeEventListener('abort', abort); leave();}})();
        return closePromise;
      };
      const abort = (): void => {void close().catch(() => {});};
      const body: AsyncIterableIterator<Uint8Array> = {
        [Symbol.asyncIterator]() {return this;},
        async next() {
          ctx.check();
          if (closing || position >= end) {await close(); return {done: true, value: undefined};}
          const action = pending.then(async () => {
            ctx.check();
            if (closing || position >= end) return {done: true as const, value: undefined};
            const length = Math.min(65536, end - position);
            const value = await read(snapshot.fd, length, snapshot.offset + position, ctx.operation);
            ctx.check(); position += length;
            return {done: false as const, value: new Uint8Array(value)};
          });
          pending = action;
          try {return await action;} catch (e) {await close(); return fsError(e, ctx.operation);}
        },
        async return() {await close(); return {done: true, value: undefined};},
        async throw() {await close(); throw new StorageError('aborted', ctx.operation);},
      };
      transferred = true;
      ctx.signal.addEventListener('abort', abort, {once: true});
      if (ctx.signal.aborted) {await close(); ctx.check();}
      return {info: cloneInfo(snapshot.info), returnedBytes: end - start, body};
    } catch (e) {if (opened && !transferred) await this.#closer.close(opened.fd); return fsError(e, ctx.operation);}
    finally {if (!transferred) leave();}
  }
  async put(key: string, body: ByteSource, options: ValidatedPut, ctx: OperationContext): Promise<ObjectInfo> {
    const leave = this.#life.enter(ctx);
    let staged: Temp | undefined, target: Temp | undefined;
    try {
      await this.#guard(ctx.operation);
      staged = await this.#spool.stage(body, options.maxObjectBytes, options.contentLength, ctx);
      await this.hooks.phase?.('staged'); ctx.check();
      const info: ObjectInfo = {key, sizeBytes: staged.bytes, contentType: options.contentType, metadata: {...options.metadata}, revision: randomUUID(), modifiedAt: new Date().toISOString()};
      const header = Buffer.from(JSON.stringify({formatVersion: 1, ...info}));
      if (header.length > 65536) fail('limit-exceeded', ctx.operation);
      const prefix = Buffer.alloc(12); magic.copy(prefix); prefix.writeUInt32BE(header.length, 8);
      target = await this.#spool.create(ctx.operation);
      await this.#spool.append(target, prefix, ctx.operation);
      await this.#spool.append(target, header, ctx.operation);
      for (let offset = 0; offset < staged.bytes;) {
        ctx.check(); const n = Math.min(65536, staged.bytes - offset);
        await this.#spool.append(target, await readAll(staged.fd, n, offset, ctx.operation), ctx.operation); offset += n;
      }
      await target.fd.sync(); await this.#spool.closeFile(target);
      const envelopeTemp = target;
      await this.#mutex.run(async () => {
        await this.#guard(ctx.operation); ctx.check();
        let old: Opened | undefined;
        try {old = await this.#opened(key, undefined, ctx);} catch (e) {if (!(e instanceof StorageError && e.code === 'not-found')) throw e;}
        try {
          if (options.condition?.kind === 'if-absent' && old || options.condition?.kind === 'if-revision' && (!old || old.info.revision !== options.condition.revision)) fail('precondition-failed', ctx.operation);
          if (!old && this.#keys.size >= this.#maxObjects) fail('limit-exceeded', ctx.operation);
        } finally {if (old) await this.#closer.close(old.fd);}
        await this.hooks.phase?.('before-rename'); ctx.check();
        const tempStat = await lstat(envelopeTemp.path);
        secureStat(tempStat, false, ctx.operation);
        if (!same(tempStat, envelopeTemp.identity)) fail('integrity-error', ctx.operation);
        await this.#guard(ctx.operation); ctx.check();
        if (this.#closer.failed) fail('provider-error', ctx.operation);
        ctx.markDispatched();
        try {await (this.hooks.rename ?? rename)(envelopeTemp.path, join(this.#root, 'objects', digest(key)));}
        catch (e) {this.#uncertainMutation = true; throw e;}
        envelopeTemp.moved = true; this.#keys.add(key); ctx.markApplied();
        await this.hooks.phase?.('after-rename');
        await (this.hooks.syncDirectory ?? syncDirectory)(join(this.#root, 'objects'), this.#closer.close);
        ctx.check();
      });
      return cloneInfo(info);
    } catch (e) {return fsError(e, ctx.operation);}
    finally {
      try {if (target) await this.#spool.cleanup(target, ctx.operation);}
      finally {try {if (staged) await this.#spool.cleanup(staged, ctx.operation);} finally {leave();}}
    }
  }
  async delete(key: string, revision: string | undefined, ctx: OperationContext): Promise<{absent: true}> {
    const leave = this.#life.enter(ctx);
    try {
      await this.#mutex.run(async () => {
        await this.#guard(ctx.operation); ctx.check();
        let old: Opened | undefined;
        try {old = await this.#opened(key, revision, ctx);} catch (e) {if (!(e instanceof StorageError && e.code === 'not-found' && revision === undefined)) throw e;}
        if (!old) {ctx.markApplied(); return;}
        await this.#closer.close(old.fd); ctx.check();
        if (this.#closer.failed) fail('provider-error', ctx.operation);
        ctx.markDispatched();
        try {await (this.hooks.unlink ?? unlink)(join(this.#root, 'objects', digest(key)));}
        catch (e) {this.#uncertainMutation = true; throw e;}
        this.#keys.delete(key); ctx.markApplied();
        await (this.hooks.syncDirectory ?? syncDirectory)(join(this.#root, 'objects'), this.#closer.close); ctx.check();
      });
      return {absent: true};
    } catch (e) {return fsError(e, ctx.operation);} finally {leave();}
  }
  async list(options: ValidatedList, ctx: OperationContext): Promise<{items: ObjectInfo[]; nextCursor: string | null}> {
    const leave = this.#life.enter(ctx);
    try {
      let after: string | undefined;
      if (options.cursor !== undefined) {
        try {
          const bytes = Buffer.from(options.cursor, 'base64url');
          if (bytes.toString('base64url') !== options.cursor || options.cursor.length > 8192) throw new Error();
          const c = record(JSON.parse(utf8.decode(bytes)) as unknown, ['v', 'adapter', 'binding', 'instance', 'namespace', 'prefix', 'after'], ctx.operation);
          if (JSON.stringify(c) !== utf8.decode(bytes)) throw new Error();
          if (c.v !== 1 || c.adapter !== 'local' || c.binding !== this.#manifest.bindingId || c.instance !== this.#scope || c.namespace !== this.descriptor.namespace || c.prefix !== options.prefix) throw new Error();
          after = validKey(c.after, ctx.operation); if (!after.startsWith(options.prefix)) throw new Error();
        } catch {fail('invalid-cursor', ctx.operation);}
      }
      await this.#guard(ctx.operation); ctx.check();
      const keys = [...this.#keys].filter(k => k.startsWith(options.prefix) && (after === undefined || Buffer.compare(Buffer.from(k), Buffer.from(after)) > 0))
        .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
      const page = keys.slice(0, options.pageSize), items: ObjectInfo[] = [];
      for (const key of page) {
        let opened: Opened;
        try {opened = await this.#opened(key, undefined, ctx);} catch (e) {if (e instanceof StorageError && e.code === 'not-found') continue; throw e;}
        try {items.push(cloneInfo(opened.info));} finally {await this.#closer.close(opened.fd);}
      }
      const nextCursor = keys.length > page.length ? Buffer.from(JSON.stringify({v: 1, adapter: 'local', binding: this.#manifest.bindingId, instance: this.#scope,
        namespace: this.descriptor.namespace, prefix: options.prefix, after: page.at(-1)})).toString('base64url') : null;
      ctx.check(); return {items, nextCursor};
    } catch (e) {return fsError(e, ctx.operation);} finally {leave();}
  }
}
export async function createLocalAdapter(options: LocalOptions): Promise<LocalStorageAdapter> {return new LocalAdapter(options, {}).init();}
export async function createLocalAdapterForTest(options: LocalOptions, hooks: LocalTestHooks): Promise<LocalStorageAdapter> {return new LocalAdapter(options, hooks).init();}
