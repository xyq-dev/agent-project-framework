export const CAPABILITIES = [
  'put', 'get', 'head', 'exists', 'delete', 'list', 'metadata', 'capability-negotiation',
  'copy', 'move', 'range-read', 'conditional-read', 'conditional-write', 'conditional-delete',
  'signed-upload-url', 'signed-download-url', 'multipart',
] as const;
export type CapabilityId = typeof CAPABILITIES[number];
export type Operation = 'put' | 'get' | 'head' | 'exists' | 'delete' | 'list' | 'copy' | 'move' | 'signedUploadUrl' | 'signedDownloadUrl' | 'multipart';
export type ByteSource = AsyncIterable<Uint8Array>;
export type UserMetadata = Readonly<Record<string, string>>;
export type Outcome = 'not-applied' | 'applied' | 'unknown';
export type WriteCondition = {kind: 'if-absent'} | {kind: 'if-revision'; revision: string};
export interface ObjectInfo {
  key: string; sizeBytes: number; contentType: string; metadata: UserMetadata;
  revision: string; modifiedAt: string; etag?: string;
  checksum?: {algorithm: string; value: string; encoding: string};
}
export interface OperationOptions {timeoutMs?: number; signal?: AbortSignal}
export interface PutOptions extends OperationOptions {
  overwrite?: boolean; condition?: WriteCondition; contentLength?: number;
  contentType?: string; metadata?: UserMetadata;
}
export interface HeadOptions extends OperationOptions {ifRevision?: string}
export interface GetOptions extends HeadOptions {range?: {start: number; endInclusive?: number}}
export interface DeleteOptions extends HeadOptions {}
export interface ListOptions extends OperationOptions {prefix?: string; cursor?: string; pageSize?: number}
export interface CopyOptions extends OperationOptions {sourceRevision?: string; overwrite?: boolean; destinationCondition?: WriteCondition}
export interface SignedUploadOptions extends OperationOptions {ttlSeconds?: number; overwrite?: boolean; contentType?: string; metadata?: UserMetadata}
export interface SignedDownloadOptions extends OperationOptions {ttlSeconds?: number}
export interface SignedGrant {url: string; method: 'PUT' | 'GET'; requiredHeaders: Record<string, string>; expiresAt: string}
export interface ReadResult {info: ObjectInfo; body: AsyncIterableIterator<Uint8Array>; returnedBytes: number}
export interface ListResult {items: ObjectInfo[]; nextCursor: string | null}
export interface StorageLimits {maxObjectBytes: number; listPageSize: number; maxListPageSize: number; timeoutMs: number}
export interface CapabilitySnapshot {supported: CapabilityId[]; limits: StorageLimits; consistency: string; durability: string}
export interface Observation {operation: Operation; outcome: Outcome; errorCode?: string; durationMs: number; bytes?: number}
export type Observer = (event: Readonly<Observation>) => void | Promise<void>;

/** Adapters receive validated, snapshotted inputs and one operation budget. */
export interface OperationContext {
  readonly operation: Operation; readonly signal: AbortSignal; readonly outcome: Outcome;
  check(): void;
  wait<T>(promise: PromiseLike<T>, disposeLate?: (value: T) => void): Promise<T>;
  markDispatched(): void;
  markApplied(): void;
}
export interface ValidatedPut {
  overwrite: boolean; condition: WriteCondition | undefined; contentLength: number | undefined;
  contentType: string; metadata: UserMetadata; maxObjectBytes: number;
}
export interface ValidatedRead {ifRevision: string | undefined; range: GetOptions['range']}
export interface ValidatedList {prefix: string; cursor: string | undefined; pageSize: number}
export interface AdapterDescriptor {
  id: string; namespace: string; supported: readonly CapabilityId[];
  maxObjectBytes: number; maxListPageSize: number; consistency: string; durability: string;
}
export interface StorageAdapter {
  readonly descriptor: Readonly<AdapterDescriptor>;
  put(key: string, body: ByteSource, options: ValidatedPut, context: OperationContext): Promise<ObjectInfo>;
  get(key: string, options: ValidatedRead, context: OperationContext): Promise<ReadResult>;
  head(key: string, ifRevision: string | undefined, context: OperationContext): Promise<ObjectInfo>;
  delete(key: string, ifRevision: string | undefined, context: OperationContext): Promise<{absent: true}>;
  list(options: ValidatedList, context: OperationContext): Promise<ListResult>;
}
export interface Storage {
  capabilities(): CapabilitySnapshot;
  put(key: string, body: ByteSource, options?: PutOptions): Promise<ObjectInfo>;
  get(key: string, options?: GetOptions): Promise<ReadResult>;
  head(key: string, options?: HeadOptions): Promise<ObjectInfo>;
  exists(key: string, options?: OperationOptions): Promise<boolean>;
  delete(key: string, options?: DeleteOptions): Promise<{absent: true}>;
  list(options?: ListOptions): Promise<ListResult>;
  copy(sourceKey: string, destinationKey: string, options?: CopyOptions): Promise<ObjectInfo>;
  move(sourceKey: string, destinationKey: string, options?: CopyOptions & {sourceRevision: string}): Promise<never>;
  signedUploadUrl(key: string, options?: SignedUploadOptions): Promise<SignedGrant>;
  signedDownloadUrl(key: string, options?: SignedDownloadOptions): Promise<SignedGrant>;
  multipart(): Promise<never>;
}
