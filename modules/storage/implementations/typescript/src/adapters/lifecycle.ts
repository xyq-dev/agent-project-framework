import {fail, StorageError} from '../errors.js';
import type {OperationContext} from '../types.js';

/** A lease ends after real I/O/close, not when Core stops awaiting its result. */
export class Lifecycle {
  #closed = false;
  #leases = new Map<OperationContext, number>();
  #count = 0;
  #drained = new Set<() => void>();
  constructor(private readonly max: number) {}
  enter(ctx: OperationContext): () => void {
    ctx.check();
    if (this.#closed) fail('unavailable', ctx.operation);
    if (this.#count >= this.max) fail('limit-exceeded', ctx.operation);
    this.#count++;
    this.#leases.set(ctx, (this.#leases.get(ctx) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = this.#leases.get(ctx)!;
      if (n === 1) this.#leases.delete(ctx); else this.#leases.set(ctx, n - 1);
      this.#count--;
      if (this.#count === 0) for (const resolve of this.#drained) resolve();
    };
  }
  seal(): void {this.#closed = true;}
  stop(): void {
    this.seal();
    for (const ctx of this.#leases.keys()) ctx.cancel();
  }
  async drain(timeoutMs: number): Promise<void> {
    this.stop();
    if (this.#count === 0) return;
    let wake!: () => void;
    const idle = new Promise<void>(resolve => {wake = resolve; this.#drained.add(wake);});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new StorageError('timeout', 'head')), timeoutMs);});
    try {await Promise.race([idle, timeout]);}
    finally {clearTimeout(timer); this.#drained.delete(wake);}
  }
}

export class Mutex {
  #tail: Promise<void> = Promise.resolve();
  async run<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let unlock!: () => void;
    this.#tail = new Promise<void>(resolve => {unlock = resolve;});
    await previous;
    try {return await action();} finally {unlock();}
  }
}
