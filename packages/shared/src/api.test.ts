import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyApiIndex,
  findApiStructureMembers,
  findApiSymbol,
  findApiSymbolForExpression,
  makeDocumentation,
} from './api';
import { defaultSettings } from './settings';
import type { ApiIndex, ApiSymbol } from './types';

const symbols: ApiSymbol[] = [
  makeSymbol('lua52:string.upper', 'string.upper'),
  makeSymbol('luajit:ffi.new', 'ffi.new', 'luajit'),
  makeSymbol('luajit:table.new', 'table.new', 'luajit'),
  makeStructure('CGameSprite', 21384),
  makeStructure('CDerivedStats', 3240),
  makeField('CGameSprite', 'm_derivedStats', 'const struct CDerivedStats **', '0x1120', 3240),
  makeField('CDerivedStats', 'm_nSTR', '__int16', '0x0', 2),
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

void test('structure-qualified completion returns unqualified field symbols', () => {
  assert.deepEqual(
    findApiStructureMembers(index, defaultSettings, 'CGameSprite', '', 0).map(
      (symbol) => symbol.instanceName,
    ),
    ['m_derivedStats'],
  );
});

void test('type annotations enable field completion and chained member lookup', () => {
  const documentText = [
    '---@type CGameSprite',
    'local sprite',
    'sprite.m_derivedStats.m_nSTR',
  ].join('\n');

  assert.equal(
    findApiSymbolForExpression(
      index,
      defaultSettings,
      'sprite.m_derivedStats.m_nSTR',
      documentText,
      documentText.length,
    )?.dataType,
    '__int16',
  );
});

void test('parameter annotations enable field completion', () => {
  const documentText = [
    '---@param sprite CGameSprite',
    'local function inspect(sprite)',
    'end',
  ].join('\n');

  assert.deepEqual(
    findApiStructureMembers(
      index,
      defaultSettings,
      'sprite',
      documentText,
      documentText.length,
    ).map((symbol) => symbol.instanceName),
    ['m_derivedStats'],
  );
});

void test('layout documentation includes factual field metadata and pinned source', () => {
  const documentation = makeDocumentation(
    symbols.find((symbol) => symbol.name === 'CGameSprite.m_derivedStats')!,
  );

  assert.match(documentation, /Type:\*\* `const struct CDerivedStats \*\*`/u);
  assert.match(documentation, /Offset:\*\* `0x1120`/u);
  assert.match(documentation, /Size:\*\* 3240 bytes/u);
  assert.match(documentation, /Narrative upstream documentation is permission-gated/u);
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

function makeStructure(name: string, byteSize: number): ApiSymbol {
  return {
    id: `ee-game-structures-x64:${name}`,
    name,
    kind: 'structure',
    sourceSection: 'ee-game-structures-x64',
    signature: `struct ${name} (${byteSize} bytes)`,
    byteSize,
    memberCount: 1,
    documentationState: 'permission-gated',
    upstreamUrl: `https://example.com/${name}#L1`,
    licenseStatus: 'permission-gated',
  };
}

function makeField(
  containerName: string,
  instanceName: string,
  dataType: string,
  byteOffset: string,
  byteSize: number,
): ApiSymbol {
  const name = `${containerName}.${instanceName}`;
  return {
    id: `ee-game-structures-x64:${name}`,
    name,
    kind: 'field',
    sourceSection: 'ee-game-structures-x64',
    signature: `${instanceName}: ${dataType}`,
    containerName,
    instanceName,
    dataType,
    byteOffset,
    byteSize,
    documentationState: 'permission-gated',
    upstreamUrl: `https://example.com/${name}#L1`,
    licenseStatus: 'permission-gated',
  };
}
