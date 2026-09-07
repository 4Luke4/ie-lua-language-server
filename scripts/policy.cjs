const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');
const semver = require('semver');
const { execFileSync } = require('node:child_process');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readYaml = (file) => yaml.load(fs.readFileSync(file, 'utf8'));
const headerPattern =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^()\r\n]+\))?!?: \S.*$/u;
function validHeader(header) {
  return header.length <= 100 && headerPattern.test(header);
}
function validateLabels(definitions, rules) {
  assert.equal(new Set(definitions.map((d) => d.name.toLowerCase())).size, definitions.length);
  for (const definition of definitions) {
    assert.match(definition.color, /^[a-f0-9]{6}$/iu);
    assert.ok(definition.name && definition.description);
  }
  for (const name of Object.keys(rules))
    assert.ok(
      definitions.some((d) => d.name === name),
      `Missing label definition: ${name}`,
    );
}
function validateVersions(version, pkg, lock, workspaces, changelog) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u);
  assert.equal(pkg.version, version);
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  const names = new Set(workspaces.map((p) => p.manifest.name));
  for (const { directory, manifest } of workspaces) {
    assert.equal(manifest.version, version, directory);
    assert.equal(lock.packages[directory].version, version, directory);
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (names.has(name)) {
        assert.equal(range, version, name);
        assert.equal(lock.packages[directory].dependencies[name], version, name);
      }
    }
  }
  assert.equal(changelog.match(/^## \[v?(\d+\.\d+\.\d+)\]/mu)?.[1], version);
  assert.equal(semver.minVersion(pkg.engines.vscode).version, pkg.devDependencies['@types/vscode']);
  assert.equal(
    lock.packages[''].devDependencies['@types/vscode'],
    pkg.devDependencies['@types/vscode'],
  );
  assert.equal(
    lock.packages['node_modules/@types/vscode'].version,
    pkg.devDependencies['@types/vscode'],
  );
}
function validateWorkflows(workflows) {
  const codeqlPins = new Set();
  const names = new Set();
  for (const [file, workflow] of workflows) {
    if (workflow.name) {
      assert.ok(!names.has(workflow.name), `${file}: duplicate workflow name`);
      names.add(workflow.name);
    }
    assert.ok(workflow.permissions !== undefined, `${file}: explicit permissions required`);
    for (const job of Object.values(workflow.jobs)) {
      if (job.uses) continue;
      assert.ok(job['timeout-minutes'] > 0, `${file}: timeout required`);
      for (const step of job.steps ?? []) {
        if (step.uses && !step.uses.startsWith('./')) {
          assert.match(step.uses, /^[^@]+@[a-f0-9]{40}$/u, `${file}: immutable action required`);
          if (step.uses.startsWith('github/codeql-action/'))
            codeqlPins.add(step.uses.split('@')[1]);
        }
        if (workflow.on?.pull_request_target) {
          assert.ok(
            !step.uses?.startsWith('actions/checkout@'),
            `${file}: no checkout in privileged PR workflow`,
          );
        }
      }
    }
  }
  assert.equal(codeqlPins.size, 1, 'All CodeQL actions must use one revision');
}
function main() {
  const pkg = json('package.json');
  validateVersions(
    fs.readFileSync('VERSION', 'utf8').trim(),
    pkg,
    json('package-lock.json'),
    pkg.workspaces.map((directory) => ({ directory, manifest: json(`${directory}/package.json`) })),
    fs.readFileSync('CHANGELOG.md', 'utf8'),
  );
  validateLabels(json('.github/labels.json'), readYaml('.github/labeler.yml'));
  const workflows = fs
    .readdirSync('.github/workflows')
    .filter((f) => f.endsWith('.yml'))
    .map((f) => [f, readYaml(`.github/workflows/${f}`)]);
  validateWorkflows(workflows);
  validateVerificationGraph(workflows);
  for (const file of [
    'SECURITY.md',
    'docs/architecture/THREAT_MODEL.md',
    'docs/release/READINESS.md',
  ])
    assert.ok(fs.existsSync(file), file);
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  for (const file of tracked) {
    if (file.endsWith('.json')) json(file);
    if (file.endsWith('.yml')) readYaml(file);
  }
  const inventory = json('tests/feature-inventory.json');
  const groups = [
    ...fs.readFileSync('README.md', 'utf8').matchAll(/<!-- feature: ([a-z-]+) -->/gu),
  ].map((m) => m[1]);
  assert.deepEqual(groups, inventory.readmeGroups, 'README feature inventory drift');
  assert.equal(new Set(inventory.cases.map((c) => c.id)).size, inventory.cases.length);
  for (const group of groups)
    assert.ok(
      inventory.cases.some((c) => c.groups.includes(group)),
      group,
    );
  for (const { command } of pkg.contributes.commands)
    assert.ok(
      inventory.cases.some((c) => c.commands.includes(command)),
      command,
    );
  for (const setting of Object.keys(pkg.contributes.configuration.properties))
    assert.ok(
      inventory.cases.some((c) => c.settings.includes(setting)),
      setting,
    );
  assert.equal(json('.vscode/tasks.json').tasks.length, 0);
  assert.equal(json('.vscode/settings.json')['editor.formatOnSave'], false);
  for (const config of json('.vscode/launch.json').configurations)
    assert.equal(config.preLaunchTask, undefined);
  for (const grammar of pkg.contributes.grammars) {
    assert.ok(fs.existsSync(grammar.path));
    assert.equal(json(grammar.path).scopeName, grammar.scopeName);
  }
  const kate = json('editors/kate/lsp-client.example.json');
  for (const language of ['ie-lua', 'ie-menu'])
    assert.equal(kate.servers[language].command.at(-1), '--stdio');
  for (const directory of ['.github', 'packages', 'resources/api'])
    assert.ok(fs.existsSync(path.join(directory, 'AGENTS.md')));
  console.log('Repository policy passed');
}
function validateVerificationGraph(workflows) {
  const byFile = Object.fromEntries(workflows);
  const shared = './.github/workflows/verify.yml';
  assert.equal(byFile['ci.yml'].jobs.suite.uses, shared);
  assert.equal(byFile['release.yml'].jobs.verify.uses, shared);
  assert.deepEqual(Object.keys(byFile['verify.yml'].on), ['workflow_call']);
  assert.equal(byFile['maintenance.yml'].on.pull_request, undefined);
  assert.ok(
    byFile['verify.yml'].jobs.responsiveness,
    'Responsiveness is required release coverage',
  );
  const gate = byFile['ci.yml'].jobs.verify;
  assert.equal(gate.name, 'Verify');
  assert.equal(gate.needs, 'suite');
  assert.equal(gate.if, 'always()');
  assert.equal(byFile['ci.yml'].on.push.branches.join(','), 'main');
  for (const [file, workflow] of workflows) {
    if (file === 'verify.yml') continue;
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        assert.ok(
          !/npm (?:test\b|run test:(?:editor|lsp)\b)|vsce package/u.test(step.run ?? ''),
          `${file}: verification belongs in the shared suite`,
        );
      }
    }
  }
}
module.exports = {
  validHeader,
  validateLabels,
  validateVersions,
  validateWorkflows,
  validateVerificationGraph,
};
if (require.main === module) main();
