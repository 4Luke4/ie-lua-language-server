const test = require('node:test');
const assert = require('node:assert/strict');
const luaparse = require('luaparse');
const { analyzeDocument, referenceAt, renameLocations, visibleSymbols } = require('../dist/shared');
const analyze = (text, languageId = 'ie-lua') => analyzeDocument({ uri: 'file:///binding.lua', text, languageId, luaparse });

test('lexical bindings separate shadowed variables and exclude comments, strings, and fields', () => {
  const text = 'local x = 1\ndo\n local x = 2\n print(x)\nend\nprint(x)\n-- x\nlocal s = "x"\nlocal t = {x = 1}\nprint(t.x)\n';
  const a = analyze(text);
  const inner = text.indexOf('x = 2');
  assert.deepEqual(renameLocations(a, inner, 'inner').map(l => l.offsetRange.start), [inner, text.indexOf('x)')]);
  assert.deepEqual(renameLocations(a, text.indexOf('x = 1'), 'outer').map(l => l.offsetRange.start), [6, text.lastIndexOf('print(x)') + 6]);
  assert.equal(a.references.filter(r => r.name === 'x').length, 4);
  assert.equal(referenceAt(a, text.indexOf('t.x') + 2), undefined);
});
test('initializers, recursion, closure capture, loop scopes and repeat conditions resolve correctly', () => {
  const text = 'local x = 1\ndo local x = x\n local function recur(n) if n > 0 then return recur(n-1) + x end end\nend\nfor i = 1, 3 do print(i) end\nrepeat local ready = true until ready\n';
  const a = analyze(text);
  assert.equal(a.diagnostics.length, 0);
  const refs = a.references.filter(r => r.name === 'x');
  assert.equal(refs[1].resolvedDeclaration, refs[0].resolvedDeclaration);
  assert.notEqual(refs[2].resolvedDeclaration, refs[0].resolvedDeclaration);
  assert.equal(refs[3].resolvedDeclaration, refs[2].resolvedDeclaration);
  for (const name of ['recur', 'i', 'ready']) {
    const rs = a.references.filter(r => r.name === name);
    assert.equal(new Set(rs.map(r => r.resolvedDeclaration.bindingId)).size, 1);
  }
  assert.equal(visibleSymbols(a, text.length).some(s => s.name === 'i' || s.name === 'ready'), false);
});
test('rename rejects collisions and capture of existing unresolved or outer uses', () => {
  for (const text of ['local x, y = 1, 2\nprint(x,y)', 'local x = 1\ndo local y = 2\nprint(x,y) end', 'local x = 1\nprint(x,y)']) {
    assert.equal(renameLocations(analyze(text), text.indexOf('x'), 'y'), undefined);
  }
});
test('incomplete buffers preserve discovery without allowing guessed rename', () => {
  const text = 'local good = 1\n-- local fake\nlocal s = "ghost"\nfunction partial('; const a = analyze(text);
  assert.equal(a.bindingsComplete, false);
  assert.ok(a.symbols.some(s => s.name === 'good'));
  assert.equal(a.symbols.some(s => s.name === 'fake'), false);
  assert.equal(a.references.some(r => r.name === 'ghost'), false);
  assert.equal(renameLocations(a, text.indexOf('good'), 'better'), undefined);
});
test('menu analysis excludes DSL and isolates locals while sharing document globals', () => {
  const text = 'menu { text "local fake = 1" action "local x = 1; print(x)" onOpen "local x = 2; print(x); shared()" }\n`function shared() end`';
  const a = analyze(text, 'ie-menu');
  assert.equal(a.diagnostics.length, 0);
  assert.equal(a.embeddedRegions.length, 3);
  assert.equal(a.symbols.some(s => s.name === 'fake' || s.name === 'menu'), false);
  assert.equal(new Set(a.symbols.filter(s => s.name === 'x').map(s => s.bindingId)).size, 2);
  const locations = renameLocations(a, text.indexOf('x = 1'), 'first');
  assert.deepEqual(locations.map(l => l.offsetRange.start), [text.indexOf('x = 1'), text.indexOf('x)')]);
  assert.equal(referenceAt(a, text.indexOf('shared()')).resolvedDeclaration.name, 'shared');
});
