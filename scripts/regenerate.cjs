const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const index = JSON.parse(fs.readFileSync('resources/api/api-index.json','utf8'));
const commit=process.env.IE_LUA_EEEX_COMMIT ?? index.sources.find((s)=>s.id==='ee-game-structures-x64').commit;
// Local game metadata stays separate from upstream documentation sources.
const utilityPath='resources/api/sections/ee-utility-functions.json';
const utility=JSON.parse(fs.readFileSync(utilityPath,'utf8'));
utility.source.licenseStatus='unknown';
for(const symbol of utility.symbols) symbol.licenseStatus='unknown';
fs.writeFileSync(utilityPath,JSON.stringify(utility,null,2)+'\n');
execFileSync(process.execPath,['dist/tools/ingest-docs.js'],{stdio:'inherit',env:{...process.env,IE_LUA_FETCH_EEEX:'1',IE_LUA_EEEX_COMMIT:commit,IE_LUA_PRESERVE_OTHER_SOURCES:'1',IE_LUA_GENERATED_AT:index.generatedAt}});
