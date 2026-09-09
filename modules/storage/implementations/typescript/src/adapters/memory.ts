import {randomUUID} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {fail, StorageError} from '../errors.js';
import type {AdapterDescriptor, ByteSource, ObjectInfo, OperationContext, ReadResult, StorageAdapter, ValidatedList, ValidatedPut, ValidatedRead} from '../types.js';
import {cloneInfo, DEFAULT_LIMITS, integer, key as validateKey, provided, rangeBounds, record} from '../validation.js';

export interface MemoryOptions {namespace: string; maxObjectBytes?: number; maxTotalBytes?: number; maxObjects?: number}
interface Stored {info: ObjectInfo; bytes: Uint8Array; capacity: number; references: number}

export class MemoryAdapter implements StorageAdapter {
  readonly descriptor: Readonly<AdapterDescriptor>;
  readonly #records = new Map<string, Stored>();
  readonly #scope = randomUUID();
  readonly #maxTotal: number;
  readonly #maxObjects: number;
  #allocated = 0;

  constructor(options: MemoryOptions) {
    const input = record(options, ['namespace', 'maxObjectBytes', 'maxTotalBytes', 'maxObjects'], 'head');
    const namespace = validateKey(input.namespace, 'head');
    const maxObjectBytes = integer(provided(input.maxObjectBytes, DEFAULT_LIMITS.maxObjectBytes), 1, 2 ** 31 - 1, 'head');
    this.#maxTotal = integer(provided(input.maxTotalBytes, 64 * 1024 * 1024), 1, Number.MAX_SAFE_INTEGER, 'head');
    this.#maxObjects = integer(provided(input.maxObjects, 10000), 1, 10000, 'head');
    this.descriptor = Object.freeze({id: 'memory', namespace, maxObjectBytes, maxListPageSize: 1000,
      consistency: 'single-object-linearizable', durability: 'volatile',
      supported: Object.freeze(['put', 'get', 'head', 'exists', 'delete', 'list', 'metadata', 'capability-negotiation',
        'copy', 'range-read', 'conditional-read', 'conditional-write', 'conditional-delete'] as const)});
  }

