import {request as httpsRequest} from 'node:https';
import type {ClientRequest, IncomingMessage} from 'node:http';
import {Readable} from 'node:stream';
import {StorageError, fail} from '../errors.js';
import type {OperationContext} from '../types.js';

export interface WireOptions {
  method: string; headers: Record<string, string | number>; content?: Buffer; stream?: Readable;
  customResponse?: boolean; ctx: Ticket; enableProxy?: boolean; proxy?: unknown; agent?: unknown; httpsAgent?: unknown;
}
export interface WireResult {status: number; headers: IncomingMessage['headers']; data: Buffer; res: IncomingMessage & {status: number}}
export interface Expected {origin: string; path: string; query: Readonly<Record<string, string>>; method: 'GET' | 'HEAD' | 'PUT' | 'DELETE'; mutation: boolean}
export type RequestFunction = typeof httpsRequest;
export class Ticket {
  called = false;
  status: number | undefined;
  errorBody = false;
  buffered: Buffer | undefined;
  failure: StorageError | undefined;
  settled: Promise<void> = Promise.resolve();
  destroy: () => void = () => {};
  constructor(readonly expected: Expected, readonly context: OperationContext, readonly debugGuard: () => void) {}
  error(code: 'integrity-error' | 'provider-error' | 'limit-exceeded' | 'unavailable'): StorageError {
    return this.failure ??= new StorageError(code, this.context.operation, this.context.outcome === 'not-applied' ? 'not-applied' : 'unknown');
  }
}

/** The only production socket creator. SDK still owns V4 signing and XML interpretation. */
export function narrowTransport(request: RequestFunction = httpsRequest) {
  return {async request(url: string, options: WireOptions): Promise<WireResult> {
    const t = options.ctx;
    if (!(t instanceof Ticket)) fail('integrity-error', 'head');
    const ctx = t.context;
    try {
      t.debugGuard(); ctx.check();
      const u = new URL(url), expected = t.expected;
      if (t.called || options.method !== expected.method || u.protocol !== 'https:' || u.origin !== expected.origin ||
        u.username || u.password || u.hash || u.pathname !== expected.path || options.enableProxy || options.proxy || options.agent || options.httpsAgent) throw t.error('integrity-error');
      const actual = [...u.searchParams.entries()], wanted = Object.entries(expected.query);
      if (actual.length !== wanted.length || actual.some(([k, v]) => expected.query[k] !== v) || new Set(actual.map(([k]) => k)).size !== actual.length) throw t.error('integrity-error');
      for (const name of Object.keys(options.headers)) if (['host', 'proxy-authorization', 'connection', 'upgrade'].includes(name.toLowerCase())) throw t.error('integrity-error');
      t.called = true;
      let req: ClientRequest | undefined, res: IncomingMessage | undefined;
      let complete!: () => void, resolveResult!: (r: WireResult) => void, rejectResult!: (e: unknown) => void;
      t.settled = new Promise<void>(resolve => {complete = resolve;});
      const result = new Promise<WireResult>((resolve, reject) => {resolveResult = resolve; rejectResult = reject;});
      let reqClosed = false, socketClosed = true, finished = false;
      const settle = (): void => {
        if (reqClosed && socketClosed && !finished) {finished = true; ctx.signal.removeEventListener('abort', abort); complete();}
      };
      const destroy = (): void => {options.stream?.destroy(); res?.destroy(); req?.destroy();};
      t.destroy = destroy;
      const abort = (): void => {destroy(); try {ctx.check();} catch (e) {rejectResult(e);}};
      ctx.signal.addEventListener('abort', abort, {once: true});
      const broken = (code: 'integrity-error' | 'provider-error' | 'limit-exceeded' | 'unavailable'): void => {rejectResult(t.error(code)); destroy();};
      try {
        if (expected.mutation) ctx.markDispatched();
        req = request(url, {method: options.method, headers: options.headers, agent: false, signal: ctx.signal}, response => {
          res = response;
          const status = response.statusCode ?? 0; t.status = status;
          const headers = response.headers;
          const seen = new Set<string>();
          for (let i = 0; i < response.rawHeaders.length; i += 2) {
            const name = response.rawHeaders[i]!.toLowerCase();
            if (seen.has(name) && (name.startsWith('x-oss-') || ['content-length', 'content-range', 'content-type', 'content-encoding', 'last-modified', 'etag'].includes(name))) {broken('integrity-error'); return;}
            seen.add(name);
          }
          if (status < 200 || status >= 300 && status < 400 || headers['content-encoding'] && headers['content-encoding'] !== 'identity') {broken('integrity-error'); return;}
          const wire = Object.assign(response, {status});
          if (options.customResponse && (status === 200 || status === 206)) {
            response.on('error', () => {});
            resolveResult({status, headers, data: Buffer.alloc(0), res: wire});
            return;
          }
          const max = status >= 400 ? 64 * 1024 : 4 * 1024 * 1024;
          const chunks: Buffer[] = []; let bytes = 0;
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > max) {broken('limit-exceeded'); return;}
            chunks.push(chunk);
          });
          response.on('error', () => broken('unavailable'));
          response.on('end', () => {
            t.errorBody = status >= 400 && bytes > 0;
            const data = Buffer.concat(chunks); t.buffered = data;
            void t.settled.then(() => resolveResult({status, headers, data, res: wire}));
          });
        });
        req.on('socket', socket => {
          socketClosed = socket.destroyed;
          if (!socketClosed) socket.once('close', () => {socketClosed = true; settle();});
        });
        req.on('error', (error: Error & {code?: string}) => {
          try {ctx.check(); rejectResult(t.error(error.code?.startsWith('HPE_') ? 'integrity-error' : 'unavailable'));} catch (e) {rejectResult(e);}
          destroy();
        });
        req.once('close', () => {reqClosed = true; settle();});
        if (options.stream) {options.stream.once('error', () => broken('unavailable')); options.stream.pipe(req);}
        else req.end(options.content);
      } catch (e) {
        destroy();
        if (!req) {reqClosed = true; settle();}
        rejectResult(e);
      }
      try {return await result;} catch (e) {destroy(); await t.settled; throw e;}
    } catch (e) {if (t.failure) throw t.failure; throw e;}
  }};
}
