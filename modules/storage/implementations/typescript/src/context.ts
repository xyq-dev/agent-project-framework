import {StorageError, publicError} from './errors.js';
import type {Observation, Observer, Operation, OperationContext, Outcome} from './types.js';

export class ObserverDispatcher {
  #pending = 0;
  constructor(private readonly observer: Observer | undefined) {}
  emit(event: Observation): void {
    if (!this.observer || this.#pending >= 16) return;
    this.#pending++;
    const immutable = Object.freeze({...event});
    void Promise.resolve().then(() => this.observer!(immutable)).catch(() => {}).finally(() => {this.#pending--;});
  }
}

export class Context implements OperationContext {
  readonly #controller = new AbortController();
  readonly #start = performance.now();
  readonly #deadline: number;
  readonly #timer: ReturnType<typeof setTimeout>;
  readonly #external: AbortSignal | undefined;
  readonly #relay: () => void;
  readonly #abortPromise: Promise<never>;
  #rejectAbort!: (error: StorageError) => void;
  #outcome: Outcome = 'not-applied';
  #abortError: StorageError | undefined;
  #ended = false;
  #cleanup = new Set<() => void>();

  constructor(readonly operation: Operation, timeoutMs: number, signal: AbortSignal | undefined, private readonly observer: ObserverDispatcher) {
    this.#deadline = this.#start + timeoutMs;
    this.#abortPromise = new Promise<never>((_, reject) => {this.#rejectAbort = reject;});
    void this.#abortPromise.catch(() => {});
    this.#timer = setTimeout(() => this.#abort('timeout'), timeoutMs);
    this.#external = signal;
    this.#relay = () => this.#abort('aborted');
    signal?.addEventListener('abort', this.#relay, {once: true});
    if (signal?.aborted) this.#abort('aborted');
  }
  get signal(): AbortSignal {return this.#controller.signal;}
  get outcome(): Outcome {return this.#outcome;}
  #abort(code: 'aborted' | 'timeout'): void {
    if (this.#abortError || this.#ended) return;
    this.#abortError = new StorageError(code, this.operation, this.#outcome === 'not-applied' ? 'not-applied' : 'unknown');
    this.#controller.abort();
    this.#rejectAbort(this.#abortError);
    for (const cleanup of [...this.#cleanup]) {try {cleanup();} catch { /* no raw diagnostics */ }}
  }
  check(): void {
    if (performance.now() >= this.#deadline) this.#abort('timeout');
    if (this.#abortError) throw this.#abortError;
  }
  onAbort(cleanup: () => void): () => void {
    this.#cleanup.add(cleanup);
    if (this.signal.aborted) cleanup();
    return () => {this.#cleanup.delete(cleanup);};
  }
  async wait<T>(input: PromiseLike<T>, disposeLate?: (value: T) => void): Promise<T> {
    const promise = Promise.resolve(input);
    let seen = false, disposed = false, value: T;
    const dispose = (v: T): void => {
      if (disposed) return;
      disposed = true;
      try {disposeLate?.(v);} catch { /* cleanup never exposes a provider error */ }
    };
    const watched = promise.then(v => {seen = true; value = v; return v;});
    try {
      this.check();
      const result = await Promise.race([watched, this.#abortPromise]);
      this.check();
      return result;
    } catch (error) {
      // Also handles a provider returning an open read handle after the deadline.
      if (seen) dispose(value!);
      else void promise.then(dispose, () => {});
      // The watched promise may reject after a synchronous cancellation check.
      void watched.catch(() => {});
      throw error;
    }
  }
  markDispatched(): void {this.check(); this.#outcome = 'unknown';}
  markApplied(): void {this.#outcome = 'applied';}
  finish(error?: unknown, bytes?: number): void {
    if (this.#ended) return;
    this.#ended = true;
    clearTimeout(this.#timer);
    this.#external?.removeEventListener('abort', this.#relay);
    this.#cleanup.clear();
    const e = error === undefined ? undefined : publicError(error, this.operation, this.#outcome);
    this.observer.emit({operation: this.operation, outcome: e?.outcome ?? this.#outcome,
      durationMs: Math.max(0, performance.now() - this.#start),
      ...(e ? {errorCode: e.code} : {}), ...(bytes === undefined ? {} : {bytes})});
  }
}

export function closeIterator(iterator: AsyncIterator<Uint8Array>): void {
  try {void Promise.resolve(iterator.return?.()).catch(() => {});} catch { /* best-effort cooperative close */ }
}
