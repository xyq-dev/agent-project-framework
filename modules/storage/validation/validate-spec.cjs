'use strict';

// Static module-contract checks only. No storage I/O, runtime implementation or CLI.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Ajv2020 = require('ajv/dist/2020').default;
const yaml = require('js-yaml');

const moduleRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(moduleRoot, '../..');
const read = (p) => fs.readFileSync(p, 'utf8');
const loadYaml = (p) => yaml.load(read(p), {json: false});
let checks = 0;
function check(name, action) { action(); checks++; console.log(`PASS ${name}`); }
function listFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist'].includes(e.name)) return [];
      return listFiles(p);
    }
    return [p];
  });
}
function unique(items, subject) {
  assert.equal(new Set(items).size, items.length, `duplicate ${subject}`);
}
function within(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
}
const schema = JSON.parse(read(path.join(repoRoot, 'schemas/module.schema.json')));
const ajv = new Ajv2020({allErrors: true, strict: true});
const validate = ajv.compile(schema);
const manifest = loadYaml(path.join(moduleRoot, 'module.yaml'));
const gateConfig = loadYaml(path.join(repoRoot, '.agent-project/gates.yaml'));
const workflow = loadYaml(path.join(repoRoot, '.agent-project/workflow.yaml'));
const spec = read(path.join(moduleRoot, 'SPEC.md'));
const tests = read(path.join(moduleRoot, 'TESTS.md'));
const acceptance = read(path.join(moduleRoot, 'ACCEPTANCE.md'));
const status = read(path.join(moduleRoot, 'STATUS.md'));
const cases = loadYaml(path.join(__dirname, 'cases.yaml'));

function runtimeEvidenceChecks(evidence) {
  assert.equal(evidence.subject, `${manifest.name}@${manifest.version}`);
  assert.equal(evidence.implementation_root, 'implementations/typescript');
  assert.deepEqual(manifest.providers.map(p => p.id).sort(), evidence.implemented_scopes.filter(s => s !== 'core').sort());
  assert(evidence.not_implemented.every(s => !evidence.implemented_scopes.includes(s)));
  const expected = ['npm run typecheck', 'npm run build', 'npm test', 'npm run test:contract', 'npm run test:failure', 'npm run test:security'];
  for (const command of expected) {
    const item = evidence.commands.find(c => c.command === command);
    assert(item && item.exit_code === 0, `missing successful command: ${command}`);
    if (command.includes('test')) {
      assert(item.tests > 0 && item.tests === item.pass);
      assert.equal(item.fail, 0); assert.equal(item.skipped, 0); assert.equal(item.cancelled, 0);
    }
  }
  const runtimeRoot = path.join(moduleRoot, evidence.implementation_root);
  const actual = listFiles(runtimeRoot).filter(p => p.endsWith('.ts') || ['package.json','package-lock.json','tsconfig.json'].includes(path.basename(p)));
  unique(evidence.files.map(f => f.path), 'runtime evidence file');
  assert.deepEqual(evidence.files.map(f => f.path).sort(), actual.map(p => path.relative(runtimeRoot,p).split(path.sep).join('/')).sort());
  for (const file of evidence.files) {
    const target = path.resolve(runtimeRoot, file.path);
    assert(within(runtimeRoot, target));
    assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(target)).digest('hex'), file.sha256, `stale runtime evidence: ${file.path}`);
  }
}
function caseResultChecks(c, evidence) {
  const values = c.scopes.map(scope => c.results[scope]);
  assert.deepEqual(Object.keys(c.results).sort(), [...c.scopes].sort(), 'scope results must match declared scopes');
  assert(values.every(s => ['NOT_RUN','PASS','FAIL','BLOCKED'].includes(s)));
  for (const scope of c.scopes) if (c.results[scope] === 'PASS') {
    assert(evidence.implemented_scopes.includes(scope), `unimplemented scope passed: ${scope}`);
  }
  const aggregate = values.includes('FAIL') ? 'FAIL' : values.every(s => s === 'PASS') ? 'PASS' :
    values.includes('PASS') ? 'PARTIAL' : values.includes('BLOCKED') ? 'BLOCKED' : 'NOT_RUN';
  assert.equal(c.status, aggregate, 'aggregate cannot hide an untested scope');
}

