import {Context, closeIterator} from './context.js';
import {StorageError, publicError} from './errors.js';
import type {ByteSource, OperationContext, ReadResult} from './types.js';
import {cloneInfo} from './validation.js';

export function guardedInput(source: ByteSource, context: OperationContext, maxBytes: number, expected?: number): ByteSource {
  return {
    async *[Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      let total = 0, ended = false;
      try {
        while (true) {
          context.check();
          let item: IteratorResult<Uint8Array>;
          try {item = await context.wait(iterator.next());}
          catch (error) {
            if (error instanceof StorageError) throw error;
            throw new StorageError('invalid-input', context.operation);
          }
          if (item.done) {ended = true; break;}
          if (!(item.value instanceof Uint8Array)) throw new StorageError('invalid-input', context.operation);
          total += item.value.byteLength;
          if (!Number.isSafeInteger(total) || total > maxBytes) throw new StorageError('limit-exceeded', context.operation);
          if (item.value.byteLength > 0) yield item.value;
        }
        if (expected !== undefined && total !== expected) throw new StorageError('invalid-input', context.operation);
        context.check();
      } finally {if (!ended) closeIterator(iterator);}
    },
  };
}

/** Single-use iterator; return/timeout closes even before the first next(). */
export function managedRead(result: ReadResult, context: Context): ReadResult {
  const source = result.body;
  let done = false, pending = false, total = 0;
  const finish = (error?: unknown): void => {
    if (done) return;
    done = true;
    closeIterator(source);
    context.finish(error, total);
  };
  context.onAbort(() => {
    try {context.check();} catch (error) {finish(error);}
  });
  const body: AsyncIterableIterator<Uint8Array> = {
    [Symbol.asyncIterator]() {return this;},
    async next() {
      context.check();
      if (done) return {done: true, value: undefined};
      if (pending) throw new StorageError('invalid-input', context.operation);
      pending = true;
      try {
        const item = await context.wait(source.next());
        if (item.done) {
          if (total !== result.returnedBytes) throw new StorageError('integrity-error', context.operation);
          finish();
          return {done: true, value: undefined};
        }
        if (!(item.value instanceof Uint8Array)) throw new StorageError('integrity-error', context.operation);
        total += item.value.byteLength;
        if (total > result.returnedBytes) throw new StorageError('integrity-error', context.operation);
        return {done: false, value: new Uint8Array(item.value)};
      } catch (error) {
        const mapped = publicError(error, context.operation);
        finish(mapped);
        throw mapped;
      } finally {pending = false;}
    },
    async return() {finish(new StorageError('aborted', context.operation)); return {done: true, value: undefined};},
    async throw() {const error = new StorageError('aborted', context.operation); finish(error); throw error;},
  };
  return {info: cloneInfo(result.info), body, returnedBytes: result.returnedBytes};
}
