import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyApiIndex, findApiSymbol } from './api';
import { defaultSettings } from './settings';
import type { ApiIndex, ApiSymbol } from './types';

const symbols: ApiSymbol[] = [
  makeSymbol('lua52:string.upper', 'string.upper'),
  makeSymbol('luajit:ffi.new', 'ffi.new', 'luajit'),
  makeSymbol('luajit:table.new', 'table.new', 'luajit'),
];

const index: ApiIndex = {
  schemaVersion: 1,
  generatedAt: emptyApiIndex.generatedAt,
  sources: [],
  symbols,
};

void test('API lookup keeps exact dotted-name behavior', () => {
  assert.equal(findApiSymbol(index, defaultSettings, 'string.upper')?.name, 'string.upper');
});

void test('API lookup resolves a namespace-qualified colon call', () => {
  assert.equal(findApiSymbol(index, defaultSettings, 'string:upper')?.name, 'string.upper');
});

void test('API lookup resolves a colon call when the method name is unique', () => {
  assert.equal(findApiSymbol(index, defaultSettings, 'value:upper')?.name, 'string.upper');
});

void test('API lookup does not guess when a colon-call method name is ambiguous', () => {
  assert.equal(findApiSymbol(index, defaultSettings, 'value:new'), undefined);
});

function makeSymbol(
  id: string,
  name: string,
  sourceSection: ApiSymbol['sourceSection'] = 'lua52',
): ApiSymbol {
  return {
    id,
    name,
    kind: 'function',
    sourceSection,
    documentationState: 'documented',
    upstreamUrl: `https://example.com/${id}`,
    licenseStatus: 'allowed',
  };
}
