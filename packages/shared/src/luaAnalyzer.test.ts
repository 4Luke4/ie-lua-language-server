import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDocument } from './luaAnalyzer';
import { defaultSettings } from './settings';

void test('fallback analyzer indexes functions and references', () => {
  const analysis = analyzeDocument({
    uri: 'file:///sample.lua',
    languageId: 'ie-lua',
    text: 'local x = 1\nfunction hello(name)\n  return x\nend\nhello("world")\n',
    settings: defaultSettings,
  });

  assert.ok(analysis.symbols.some((symbol) => symbol.name === 'hello'));
  assert.ok(analysis.references.some((reference) => reference.name === 'x'));
});

void test('menu analyzer remaps embedded Lua symbols to host document offsets', () => {
  const text = '`function inMenu() end`\nmenu { action "inMenu()" }\n';
  const analysis = analyzeDocument({
    uri: 'file:///sample.menu',
    languageId: 'ie-menu',
    text,
    settings: defaultSettings,
  });

  const symbol = analysis.symbols.find((candidate) => candidate.name === 'inMenu');
  assert.ok(symbol);
  assert.equal(
    text.slice(symbol.location.offsetRange.start, symbol.location.offsetRange.end),
    'inMenu',
  );
});
