const test = require('node:test');
const assert = require('node:assert/strict');
const luaparse = require('luaparse');
const { analyzeDocument } = require('../dist/shared/luaAnalyzer');
const { defaultSettings } = require('../dist/shared/settings');
test('real parser distinguishes Lua 5.2 and LuaJIT syntax', () => {
  const analyze = (text, dialect) =>
    analyzeDocument({
      uri: 'file:///dialect.lua',
      languageId: 'ie-lua',
      text,
      luaparse,
      settings: { ...defaultSettings, dialect },
    });
  assert.equal(analyze('local value = 1', 'lua52').diagnostics.length, 0);
  assert.equal(analyze('local value = 1LL', 'luajit').diagnostics.length, 0);
  assert.ok(analyze('local value = 1LL', 'lua52').diagnostics.length > 0);
  assert.ok(analyze('local value =', 'lua52').diagnostics.length > 0);
});
