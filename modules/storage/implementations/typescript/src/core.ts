import {Context, ObserverDispatcher, closeIterator} from './context.js';
import {StorageError, fail, publicError, READ_OPERATIONS} from './errors.js';
import {guardedInput, managedRead} from './streams.js';
import {CAPABILITIES} from './types.js';
import type {CapabilityId, Observer, Operation, ReadResult, Storage, StorageAdapter, StorageLimits, ValidatedRead} from './types.js';
import * as validate from './validation.js';

const COMMON = ['timeoutMs', 'signal'];
const BASE: readonly CapabilityId[] = ['put', 'get', 'head', 'exists', 'delete', 'list', 'metadata', 'capability-negotiation'];
const DEFERRED: readonly CapabilityId[] = ['move', 'multipart', 'signed-upload-url', 'signed-download-url'];

export function createStorage(binding: {adapter: StorageAdapter; namespace: string}, limits: Partial<StorageLimits> = {}, observer?: Observer): Storage {
  validate.record(binding, ['adapter', 'namespace'], 'head');
  validate.key(binding.namespace, 'head');
  const adapter = binding.adapter, descriptor = adapter?.descriptor;
  if (!descriptor || descriptor.namespace !== binding.namespace || typeof descriptor.id !== 'string') fail('invalid-input', 'head');
  for (const operation of ['put', 'get', 'head', 'delete', 'list'] as const) if (typeof adapter[operation] !== 'function') fail('invalid-input', 'head');
  if (!Array.isArray(descriptor.supported) || !BASE.every(c => descriptor.supported.includes(c)) ||
    descriptor.supported.some(c => !CAPABILITIES.includes(c) || DEFERRED.includes(c))) fail('unsupported-capability', 'head');
  const supported = new Set(descriptor.supported);
  const input = validate.record(limits, Object.keys(validate.DEFAULT_LIMITS), 'head');
  const maxObject = validate.integer(descriptor.maxObjectBytes, 1, Number.MAX_SAFE_INTEGER, 'head');
  const maxPage = validate.integer(descriptor.maxListPageSize, 1, 1000, 'head');
  const config: StorageLimits = {
    maxObjectBytes: validate.integer(validate.provided(input.maxObjectBytes, validate.DEFAULT_LIMITS.maxObjectBytes), 1, maxObject, 'head'),
    listPageSize: validate.integer(validate.provided(input.listPageSize, 100), 1, maxPage, 'head'),
    maxListPageSize: validate.integer(validate.provided(input.maxListPageSize, 1000), 1, maxPage, 'head'),
    timeoutMs: validate.integer(validate.provided(input.timeoutMs, 30000), 1, 120000, 'head'),
  };
  if (config.listPageSize > config.maxListPageSize || (observer !== undefined && typeof observer !== 'function')) fail('invalid-input', 'head');
  const consistency = descriptor.consistency, durability = descriptor.durability;
  const dispatcher = new ObserverDispatcher(observer);
  const need = (capability: CapabilityId, operation: Operation): void => {if (!supported.has(capability)) fail('unsupported-capability', operation);};
  const options = (value: unknown, names: string[], operation: Operation): Record<string, unknown> => {
    const o = validate.record(value, [...COMMON, ...names], operation);
    if (o.timeoutMs !== undefined) validate.integer(o.timeoutMs, 1, 120000, operation);
    if (o.signal !== undefined && !(o.signal instanceof AbortSignal)) fail('invalid-input', operation);
    return {...o};
  };
  async function run<T>(operation: Operation, o: Record<string, unknown>, action: (ctx: Context) => Promise<T>, stream?: (result: T, ctx: Context) => T): Promise<T> {
    const ctx = new Context(operation, (o.timeoutMs as number | undefined) ?? config.timeoutMs, o.signal as AbortSignal | undefined, dispatcher);
    let result: T | undefined;
    const disposeRead = stream ? (r: T) => closeIterator((r as ReadResult).body) : undefined;
    try {
      for (let attempt = 0; ; attempt++) {
        ctx.check();
        try {result = await ctx.wait(action(ctx), disposeRead); break;}
        catch (raw) {
          const error = publicError(raw, operation, ctx.outcome);
          if (attempt !== 0 || !READ_OPERATIONS.has(operation) || !error.retryable || ctx.signal.aborted) throw error;
          // Two attempts maximum, sharing the original deadline and signal.
          await ctx.wait(new Promise<void>(resolve => setTimeout(resolve, 5)));
        }
      }
      ctx.check();
      if (stream) return stream(result, ctx);
      ctx.finish(undefined, typeof result === 'object' && result !== null && 'sizeBytes' in result ? (result as {sizeBytes: number}).sizeBytes : undefined);
      return result;
    } catch (raw) {
      if (result !== undefined) disposeRead?.(result);
      const error = publicError(raw, operation, ctx.outcome);
      ctx.finish(error);
      throw error;
    }
  }
  function readOptions(o: Record<string, unknown>, operation: Operation): ValidatedRead {
    const ifRevision = o.ifRevision === undefined ? undefined : validate.revision(o.ifRevision, operation);
    if (ifRevision !== undefined) need('conditional-read', operation);
    let range: ValidatedRead['range'];
    if (o.range !== undefined) {
      need('range-read', operation);
      const r = validate.record(o.range, ['start', 'endInclusive'], operation);
      const start = validate.integer(r.start, 0, Number.MAX_SAFE_INTEGER, operation);
      const end = r.endInclusive === undefined ? undefined : validate.integer(r.endInclusive, start, Number.MAX_SAFE_INTEGER, operation);
      range = {start, ...(end === undefined ? {} : {endInclusive: end})};
    }
    return {ifRevision, range};
  }
  return {
    capabilities: () => ({supported: [...supported], limits: {...config}, consistency, durability}),
    async put(k, body, opts = {}) {
      validate.key(k, 'put');
      const o = options(opts, ['overwrite', 'condition', 'contentLength', 'contentType', 'metadata'], 'put');
      const p = validate.putOptions(o, config, 'put');
      if (p.condition) need('conditional-write', 'put');
      validate.source(body, 'put');
      return run('put', o, async ctx => validate.cloneInfo(await adapter.put(k, guardedInput(body, ctx, config.maxObjectBytes, p.contentLength), p, ctx)));
    },
    async get(k, opts = {}) {
      validate.key(k, 'get');
      const o = options(opts, ['ifRevision', 'range'], 'get'), p = readOptions(o, 'get');
      return run('get', o, ctx => adapter.get(k, p, ctx), (result, ctx) => {
        if (result.info.key !== k || !Number.isSafeInteger(result.returnedBytes) || result.returnedBytes < 0 || result.returnedBytes > config.maxObjectBytes) fail('integrity-error', 'get');
        return managedRead(result, ctx);
      });
    },
    async head(k, opts = {}) {
      validate.key(k, 'head');
      const o = options(opts, ['ifRevision'], 'head'), p = readOptions(o, 'head');
      return run('head', o, async ctx => validate.cloneInfo(await adapter.head(k, p.ifRevision, ctx)));
    },
    async exists(k, opts = {}) {
      validate.key(k, 'exists');
      const o = options(opts, [], 'exists');
      return run('exists', o, async ctx => {
        try {await adapter.head(k, undefined, ctx); return true;}
        catch (error) {if (error instanceof StorageError && error.code === 'not-found') return false; throw error;}
      });
    },
    async delete(k, opts = {}) {
      validate.key(k, 'delete');
      const o = options(opts, ['ifRevision'], 'delete');
      const revision = o.ifRevision === undefined ? undefined : validate.revision(o.ifRevision, 'delete');
      if (revision !== undefined) need('conditional-delete', 'delete');
      return run('delete', o, ctx => adapter.delete(k, revision, ctx));
    },
    async list(opts = {}) {
      const o = options(opts, ['prefix', 'cursor', 'pageSize'], 'list');
      const prefix = validate.key(validate.provided(o.prefix, ''), 'list', true);
      if (o.cursor !== undefined && (typeof o.cursor !== 'string' || o.cursor.length === 0 || validate.byteLength(o.cursor) > 8192)) fail('invalid-cursor', 'list');
      const pageSize = validate.integer(validate.provided(o.pageSize, config.listPageSize), 1, config.maxListPageSize, 'list');
      return run('list', o, async ctx => {
        const result = await adapter.list({prefix, cursor: o.cursor as string | undefined, pageSize}, ctx);
        if (result.items.length > pageSize || result.items.some(info => !info.key.startsWith(prefix))) fail('integrity-error', 'list');
        return {items: result.items.map(validate.cloneInfo), nextCursor: result.nextCursor};
      });
    },
    async copy(src, dst, opts = {}) {
      validate.key(src, 'copy'); validate.key(dst, 'copy');
      if (src === dst) fail('invalid-input', 'copy');
      need('copy', 'copy');
      const o = options(opts, ['sourceRevision', 'overwrite', 'destinationCondition'], 'copy');
      const sourceRevision = o.sourceRevision === undefined ? undefined : validate.revision(o.sourceRevision, 'copy');
      if (sourceRevision !== undefined) need('conditional-read', 'copy');
      const condition = validate.write(o.overwrite, o.destinationCondition, 'copy');
      if (condition.condition) need('conditional-write', 'copy');
      return run('copy', o, async ctx => {
        const read = await ctx.wait(adapter.get(src, {ifRevision: sourceRevision, range: undefined}, ctx), r => closeIterator(r.body));
        try {
          if (read.info.sizeBytes > config.maxObjectBytes) fail('limit-exceeded', 'copy');
          const p = {...condition, contentLength: read.info.sizeBytes, contentType: read.info.contentType, metadata: validate.metadata(read.info.metadata, 'copy'), maxObjectBytes: config.maxObjectBytes};
          return validate.cloneInfo(await adapter.put(dst, guardedInput(read.body, ctx, config.maxObjectBytes, read.info.sizeBytes), p, ctx));
        } finally {closeIterator(read.body);}
      });
    },
    async move() {return fail('unsupported-capability', 'move');},
    async signedUploadUrl() {return fail('unsupported-capability', 'signedUploadUrl');},
    async signedDownloadUrl() {return fail('unsupported-capability', 'signedDownloadUrl');},
    async multipart() {return fail('unsupported-capability', 'multipart');},
  };
}
