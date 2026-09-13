import assert from 'node:assert/strict';
import {createMemoryAdapter, createStorage, StorageError} from '../src/index.js';
import type {ByteSource, MemoryOptions, Observer, Storage, StorageAdapter, StorageLimits} from '../src/index.js';
export const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
export async function* source(value: string | Uint8Array): ByteSource {yield typeof value === 'string' ? bytes(value) : value;}
export async function text(body: ByteSource): Promise<string> {
  const parts: Uint8Array[] = [];
  for await (const chunk of body) parts.push(chunk);
  return Buffer.concat(parts).toString('utf8');
}
export async function content(storage: Storage, key: string): Promise<string> {return text((await storage.get(key)).body);}
export function errorIs(code: string, outcome?: string): (error: unknown) => boolean {
  return (error): boolean => {
    assert(error instanceof StorageError);
    assert.equal(error.code, code);
    if (outcome !== undefined) assert.equal(error.outcome, outcome);
    return true;
  };
}
export function latch(): {promise: Promise<void>; release: () => void} {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {release = resolve;});
  return {promise, release};
}
export const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
let sequence = 0;
export interface Fixture {storage: Storage; adapter: StorageAdapter; dispose(): Promise<void>}
export function fixture(memory: Partial<MemoryOptions> = {}, limits: Partial<StorageLimits> = {}, observer?: Observer): Fixture {
  const namespace = memory.namespace ?? `test-${++sequence}`;
  const adapter = createMemoryAdapter({...memory, namespace});
  const storage = createStorage({adapter, namespace}, {...(memory.maxObjectBytes === undefined ? {} : {maxObjectBytes: memory.maxObjectBytes}), ...limits}, observer);
  const reads: AsyncIterableIterator<Uint8Array>[] = [];
  const get = storage.get;
  storage.get = async (...args) => {const result = await get(...args); reads.push(result.body); return result;};
  return {storage, adapter, async dispose() {await Promise.all(reads.map(body => body.return?.()));}};
}
export function instrument(base: StorageAdapter): {adapter: StorageAdapter; counts: Record<'put' | 'get' | 'head' | 'delete' | 'list', number>} {
  const counts = {put: 0, get: 0, head: 0, delete: 0, list: 0};
  const adapter: StorageAdapter = {
    descriptor: base.descriptor,
    put(...args) {counts.put++; return base.put(...args);},
    get(...args) {counts.get++; return base.get(...args);},
    head(...args) {counts.head++; return base.head(...args);},
    delete(...args) {counts.delete++; return base.delete(...args);},
    list(...args) {counts.list++; return base.list(...args);},
  };
  return {adapter, counts};
}
