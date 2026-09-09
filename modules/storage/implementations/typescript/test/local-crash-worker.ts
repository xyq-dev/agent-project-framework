import {createLocalAdapterForTest} from '../src/adapters/local.js';
import {createStorage} from '../src/index.js';
import {source} from './helpers.js';
const [root, phase] = process.argv.slice(2);
if (!root || !phase || !process.send) throw new Error('worker input');
const pause = async (): Promise<void> => {process.send!('barrier'); await new Promise<void>(() => {});};
const adapter = await createLocalAdapterForTest({root, namespace: 'crash-test'}, {
  async phase(p) {if (p === phase) await pause(); if (p === 'before-rename' && phase === 'race-rename') process.send!('barrier');},
});
const storage = createStorage({adapter, namespace: 'crash-test'});
async function* input() {yield Buffer.from('new complete value'); if (phase === 'during-staging') await pause();}
await storage.put('record', phase === 'during-staging' ? input() : source('new complete value'), {overwrite: true});
await pause();
