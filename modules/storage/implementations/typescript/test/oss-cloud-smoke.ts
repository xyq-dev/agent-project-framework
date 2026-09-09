import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {createOssAdapter, createStorage} from '../src/index.js';
import type {OssOptions} from '../src/index.js';

/** Explicit host-run entry. Never called by npm test; never loads environment credentials.
 * Host must authorize a versioning-enabled TEST bucket + namespace and implement exact-version
 * cleanup using its own official SDK. No wildcard key, bucket configuration or IAM operation.
 */
export async function verifyOssCloud(options: OssOptions, cleanupExactVersions: (created: readonly Readonly<{physicalKey: string; revision: string}>[]) => Promise<void>) {
  if (typeof cleanupExactVersions !== 'function') throw new Error('Exact-version cleanup is required');
  const adapter = await createOssAdapter(options);
  const storage = createStorage({adapter, namespace: options.namespace}, {maxObjectBytes: adapter.descriptor.maxObjectBytes});
  const prefix = `verification/${randomUUID()}/`, a = prefix + 'source', b = prefix + 'copy';
  const physical = `apf-storage/v1/${createHash('sha256').update(options.namespace).digest('hex')}/objects/`;
  const created: {physicalKey: string; revision: string}[] = [];
  const checks: string[] = [];
  async function* input() {yield Buffer.from('APF cloud verification');}
  const read = async (key: string): Promise<string> => {const result = await storage.get(key), chunks: Uint8Array[] = []; for await (const chunk of result.body) chunks.push(chunk); return Buffer.concat(chunks).toString();};
  try {
    assert.equal(await storage.exists(a), false); checks.push('confirmed-new-key');
    const first = await storage.put(a, input(), {overwrite: true, metadata: {test: 'cloud'}});
    created.push({physicalKey: physical + a, revision: first.revision}); checks.push('put-version-confirmation');
    assert.equal(await read(a), 'APF cloud verification'); checks.push('get-snapshot');
    assert.equal((await storage.head(a, {ifRevision: first.revision})).metadata.test, 'cloud'); checks.push('current-head-condition');
    const second = await storage.put(a, input(), {overwrite: true});
    created.push({physicalKey: physical + a, revision: second.revision});
    assert.notEqual(first.revision, second.revision); checks.push('same-byte-new-version');
    await assert.rejects(storage.get(a, {ifRevision: first.revision}), {code: 'precondition-failed'}); checks.push('stale-current-condition');
    const copy = await storage.copy(a, b, {overwrite: true, sourceRevision: second.revision});
    created.push({physicalKey: physical + b, revision: copy.revision}); assert.equal(await read(b), 'APF cloud verification'); checks.push('streaming-copy');
    assert.deepEqual((await storage.list({prefix})).items.map(x => x.key).sort(), [a, b].sort()); checks.push('list-enrichment');
    const range = await storage.get(a, {range: {start: 0, endInclusive: 2}}), parts: Uint8Array[] = [];
    for await (const chunk of range.body) parts.push(chunk);
    assert.equal(Buffer.concat(parts).toString(), 'APF'); checks.push('range');
  } finally {
    await adapter.close();
    await cleanupExactVersions(Object.freeze(created.map(item => Object.freeze({...item}))));
  }
  return {kind: 'real-oss-smoke', status: 'PASS', checks, limitations: ['No IAM/TLS-policy negative test', 'No delete-marker or response-loss test', 'Unknown PUT outcome may require host reconciliation']};
}
