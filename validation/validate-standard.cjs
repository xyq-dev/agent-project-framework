'use strict';

// Maintainer-only, read-only validation. Adoption is simulated in memory;
// this is not a project generator, business test runner or deployment tool.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '..');
const files = new Map();
function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git', 'node_modules', 'dist'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else {
      assert(e.isFile(), `unsupported source entry: ${full}`);
      files.set(path.relative(root, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'));
    }
  }
}
walk(root);
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
const load = text => yaml.load(text, {json: false});
function exists(map, p) { return map.has(p) || [...map.keys()].some(k => k.startsWith(p + '/')); }
function safe(p) {
  assert(typeof p === 'string' && p.length > 0);
  assert(!path.posix.isAbsolute(p) && !p.includes('\\') && !p.split('/').includes('..'), `unsafe path: ${p}`);
  assert(!p.split('/').includes('.git') && path.posix.normalize(p) === p, `unsafe path: ${p}`);
}
function links(map, selected = map) {
  for (const [name, text] of selected) {
    if (!name.endsWith('.md')) continue;
    for (const [, link] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(link)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), link.split('#')[0])).replace(/\/$/, '');
      safe(target);
      assert(exists(map, target), `broken link: ${name} -> ${link}`);
    }
  }
}
const manifest = load(files.get('templates/project/BOOTSTRAP_MANIFEST.yaml'));
function expand(m) {
  const target = new Map();
  for (const item of m.copies) {
    safe(item.source); safe(item.target);
    assert(['file', 'directory'].includes(item.kind), 'unknown copy kind');
    const members = item.kind === 'file' ? [item.source] : [...files.keys()].filter(p => p.startsWith(item.source + '/'));
    assert(members.length > 0, `empty directory: ${item.source}`);
    for (const member of members) {
      assert(files.has(member), `missing source: ${member}`);
      const dest = item.target + member.slice(item.source.length);
      safe(dest);
      assert(!target.has(dest) && ![...target.keys()].some(p => p.startsWith(dest + '/') || dest.startsWith(p + '/')), `duplicate/conflicting target: ${dest}`);
      target.set(dest, files.get(member));
    }
  }
  return target;
}
const values = {
  PROJECT_ID: 'sample-new-project',
  PROJECT_NAME: '示例项目 "A"：入口',
  PROJECT_OWNER: 'sample-owner',
  PROJECT_REPOSITORY: '',
  STANDARD_COMMIT: '0123456789012345678901234567890123456789'
};
function textRender(text) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    assert(Object.hasOwn(values, key), `unknown parameter: ${key}`);
    return values[key];
  });
}
function structuredRender(value) {
  if (typeof value === 'string') return textRender(value);
  if (Array.isArray(value)) return value.map(structuredRender);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, structuredRender(v)]));
  return value;
}
function contracts(map) {
  const p = load(map.get('.agent-project/project.yaml'));
  const w = load(map.get('.agent-project/workflow.yaml'));
  assert.equal(p.project.lifecycle_profile, w.profile);
  for (const target of Object.values(p.contracts)) { safe(target); assert(exists(map, target), `missing contract: ${target}`); }
}
function initialState(map) {
  const p = load(map.get('.agent-project/project.yaml'));
  const w = load(map.get('.agent-project/workflow.yaml'));
  assert.equal(p.project.id, values.PROJECT_ID);
  assert.equal(p.project.name, values.PROJECT_NAME);
  assert.equal(p.project.repository, '');
  assert.equal(p.adoption.source_commit, values.STANDARD_COMMIT);
  assert.equal(p.selected_modules.length, 0);
  assert.equal(w.project_lifecycle.length, 12);
  assert.equal(new Set(w.project_lifecycle.map(s => s.id)).size, 12);
  for (const stage of w.project_lifecycle) {
    assert.equal(stage.status, 'pending');
    assert.equal(stage.evidence.length, 0);
    assert.equal(stage.mode, 'required');
  }
  assert(![...map.keys()].some(p => p.startsWith('modules/') || p.startsWith('business-modules/')));
  const status = map.get('CURRENT_STATUS.md');
  assert(status.includes('NOT_RUN') && !/M1-[ABC]|TASKS_READY|ST-00[1-7]/.test(status));
  for (const text of map.values()) assert(!/\{\{[A-Z_]+\}\}/.test(text), 'unresolved template parameter');
}
function blueprints(map) {
  const base = 'playbooks/modules';
  const catalog = load(map.get(`${base}/catalog.yaml`));
  assert.equal(catalog.schema_version, '0.1');
  assert.equal(catalog.kind, 'implementation-blueprint-catalog');
  assert.equal(catalog.is_runtime_inventory, false, 'blueprints are not installed runtimes');
  assert.equal(catalog.project_gate_status, 'unassessed');
  assert.equal(catalog.path_base, 'catalog-directory');
  const ids = catalog.items.map(item => item.id);
  assert.deepEqual([...ids].sort(), ['audit', 'authorization', 'config', 'identity', 'media', 'notification', 'oss', 'payment', 'storage']);
  for (const item of catalog.items) {
    assert(typeof item.name === 'string' && item.name.length > 0);
    assert(['module-guide', 'adapter-guide'].includes(item.kind));
    assert(['medium', 'high', 'critical'].includes(item.risk));
    assert.equal(item.runtime_status, 'not-implemented', `runtime claim in blueprint: ${item.id}`);
    safe(item.guide);
    assert(item.guide.endsWith('.md'));
    const guide = map.get(`${base}/${item.guide}`);
    assert(guide, `missing blueprint: ${item.guide}`);
    for (const heading of ['采用前确认', '最小范围与契约', '实施任务', '必须验证', '完成条件']) {
      assert(guide.includes(`## ${heading}\n`), `missing ${heading}: ${item.id}`);
    }
    assert(Array.isArray(item.prerequisite_capabilities) && item.prerequisite_capabilities.length > 0);
    for (const input of item.prerequisite_capabilities) assert(typeof input === 'string' && input.length > 0);
    assert(Array.isArray(item.related_guides));
    for (const related of item.related_guides) assert(ids.includes(related), `unknown related guide: ${related}`);
  }
  assert(map.has('framework/MODULE_ADOPTION_PLAN.md') && map.has('agent-prompts/MODULE_PLAN.md'));
}

