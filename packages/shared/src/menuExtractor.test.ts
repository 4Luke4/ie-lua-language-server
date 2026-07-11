import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings } from './settings';
import { extractEmbeddedLua } from './menuExtractor';

void test('extracts backtick chunks and quoted menu Lua regions', () => {
  const text = [
    '`',
    'function preload()',
    'end',
    '`',
    'button',
    '{',
    '  text lua "getUiString(helpString)"',
    '  enabled "characterViewable"',
    '  action',
    '  "',
    '    Infinity_PopMenu()',
    '  "',
    '}',
  ].join('\n');

  const regions = extractEmbeddedLua(text, defaultSettings);
  assert.equal(regions.length, 4);
  assert.equal(regions[0]?.kind, 'chunk');
  assert.equal(regions[1]?.kind, 'expression');
  assert.equal(regions[1]?.virtualPrefix, 'return ');
  assert.equal(regions[2]?.key, 'enabled');
  assert.equal(regions[3]?.kind, 'block');
});
