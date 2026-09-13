import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStorage} from '../src/index.js';
import {createLocalAdapterForTest} from '../src/adapters/local.js';
import type {LocalOptions, LocalTestHooks} from '../src/adapters/local.js';
export async function localFixture(options: Partial<LocalOptions> = {}, hooks: LocalTestHooks = {}) {
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'apf-local-test-'));
  const adapter = await createLocalAdapterForTest({namespace: 'local-test', ...options, root}, hooks);
  const storage = createStorage({adapter, namespace: adapter.descriptor.namespace}, {maxObjectBytes: adapter.descriptor.maxObjectBytes});
  return {root, adapter, storage, async dispose() {await adapter.close(); await rm(root, {recursive: true, force: true});}};
}
