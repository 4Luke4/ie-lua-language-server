const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const JSZip=require('jszip');
const {auditVsix}=require('./audit-vsix.cjs');
async function fixture(t,change) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ie-vsix-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'VERSION'),'0.5.2\n');
  const zip=new JSZip();
  const index=JSON.stringify({sections:[{files:[{file:'sections/test.json'}]}]});
  const files={
    'extension.vsixmanifest':'<PackageManifest><Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="true" /></PackageManifest>',
    '[Content_Types].xml':'<Types/>',
    'extension/package.json':JSON.stringify({version:'0.5.2',contributes:{grammars:[]},icon:'assets/icon.png'}),
    'extension/dist/client/extension.js':'module.exports={};',
    'extension/dist/server/server.js':'process.exit(0);',
    'extension/resources/api/api-index.json':index,
    'extension/resources/api/sections/test.json':'{}',
    'extension/LICENSE.md':'License',
    'extension/THIRD_PARTY_NOTICES.md':'Notices',
    'extension/assets/icon.png':'fixture',
  };
  for(const [name,value] of Object.entries(files)) {
    zip.file(name,value);
    if(name.startsWith('extension/')) {const target=path.join(root,name.slice(10));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);}
  }
  if(change)change(zip);
  const file=path.join(root,'test.vsix');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));
  return {file,root};
}
test('archive audit checks shipped bytes and channel',async(t)=>{
  const {file,root}=await fixture(t);await auditVsix(file,'prerelease',root);await assert.rejects(auditVsix(file,'stable',root),/channel/u);
});
for(const [name,change,error] of [
  ['missing runtime',z=>z.remove('extension/dist/server/server.js'),/Missing archive/u],
  ['local sample',z=>z.file('extension/samples/private.lua','secret'),/Development/u],
  ['agent instructions',z=>z.file('extension/AGENTS.md','instructions'),/Excluded/u],
  ['missing shard',z=>z.remove('extension/resources/api/sections/test.json'),/Missing asset/u],
  ['orphan shard',z=>z.file('extension/resources/api/sections/extra.json','{}'),/Orphan/u],
  ['altered runtime',z=>z.file('extension/dist/server/server.js','unexpected'),/differs/u],
  ['unsafe path',z=>z.file('extension/../private.txt','unexpected'),/normalized/u],
]) test(`archive audit rejects ${name}`,async(t)=>{const {file,root}=await fixture(t,change);await assert.rejects(auditVsix(file,'prerelease',root),error);});
