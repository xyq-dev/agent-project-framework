export {createStorage} from './core.js';
export {createMemoryAdapter} from './adapters/memory.js';
export type {MemoryOptions} from './adapters/memory.js';
export {StorageError} from './errors.js';
export type {ErrorCode} from './errors.js';
export type {
  AdapterDescriptor, ByteSource, CapabilityId, CapabilitySnapshot, CopyOptions, DeleteOptions,
  GetOptions, HeadOptions, ListOptions, ListResult, ObjectInfo, Observation, Observer,
  Operation, OperationContext, OperationOptions, Outcome, PutOptions, ReadResult,
  SignedDownloadOptions, SignedGrant, SignedUploadOptions, Storage, StorageAdapter,
  StorageLimits, UserMetadata, ValidatedList, ValidatedPut, ValidatedRead, WriteCondition,
} from './types.js';
export {createLocalAdapter} from './adapters/local.js';
export type {LocalOptions, LocalStorageAdapter} from './adapters/local.js';
export {createOssAdapter} from './adapters/oss.js';
export type {OssOptions, OssCredentials, OssCredentialProvider, OssStorageAdapter} from './adapters/oss.js';