function semanticChecks(m) {
  unique(m.capabilities.map(c => c.id), 'capability ID');
  unique(m.providers.map(p => p.id), 'provider ID');
  const names = [...m.dependencies, ...m.optional_dependencies].map(d => d.name);
  unique(names, 'required/optional dependency');
  assert(!names.includes(m.name), 'self dependency');
  const ids = new Set(m.capabilities.map(c => c.id));
  for (const p of m.providers) {
    for (const c of p.capabilities) assert(ids.has(c), `undeclared provider capability ${c}`);
  }
  const required = gateConfig.risk_requirements[m.risk].required_gates;
  for (const gate of required) assert(m.gates.required.includes(gate), `missing risk gate ${gate}`);
  for (const p of Object.values(m.artifacts)) {
    const target = path.resolve(moduleRoot, p);
    assert(within(moduleRoot, target), `artifact path escapes module: ${p}`);
    assert(fs.statSync(target).isFile(), `missing artifact: ${p}`);
  }
}

check('YAML syntax and duplicate keys', () => {
  for (const dir of ['.agent-project', 'templates/module', 'modules/storage']) {
    for (const p of listFiles(path.join(repoRoot, dir)).filter(p => p.endsWith('.yaml'))) loadYaml(p);
  }
});
check('JSON Schema 2020-12: storage and original template', () => {
  for (const m of [manifest, loadYaml(path.join(repoRoot, 'templates/module/module.yaml'))]) {
    assert(validate(m), JSON.stringify(validate.errors));
  }
});
check('semantic constraints and artifact containment', () => semanticChecks(manifest));
check('negative schema fixtures', () => {
  const invalid = [
    m => { delete m.name; },
    m => { m.risk = 'ultra'; },
    m => { m.status = 'DONE'; },
    m => { m.provider_secret = 'synthetic-not-a-secret'; },
    m => { m.optional_dependencies = [{name:'optional-test',version:'>=0.1.0',required_capabilities:[]}]; }
  ];
  for (const change of invalid) {
    const m = structuredClone(manifest); change(m);
    assert.equal(validate(m), false, 'invalid fixture incorrectly accepted');
  }
});
check('negative semantic fixtures', () => {
  const invalid = [
    m => { m.capabilities.push(structuredClone(m.capabilities[0])); },
    m => { m.providers = [{id:'test-adapter',kind:'adapter',capabilities:['undeclared-capability']}]; },
    m => { m.dependencies = [{name:m.name,version:'>=0.1.0',required_capabilities:[]}]; },
    m => { m.artifacts.spec = '../../README.md'; },
    m => { m.gates.required = ['spec']; }
  ];
  for (const change of invalid) {
    const m = structuredClone(manifest); change(m);
    assert.throws(() => semanticChecks(m));
  }
});
check('14 requirements, runtime cases and acceptance criteria', () => {
  const ids = (text, prefix) => [...text.matchAll(new RegExp(`^\\| (${prefix}-\\d{3}) \\|`, 'gm'))].map(x=>x[1]);
  const reqs = ids(spec, 'REQ'), testIds = ids(tests, 'TEST'), acs = ids(acceptance, 'AC');
  for (const [values, name] of [[reqs,'requirements'],[testIds,'tests'],[acs,'acceptance']]) {
    assert.equal(values.length, 14, name); unique(values,name);
  }
  assert.equal(cases.cases.length,14); unique(cases.cases.map(c=>c.id),'case IDs');
  assert.equal(cases.subject, `${manifest.name}@${manifest.version}`);
  const coveredReq=new Set(),coveredAc=new Set();
  assert.equal(cases.evidence_kind, 'scoped-runtime-results');
  assert.equal(cases.runtime_evidence, 'runtime-results.json');
  const evidence = JSON.parse(read(path.join(__dirname, cases.runtime_evidence)));
  runtimeEvidenceChecks(evidence);
  const falseComplete = structuredClone(cases.cases.find(c => c.scopes.includes('memory')));
  falseComplete.status = 'PASS';
  assert.throws(() => caseResultChecks(falseComplete, evidence));
  const falseLocal = structuredClone(falseComplete);
  falseLocal.results.local = 'PASS';
  assert.throws(() => caseResultChecks(falseLocal, evidence));
  const staleEvidence = structuredClone(evidence);
  staleEvidence.files[0].sha256 = '0'.repeat(64);
  assert.throws(() => runtimeEvidenceChecks(staleEvidence), /stale runtime evidence/);
  for (const c of cases.cases) {
    assert(testIds.includes(c.id)); assert(c.scopes.length);
    assert(c.scopes.every(s=>['memory','local'].includes(s)));
    caseResultChecks(c, evidence);
    for(const r of c.requirements) { assert(reqs.includes(r)); coveredReq.add(r); }
    for(const a of c.acceptance) { assert(acs.includes(a)); coveredAc.add(a); }
  }
  assert.equal(coveredReq.size,reqs.length); assert.equal(coveredAc.size,acs.length);
});
check('capability IDs match specification matrix', () => {
  const rows = [...spec.matchAll(/^\| `([a-z-]+)` \|/gm)].map(x=>x[1]);
  assert.deepEqual([...rows].sort(), manifest.capabilities.map(c=>c.id).sort());
});
check('state and task entry/exit distinction', () => {
  assert(status.includes(`## Lifecycle State\n\n\`${manifest.status}\``));
  assert(status.includes(`\`${manifest.version}\``));
  const transitions=workflow.module_lifecycle.constraints;
  assert.equal(transitions.find(t=>t.from==='TASKS_READY').evaluation,'entry-criteria');
  assert.equal(transitions.find(t=>t.from==='IMPLEMENTING').evaluation,'exit-criteria');
});
check('linked documents and non-empty artifacts', () => {
  const files = [...listFiles(moduleRoot), ...['README.md','CURRENT_STATUS.md','framework/ROADMAP.md'].map(p=>path.join(repoRoot,p))];
  for(const p of files) {
    assert(fs.statSync(p).size>0, `empty ${p}`);
    if(!p.endsWith('.md')) continue;
    for(const [,target] of read(p).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if(/^(?:https?:|#|mailto:)/.test(target)) continue;
      const absolute=path.resolve(path.dirname(p),target.split('#')[0]);
      assert(within(repoRoot,absolute), `link escapes repo: ${target}`);
      assert(fs.existsSync(absolute), `broken ${p}: ${target}`);
    }
  }
});
check('runtime evidence honesty and historical Cursor scope', () => {
  if(!fs.existsSync(path.join(moduleRoot,'implementations'))) {
    assert.equal(manifest.providers.length,0);
    assert.equal(manifest.compatibility.runtimes.length,0);
    assert(cases.cases.every(c=>c.status==='NOT_RUN'));
    assert(!['IMPLEMENTING','TESTING','REVIEW','ACCEPTED','RELEASED'].includes(manifest.status));
  }
  const prompt=read(path.join(moduleRoot,'agents/CURSOR_IMPLEMENTATION.md'));
  assert(prompt.startsWith('【执行工具：Cursor｜模型：Grok 4.6 High Fast】'));
  assert(prompt.includes('Push：NO')); assert(prompt.includes('ST-001～ST-004'));
});
console.log(`STATIC_CHECKS=${checks}; NEGATIVE_FIXTURES=13; MAPPED_RUNTIME_CASES=${cases.cases.length}`);
console.log(`AJV=${require('ajv/package.json').version}; JS_YAML=${require('js-yaml/package.json').version}`);
console.log('STATIC_VALIDATION=PASS; RUNTIME_TESTS=NOT_EXECUTED_BY_THIS_CHECK');
