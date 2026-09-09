import type {Operation, Outcome} from './types.js';
export const ERROR_CODES = [
  'invalid-input', 'invalid-cursor', 'not-found', 'precondition-failed', 'unsupported-capability',
  'permission-denied', 'authentication-failed', 'limit-exceeded', 'range-not-satisfiable',
  'integrity-error', 'aborted', 'timeout', 'rate-limited', 'unavailable', 'partial-failure', 'provider-error',
] as const;
export type ErrorCode = typeof ERROR_CODES[number];
const TRANSIENT = new Set<ErrorCode>(['timeout', 'rate-limited', 'unavailable']);
export const READ_OPERATIONS = new Set<Operation>(['get', 'head', 'exists', 'list']);
export class StorageError extends Error {
  readonly code: ErrorCode;
  readonly operation: Operation;
  readonly retryable: boolean;
  readonly outcome: Outcome;
  constructor(code: ErrorCode, operation: Operation, outcome: Outcome = 'not-applied') {
    // Never attach raw provider messages, user keys, abort reasons or a cause.
    super(`Storage ${operation}: ${code}`);
    this.name = 'StorageError'; this.code = code; this.operation = operation; this.outcome = outcome;
    this.retryable = READ_OPERATIONS.has(operation) && TRANSIENT.has(code);
  }
}
export function fail(code: ErrorCode, operation: Operation): never {throw new StorageError(code, operation);}
export function publicError(error: unknown, operation: Operation, outcome: Outcome = 'not-applied'): StorageError {
  if (error instanceof StorageError) return new StorageError(error.code, operation,
    error.outcome === 'unknown' || outcome !== 'not-applied' ? 'unknown' : error.outcome);
  return new StorageError('provider-error', operation, outcome === 'not-applied' ? outcome : 'unknown');
}
