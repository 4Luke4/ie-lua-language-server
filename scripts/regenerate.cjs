// Regenerates every shipped API section from pinned upstream inputs so CI can require the committed
// data to be byte-for-byte reproducible. The inputs themselves are materialised beforehand by the
// .github/actions/upstream-docs action, which exports IE_LUA_EEEX_DOCS_ROOT, IE_LUA_LUAJIT_DOCS_ROOT
// and IE_LUA_LUA52_MANUAL; nothing here reaches the network.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const index = JSON.parse(fs.readFileSync('resources/api/api-index.json', 'utf8'));
const currentCommit = index.sources.find((s) => s.id === 'ee-game-structures-x64').commit;
const commit = process.env.IE_LUA_EEEX_COMMIT ?? currentCommit;
execFileSync(process.execPath, ['dist/tools/ingest-docs.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    IE_LUA_FETCH_EEEX: '1',
    IE_LUA_EEEX_COMMIT: commit,
    // Reusing the committed timestamp for an unchanged revision keeps a verification run from
    // producing a diff; a new upstream revision is a real data change and gets a new timestamp.
    IE_LUA_GENERATED_AT: commit === currentCommit ? index.generatedAt : new Date().toISOString(),
  },
});