  #release(record: Stored): void {
    record.references--;
    if (record.references === 0) this.#allocated -= record.capacity;
  }
  #find(key: string, revision: string | undefined, context: OperationContext): Stored {
    context.check();
    const stored = this.#records.get(key);
    if (revision !== undefined && (!stored || stored.info.revision !== revision)) fail('precondition-failed', context.operation);
    if (!stored) fail('not-found', context.operation);
    return stored;
  }
  #checkWrite(key: string, options: ValidatedPut, context: OperationContext): Stored | undefined {
    const previous = this.#records.get(key);
    const condition = options.condition;
    if ((condition?.kind === 'if-absent' && previous) ||
      (condition?.kind === 'if-revision' && (!previous || previous.info.revision !== condition.revision))) fail('precondition-failed', context.operation);
    if (!previous && this.#records.size >= this.#maxObjects) fail('limit-exceeded', context.operation);
    return previous;
  }

  async put(key: string, body: ByteSource, options: ValidatedPut, context: OperationContext): Promise<ObjectInfo> {
    context.check();
    let buffer: Uint8Array = new Uint8Array(0), length = 0, capacity = 0, published = false;
    try {
      for await (const chunk of body) {
        context.check();
        const needed = length + chunk.byteLength;
        if (needed > options.maxObjectBytes) fail('limit-exceeded', context.operation);
        if (needed > capacity) {
          // Charge both buffers during growth, and retain capacity charges while snapshots exist.
          const preferred = Math.min(options.maxObjectBytes, Math.max(needed, capacity * 2, 1024));
          const available = this.#maxTotal - this.#allocated;
          const nextCapacity = preferred <= available ? preferred : needed;
          if (nextCapacity > available) fail('limit-exceeded', context.operation);
          this.#allocated += nextCapacity;
          let next: Uint8Array;
          try {next = new Uint8Array(nextCapacity);} catch {this.#allocated -= nextCapacity; fail('limit-exceeded', context.operation);}
          next.set(buffer.subarray(0, length));
          this.#allocated -= capacity;
          capacity = nextCapacity;
          buffer = next;
        }
        buffer.set(chunk, length);
        length = needed;
      }
      context.check();
      if (options.contentLength !== undefined && options.contentLength !== length) fail('invalid-input', context.operation);
      // No await between this condition check and publishing the immutable record.
      const previous = this.#checkWrite(key, options, context);
      const info: ObjectInfo = {key, sizeBytes: length, contentType: options.contentType,
        metadata: {...options.metadata}, revision: randomUUID(), modifiedAt: new Date().toISOString()};
      this.#records.set(key, {info, bytes: buffer.subarray(0, length), capacity, references: 1});
      published = true;
      if (previous) this.#release(previous);
      context.markApplied();
      return cloneInfo(info);
    } finally {if (!published) this.#allocated -= capacity;}
  }

  async head(key: string, revision: string | undefined, context: OperationContext): Promise<ObjectInfo> {
    return cloneInfo(this.#find(key, revision, context).info);
  }
  async get(key: string, options: ValidatedRead, context: OperationContext): Promise<ReadResult> {
    const stored = this.#find(key, options.ifRevision, context);
    const {start, end} = rangeBounds(stored.info.sizeBytes, options.range, context.operation);
    let position = start, closed = false;
    stored.references++;
    const close = (): void => {
      if (closed) return;
      closed = true;
      context.signal.removeEventListener('abort', close);
      this.#release(stored);
    };
    context.signal.addEventListener('abort', close, {once: true});
    const body: AsyncIterableIterator<Uint8Array> = {
      [Symbol.asyncIterator]() {return this;},
      async next() {
        context.check();
        if (closed || position >= end) {close(); return {done: true, value: undefined};}
        const next = Math.min(end, position + 65536), value = stored.bytes.slice(position, next);
        position = next;
        return {done: false, value};
      },
      async return() {close(); return {done: true, value: undefined};},
      async throw() {close(); throw new StorageError('aborted', context.operation);},
    };
    return {info: cloneInfo(stored.info), body, returnedBytes: end - start};
  }
  async delete(key: string, revision: string | undefined, context: OperationContext): Promise<{absent: true}> {
    context.check();
    const stored = this.#records.get(key);
    if (revision !== undefined && (!stored || stored.info.revision !== revision)) fail('precondition-failed', context.operation);
    if (stored) {this.#records.delete(key); this.#release(stored);}
    context.markApplied();
    return {absent: true};
  }
  async list(options: ValidatedList, context: OperationContext): Promise<{items: ObjectInfo[]; nextCursor: string | null}> {
    context.check();
    if (this.#records.size > 10000) fail('limit-exceeded', context.operation);
    let after: string | undefined;
    if (options.cursor !== undefined) {
      try {
        const raw = options.cursor;
        if (!/^[A-Za-z0-9_-]+$/.test(raw) || raw.length > 8192) throw new Error();
        const bytes = Buffer.from(raw, 'base64url');
        if (bytes.toString('base64url') !== raw) throw new Error();
        const data = record(JSON.parse(bytes.toString('utf8')) as unknown, ['v', 'adapter', 'binding', 'namespace', 'prefix', 'after'], context.operation);
        if (data.v !== 1 || data.adapter !== 'memory' || data.binding !== this.#scope || data.namespace !== this.descriptor.namespace || data.prefix !== options.prefix) throw new Error();
        after = validateKey(data.after, context.operation);
        if (!after.startsWith(options.prefix)) throw new Error();
      } catch {fail('invalid-cursor', context.operation);}
    }
    const keys = [...this.#records.keys()].filter(k => k.startsWith(options.prefix) && (after === undefined || Buffer.compare(Buffer.from(k), Buffer.from(after)) > 0))
      .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    const page = keys.slice(0, options.pageSize);
    const nextCursor = keys.length > page.length ? Buffer.from(JSON.stringify({v: 1, adapter: 'memory', binding: this.#scope,
      namespace: this.descriptor.namespace, prefix: options.prefix, after: page.at(-1)})).toString('base64url') : null;
    context.check();
    return {items: page.map(k => cloneInfo(this.#records.get(k)!.info)), nextCursor};
  }
}

export function createMemoryAdapter(options: MemoryOptions): StorageAdapter {return new MemoryAdapter(options);}
