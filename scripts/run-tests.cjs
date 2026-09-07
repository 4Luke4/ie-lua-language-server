const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function discover(directory, suffix) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? discover(file, suffix) : file.endsWith(suffix) ? [file] : [];
  });
}
const files = [...discover('dist', '.test.js'), ...discover('scripts', '.test.cjs')].sort();
if (!files.length) throw new Error('No unit tests discovered');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
