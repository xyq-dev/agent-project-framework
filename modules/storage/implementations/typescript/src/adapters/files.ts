import {constants} from 'node:fs';
import {lstat, open, realpath, opendir, unlink} from 'node:fs/promises';
import type {FileHandle} from 'node:fs/promises';
import type {Stats} from 'node:fs';
import {dirname, resolve, join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fail, StorageError} from '../errors.js';
import type {ByteSource, Operation, OperationContext} from '../types.js';

export const READ = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
export const CREATE = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
export interface Identity {dev: number; ino: number}
export const same = (a: Identity, b: Identity): boolean => a.dev === b.dev && a.ino === b.ino;
export function fsError(error: unknown, op: Operation): never {
  if (error instanceof StorageError) throw error;
  const code = (error as {code?: unknown} | null)?.code;
  if (code === 'ENOENT') fail('not-found', op);
  if (code === 'EACCES' || code === 'EPERM') fail('permission-denied', op);
  if (code === 'ENOSPC' || code === 'EDQUOT' || code === 'EMFILE' || code === 'ENFILE') fail('limit-exceeded', op);
  if (code === 'ELOOP' || code === 'ENOTDIR' || code === 'EISDIR') fail('integrity-error', op);
  fail('provider-error', op);
}
export function secureStat(s: Stats, directory: boolean, op: Operation): void {
  if (s.uid !== process.geteuid!() || (s.mode & 0o777) !== (directory ? 0o700 : 0o600) ||
    (directory ? !s.isDirectory() : (!s.isFile() || s.nlink !== 1))) fail('integrity-error', op);
}
export async function trustedRoot(path: string): Promise<Identity> {
  if (process.platform !== 'linux' || Number(process.versions.node.split('.')[0]) !== 24 || !process.geteuid) fail('unsupported-capability', 'head');
  if (typeof path !== 'string' || resolve(path) !== path || path === '/' || path === homedir() || path === process.cwd()) fail('invalid-input', 'head');
  if (await realpath(path) !== path) fail('integrity-error', 'head');
  const stat = await lstat(path);
  secureStat(stat, true, 'head');
  let parent = dirname(path);
  while (true) {
    const s = await lstat(parent);
    if (!s.isDirectory() || s.isSymbolicLink()) fail('integrity-error', 'head');
    // A root-owned sticky /tmp may contain a private root; arbitrary writable ancestors may not.
    const sticky = (s.mode & 0o1000) !== 0 && (s.uid === 0 || s.uid === process.geteuid());
    if ((s.mode & 0o022) !== 0 && !sticky) fail('integrity-error', 'head');
    if (parent === '/') break;
    parent = dirname(parent);
  }
  return {dev: stat.dev, ino: stat.ino};
}
export async function directory(path: string, expected: Identity | undefined, op: Operation): Promise<Identity> {
  const s = await lstat(path);
  secureStat(s, true, op);
  if (expected && !same(s, expected)) fail('integrity-error', op);
  return {dev: s.dev, ino: s.ino};
}
export async function secureOpen(path: string, op: Operation): Promise<FileHandle> {
  const fd = await open(path, READ);
  try {secureStat(await fd.stat(), false, op); return fd;} catch (e) {await fd.close(); throw e;}
}
export async function writeAll(fd: FileHandle, bytes: Uint8Array, position: number): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const {bytesWritten} = await fd.write(bytes, offset, bytes.byteLength - offset, position + offset);
    if (bytesWritten <= 0) throw new StorageError('integrity-error', 'put');
    offset += bytesWritten;
  }
}
export async function readAll(fd: FileHandle, length: number, position: number, op: Operation): Promise<Buffer> {
  const result = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const {bytesRead} = await fd.read(result, offset, length - offset, position + offset);
    if (bytesRead === 0) fail('integrity-error', op);
    offset += bytesRead;
  }
  return result;
}
export async function entries(path: string, max: number, op: Operation): Promise<string[]> {
  const output: string[] = [];
  for await (const entry of await opendir(path)) {
    if (output.length >= max) fail('limit-exceeded', op);
    output.push(entry.name);
  }
  return output;
}
export async function syncDirectory(path: string): Promise<void> {
  const fd = await open(path, READ | constants.O_DIRECTORY);
  try {await fd.sync();} finally {await fd.close();}
}
export interface Temp {path: string; fd: FileHandle; identity: Identity; bytes: number; closed: boolean; moved: boolean}
export class Spool {
  #allocated = 0;
  constructor(readonly path: string, readonly identity: Identity, private readonly max: number) {}
  async accountResiduals(): Promise<void> {
    for (const name of await entries(this.path, 20000, 'head')) {
      const s = await lstat(join(this.path, name));
      secureStat(s, false, 'head');
      this.reserve(s.size, 'head');
    }
  }
  reserve(bytes: number, op: Operation): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.max - this.#allocated) fail('limit-exceeded', op);
    this.#allocated += bytes;
  }
  async create(op: Operation): Promise<Temp> {
    await directory(this.path, this.identity, op);
    const path = join(this.path, randomUUID() + '.tmp');
    const fd = await open(path, CREATE, 0o600);
    try {const s = await fd.stat(); secureStat(s, false, op); return {path, fd, identity: {dev: s.dev, ino: s.ino}, bytes: 0, closed: false, moved: false};}
    catch (e) {await fd.close(); throw e;}
  }
  async append(temp: Temp, bytes: Uint8Array, op: Operation): Promise<void> {
    this.reserve(bytes.byteLength, op);
    temp.bytes += bytes.byteLength; // Charge even a partial write until cleanup succeeds.
    await writeAll(temp.fd, bytes, temp.bytes - bytes.byteLength);
  }
  async stage(source: ByteSource, max: number, length: number | undefined, ctx: OperationContext): Promise<Temp> {
    const temp = await this.create(ctx.operation);
    try {
      const iterator = source[Symbol.asyncIterator]();
      try {
        while (true) {
          const next = await ctx.wait(iterator.next());
          if (next.done) break;
          ctx.check();
          if (!(next.value instanceof Uint8Array) || next.value.byteLength > max - temp.bytes) fail('limit-exceeded', ctx.operation);
          await this.append(temp, next.value, ctx.operation);
          ctx.check();
        }
      } finally {try {void Promise.resolve(iterator.return?.()).catch(() => {});} catch { /* cooperative source */ }}
      if (length !== undefined && temp.bytes !== length) fail('invalid-input', ctx.operation);
      await temp.fd.sync();
      ctx.check();
      return temp;
    } catch (e) {await this.cleanup(temp, ctx.operation); throw e;}
  }
  async closeFile(temp: Temp): Promise<void> {if (!temp.closed) {await temp.fd.close(); temp.closed = true;}}
  async cleanup(temp: Temp, op: Operation): Promise<void> {
    await this.closeFile(temp);
    if (!temp.moved) {
      await directory(this.path, this.identity, op);
      const s = await lstat(temp.path);
      secureStat(s, false, op);
      if (!same(s, temp.identity)) fail('integrity-error', op);
      await unlink(temp.path);
    }
    this.#allocated -= temp.bytes;
    temp.bytes = 0;
  }
}
