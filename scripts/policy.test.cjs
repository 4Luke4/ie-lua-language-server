const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { validHeader, validateLabels, validateVersions, validateWorkflows } = require('./policy.cjs');
const { validateRelease } = require('./release-policy.cjs');

test('commit policy enforces types, syntax, and 100-character limit', () => {
  for (const header of ['feat(api)!: update schema', 'ci: verify packages', `fix: ${'a'.repeat(95)}`]) assert.ok(validHeader(header));
  for (const header of ['wip: work', 'fix:', 'fix: '+ 'a'.repeat(96), 'fix: ok\nextra']) assert.equal(validHeader(header), false);
});
test('labels reject missing definitions, duplicates, and malformed colors', () => {
  const labels = [{name:'documentation', color:'abcdef', description:'Docs'}];
  validateLabels(labels, {documentation:[]});
  assert.throws(() => validateLabels(labels, {unknown:[]}));
  assert.throws(() => validateLabels([...labels, ...labels], {}));
  assert.throws(() => validateLabels([{...labels[0], color:'red'}], {}));
});
test('CodeQL pins and privileged checkout boundaries are enforced', () => {
  const workflow = {on:{pull_request_target:{}}, permissions:{}, jobs:{test:{'timeout-minutes':5, steps:[{uses:`github/codeql-action/init@${'a'.repeat(40)}`} ]}}};
  validateWorkflows([['test', workflow]]);
  const mismatched = structuredClone(workflow);
  mismatched.jobs.test.steps.push({uses:`github/codeql-action/analyze@${'b'.repeat(40)}`});
  assert.throws(() => validateWorkflows([['test', mismatched]]));
  const unsafe = structuredClone(workflow);
  unsafe.jobs.test.steps.push({uses:`actions/checkout@${'a'.repeat(40)}`});
  assert.throws(() => validateWorkflows([['test', unsafe]]));
});
test('version validation catches stale workspace, lockfile, changelog, and editor baseline', () => {
  const read = (p) => JSON.parse(fs.readFileSync(p,'utf8'));
  const pkg = read('package.json'), lock = read('package-lock.json');
  const workspaces = pkg.workspaces.map((directory) => ({directory, manifest:read(`${directory}/package.json`)}));
  const version = fs.readFileSync('VERSION','utf8').trim(), changelog = fs.readFileSync('CHANGELOG.md','utf8');
  validateVersions(version,pkg,lock,workspaces,changelog);
  assert.throws(() => validateVersions('0.0.1',pkg,lock,workspaces,changelog));
  assert.throws(() => validateVersions(version,pkg,lock,workspaces,'## [0.0.1]'));
  const changed = structuredClone(pkg); changed.devDependencies['@types/vscode']='1.134.0';
  assert.throws(() => validateVersions(version,changed,lock,workspaces,changelog));
});
test('release validation rejects version, syntax, and channel mismatches', () => {
  validateRelease('stable','v0.6.0','0.6.0');
  validateRelease('prerelease','v0.5.2-pre.1','0.5.2');
  for (const [type,tag,version] of [['stable','v0.5.2','0.5.2'],['stable','v0.6.1','0.6.0'],['prerelease','v0.6.0-rc.1','0.6.0'],['prerelease','v0.5.2','0.5.2'],['other','v0.5.2','0.5.2']]) assert.throws(() => validateRelease(type,tag,version));
});
