const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Registry,parseRawGrammar}=require('vscode-textmate');
const {loadWASM,OnigScanner,OnigString}=require('vscode-oniguruma');

test('TextMate tokenization preserves Lua and embedded menu scopes',async()=>{
  const wasm=fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength));
  const registry=new Registry({
    onigLib:Promise.resolve({createOnigScanner:patterns=>new OnigScanner(patterns),createOnigString:text=>new OnigString(text)}),
    loadGrammar:async(scope)=>{
      const file=scope==='source.ie-lua'?'syntaxes/ie-lua.tmLanguage.json':scope==='source.ie-menu'?'syntaxes/ie-menu.tmLanguage.json':undefined;
      return file?parseRawGrammar(fs.readFileSync(file,'utf8'),file):null;
    },
  });
  try {
    const lua=await registry.loadGrammar('source.ie-lua');
    const tokens=lua.tokenizeLine('local value = "hello" -- comment').tokens;
    assert.ok(tokens.some(t=>t.scopes.some(s=>s.startsWith('string.'))));
    assert.ok(tokens.some(t=>t.scopes.some(s=>s.startsWith('comment.'))));
    const menu=await registry.loadGrammar('source.ie-menu');
    const embedded=menu.tokenizeLine('action `local value = 1`').tokens;
    assert.ok(embedded.some(t=>t.scopes.includes('meta.embedded.block.lua.ie-menu')));
    const expression=menu.tokenizeLine('enabled lua "value == 1"').tokens;
    assert.ok(expression.some(t=>t.scopes.includes('meta.embedded.expression.lua.ie-menu')));
    const first=menu.tokenizeLine('action `function test()');
    const second=menu.tokenizeLine('return 1',first.ruleStack);
    assert.ok(second.tokens.every(t=>t.scopes.includes('meta.embedded.block.lua.ie-menu')));
    const end=menu.tokenizeLine('end`',second.ruleStack);
    const after=menu.tokenizeLine('text "plain"',end.ruleStack);
    assert.ok(after.tokens.every(t=>!t.scopes.includes('meta.embedded.block.lua.ie-menu')));
  } finally {registry.dispose();}
});