check('YAML/JSON syntax and Issue template metadata', () => {
  for (const [name, text] of files) {
    if (/\.ya?ml$/.test(name)) load(text);
    if (name.endsWith('.json')) JSON.parse(text);
    if (name.startsWith('.github/ISSUE_TEMPLATE/') && name.endsWith('.md')) {
      const match = text.match(/^---\n([\s\S]*?)\n---\n/);
      assert(match, `missing frontmatter: ${name}`);
      const front = load(match[1]);
      assert(typeof front.name === 'string' && front.name.length > 3);
      assert(typeof front.about === 'string' && front.about.length > 0);
    }
  }
});
check('source links and active contracts', () => {
  links(files, new Map([...files].filter(([p]) => !p.startsWith('templates/project/'))));
  contracts(files);
});
let target;
check('bootstrap expansion and safe parameter rendering', () => {
  target = expand(manifest);
  assert.equal(manifest.existing_destination_policy, 'compare-and-merge-never-overwrite');
  assert.deepEqual(Object.keys(manifest.parameters).sort(), Object.keys(values).sort());
  assert.equal(new Set(manifest.render_files).size, manifest.render_files.length);
  for (const p of manifest.render_files) {
    assert(target.has(p));
    const original = target.get(p);
    target.set(p, /\.ya?ml$/.test(p) ? yaml.dump(structuredRender(load(original)), {noRefs: true}) : textRender(original));
  }
});
check('new project state, contracts and relative links', () => {
  initialState(target); contracts(target); links(target);
});
check('module blueprints remain unassessed design inputs in source and adopted project', () => {
  blueprints(files); blueprints(target);
});
check('blueprints reject missing guides and false runtime completion', () => {
  const missing = new Map(target);
  missing.delete('playbooks/modules/oss.md');
  assert.throws(() => blueprints(missing), /missing blueprint/);
  const completed = new Map(target);
  const catalog = load(completed.get('playbooks/modules/catalog.yaml'));
  catalog.items.find(item => item.id === 'identity').runtime_status = 'implemented';
  completed.set('playbooks/modules/catalog.yaml', yaml.dump(catalog));
  assert.throws(() => blueprints(completed), /runtime claim/);
});
check('bootstrap rejects missing, duplicate, escaping and Git metadata paths', () => {
  const changes = [
    m => { m.copies[0].source = 'nonexistent-source.md'; },
    m => { m.copies.push({...m.copies[0]}); },
    m => { m.copies[0].target = '../outside.md'; },
    m => { m.copies[0].target = '.git/config'; }
  ];
  for (const change of changes) { const m = structuredClone(manifest); change(m); assert.throws(() => expand(m)); }
});
check('bootstrap rejects inherited completion and unresolved parameters', () => {
  const completed = new Map(target);
  const w = load(completed.get('.agent-project/workflow.yaml'));
  w.project_lifecycle[0].status = 'complete';
  completed.set('.agent-project/workflow.yaml', yaml.dump(w));
  assert.throws(() => initialState(completed));
  const unresolved = new Map(target);
  unresolved.set('README.md', '{{UNKNOWN_PARAMETER}}');
  assert.throws(() => initialState(unresolved));
});
check('prompt execution labels', () => {
  for (const [p, text] of files) if (p.startsWith('agent-prompts/') && p.endsWith('.md')) {
    assert(/^【执行工具：(Codex|Cursor)｜模型：[^\n]+】\n/.test(text), `missing execution label: ${p}`);
    if (text.startsWith('【执行工具：Codex')) assert(text.split('\n')[0].includes('推理等级：'));
  }
});
console.log(`STANDARD_CHECKS=${checks}; NEGATIVE_FIXTURES=8; BOOTSTRAP_FILES=${target.size}`);
console.log('STANDARD_VALIDATION=PASS; BOOTSTRAP=IN_MEMORY_ONLY; BUSINESS_TESTS=NOT_RUN');
