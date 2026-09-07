const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const JSZip = require('jszip');

async function auditVsix(file, expectedChannel, root = process.cwd()) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file), { checkCRC32: true });
  const names = Object.values(zip.files).filter((f) => !f.dir).map((f) => {
    assert.equal(f.unsafeOriginalName ?? f.name, f.name, 'Archive path was normalized');
    assert.ok(!f.name.includes('\\') && !f.name.startsWith('/') && !f.name.split('/').includes('..'), 'Unsafe archive path');
    return f.name;
  });
  const required = ['extension.vsixmanifest', '[Content_Types].xml', 'extension/package.json', 'extension/dist/client/extension.js', 'extension/dist/server/server.js', 'extension/resources/api/api-index.json', 'extension/LICENSE.md', 'extension/THIRD_PARTY_NOTICES.md'];
  for (const name of required) assert.ok(names.includes(name), `Missing archive file: ${name}`);
  for (const name of names) {
    assert.ok(!/(^|\/)(node_modules|packages|scripts|tests|samples|\.git|\.github|\.codex|\.agents|\.vscode|reports|artifacts)(\/|$)/u.test(name), `Development content: ${name}`);
    assert.ok(!/(\.map|\.test\.js|\.d\.ts|\.pem|\.key)$/u.test(name) && !/(^|\/)(AGENTS\.md|plan\.md|specs\.md|\.env(?:\..*)?)$/u.test(name), `Excluded file: ${name}`);
  }
  const pkg = JSON.parse(await zip.file('extension/package.json').async('string'));
  assert.equal(pkg.version, fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim());
  const manifest = await zip.file('extension.vsixmanifest').async('string');
  assert.equal(/Id="Microsoft\.VisualStudio\.Code\.PreRelease"\s+Value="true"/u.test(manifest), expectedChannel === 'prerelease', 'Incorrect VSIX channel');
  const index = JSON.parse(await zip.file('extension/resources/api/api-index.json').async('string'));
  const shards = index.sections.flatMap((section) => section.files.map((ref) => `extension/resources/api/${ref.file}`));
  for (const name of [...shards, ...pkg.contributes.grammars.map((g) => `extension/${g.path.replace(/^\.\//u, '')}`), `extension/${pkg.icon}`]) assert.ok(names.includes(name), `Missing asset: ${name}`);
  for (const name of names.filter((n) => n.startsWith('extension/resources/api/sections/'))) assert.ok(shards.includes(name), `Orphan shard: ${name}`);
  // Compare actual shipped bytes, not merely the packaging file list.
  for (const name of names.filter((n) => n.startsWith('extension/resources/') || n.startsWith('extension/dist/'))) {
    assert.deepEqual(await zip.file(name).async('nodebuffer'), fs.readFileSync(path.join(root, name.slice(10))), `Archive differs from audited source: ${name}`);
  }
  return { entries: names.length, version: pkg.version, channel: expectedChannel };
}
module.exports = { auditVsix };
if (require.main === module) {
  auditVsix(process.argv[2], process.argv[3]).then(console.log).catch((error) => {console.error(error); process.exitCode = 1;});
}
