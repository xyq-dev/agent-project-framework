import {fail} from './errors.js';
import type {ByteSource, ObjectInfo, Operation, StorageLimits, UserMetadata, ValidatedPut, WriteCondition} from './types.js';
export const DEFAULT_LIMITS: Readonly<StorageLimits> = Object.freeze({maxObjectBytes: 16 * 1024 * 1024, listPageSize: 100, maxListPageSize: 1000, timeoutMs: 30_000});
const utf8 = new TextEncoder();
export function byteLength(value: string): number {return utf8.encode(value).byteLength;}
export function record(value: unknown, allowed: readonly string[] | null, operation: Operation): Record<string, unknown> {
  try {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('invalid-input', operation);
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('invalid-input', operation);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || (allowed !== null && !allowed.includes(key))) fail('invalid-input', operation);
    const prop = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in prop) || !prop.enumerable) fail('invalid-input', operation);
  }
  return value as Record<string, unknown>;
  } catch {return fail('invalid-input', operation);}
}
export const provided = (value: unknown, fallback: unknown): unknown => value === undefined ? fallback : value;
export function integer(value: unknown, min: number, max: number, operation: Operation): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail('invalid-input', operation);
  return value;
}
export function key(value: unknown, operation: Operation, prefix = false): string {
  if (typeof value !== 'string' || !value.isWellFormed() || value !== value.normalize('NFC')) fail('invalid-input', operation);
  if (prefix && value === '') return value;
  if (byteLength(value) > 512 || value.length === 0 || /[\\%:\u0000-\u001f\u007f-\u009f]/u.test(value)) fail('invalid-input', operation);
  const v = prefix && value.endsWith('/') ? value.slice(0, -1) : value;
  if (v.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) fail('invalid-input', operation);
  return value;
}
export function revision(value: unknown, operation: Operation): string {
  if (typeof value !== 'string' || value.length === 0 || byteLength(value) > 8192 || !value.isWellFormed()) fail('invalid-input', operation);
  return value;
}
export function contentType(value: unknown, operation: Operation): string {
  if (typeof value !== 'string' || !/^[\x20-\x7e]{1,255}$/.test(value)) fail('invalid-input', operation);
  return value;
}
export function metadata(value: unknown, operation: Operation): UserMetadata {
  const input = record(value, null, operation), entries = Object.entries(input);
  if (entries.length > 32) fail('limit-exceeded', operation);
  let bytes = 0;
  const output: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, item] of entries) {
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name) || typeof item !== 'string' || !/^[\x20-\x7e]*$/.test(item)) fail('invalid-input', operation);
    bytes += byteLength(name) + byteLength(item);
    if (bytes > 2048) fail('limit-exceeded', operation);
    output[name] = item;
  }
  return Object.freeze(output);
}
export function source(value: unknown, operation: Operation): asserts value is ByteSource {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function') || typeof (value as ByteSource)[Symbol.asyncIterator] !== 'function') fail('invalid-input', operation);
  } catch {fail('invalid-input', operation);}
}
export function write(overwrite: unknown, condition: unknown, operation: Operation): {overwrite: boolean; condition: WriteCondition | undefined} {
  if (overwrite !== undefined && typeof overwrite !== 'boolean') fail('invalid-input', operation);
  const replace = overwrite ?? false;
  if (condition === undefined) return {overwrite: replace, condition: replace ? undefined : {kind: 'if-absent'}};
  const c = record(condition, ['kind', 'revision'], operation);
  if (c.kind === 'if-absent' && !replace && !Object.hasOwn(c, 'revision')) return {overwrite: false, condition: {kind: 'if-absent'}};
  if (c.kind === 'if-revision' && replace) return {overwrite: true, condition: {kind: 'if-revision', revision: revision(c.revision, operation)}};
  return fail('invalid-input', operation);
}
export function putOptions(input: Record<string, unknown>, limits: StorageLimits, operation: Operation): ValidatedPut {
  const condition = write(input.overwrite, input.condition, operation);
  const length = input.contentLength === undefined ? undefined : integer(input.contentLength, 0, Number.MAX_SAFE_INTEGER, operation);
  if (length !== undefined && length > limits.maxObjectBytes) fail('limit-exceeded', operation);
  return {...condition, contentLength: length, contentType: contentType(provided(input.contentType, 'application/octet-stream'), operation), metadata: metadata(provided(input.metadata, {}), operation), maxObjectBytes: limits.maxObjectBytes};
}
export function cloneInfo(info: ObjectInfo): ObjectInfo {
  return {key: info.key, sizeBytes: info.sizeBytes, contentType: info.contentType,
    metadata: {...info.metadata}, revision: info.revision, modifiedAt: info.modifiedAt,
    ...(info.etag === undefined ? {} : {etag: info.etag}),
    ...(info.checksum ? {checksum: {algorithm: info.checksum.algorithm, value: info.checksum.value, encoding: info.checksum.encoding}} : {})};
}
export function rangeBounds(size: number, range: {start: number; endInclusive?: number} | undefined, operation: Operation): {start: number; end: number} {
  if (!range) return {start: 0, end: size};
  if (range.start >= size) fail('range-not-satisfiable', operation);
  return {start: range.start, end: Math.min(size, range.endInclusive === undefined ? size : range.endInclusive + 1)};
}
