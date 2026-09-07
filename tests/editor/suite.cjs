const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cases } = require('./features.cjs');
const inventory = require('../feature-inventory.json');
async function run() {
  const extension = vscode.extensions.getExtension('infinity-engine-tools.ie-lua-language-server');
  assert.ok(extension, 'Installed extension exists');
  assert.ok(
    path
      .resolve(extension.extensionPath)
      .startsWith(path.resolve(process.env.IE_TEST_EXTENSIONS) + path.sep),
    'Must test installed VSIX',
  );
  assert.deepEqual(
    cases.map((c) => c.id),
    inventory.cases.map((c) => c.id),
  );
  const report = {
    vscode: vscode.version,
    platform: process.platform,
    arch: process.arch,
    channel: process.env.PACKAGE_CHANNEL,
    theme: process.env.IE_TEST_THEME,
    cases: [],
  };
  const output = path.join(process.env.IE_TEST_REPORTS, 'editor.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2));
  save();
  for (const scenario of cases) {
    const entry = { id: scenario.id, status: 'running' };
    report.cases.push(entry);
    save();
    try {
      await scenario.run({ extension });
      entry.status = 'passed';
      console.log(`PASS ${scenario.id}`);
    } catch (error) {
      entry.status = 'failed';
      entry.error = error?.stack ?? String(error);
      console.error(`FAIL ${scenario.id}`, error);
    } finally {
      save();
      // Each scenario owns fresh documents; reset workspace settings after failures too.
      await vscode.workspace.getConfiguration().update('ieLua', undefined, vscode.ConfigurationTarget.Workspace);
    }
  }
  assert.ok(report.cases.every((entry) => entry.status === 'passed'), 'All feature cases must pass');
}
module.exports = { run };
