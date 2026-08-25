import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyApiIndex,
  findApiStructureMembers,
  findApiSymbol,
  findApiSymbolForExpression,
  makeApiCallableView,
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
  makeCallable('ee-game-lua-functions:C:AddGold', 'C:AddGold', 'C', 'AddGold', [
    { name: 'Gold', type: 'string', description: 'numeric amount' },
  ]),
  makeCallable(
    'eeex-functions:EEex_Options_Option:get',
    'EEex_Options_Option:get',
    'EEex_Options_Option',
    'get',
  ),
  makeCallable(
    'eeex-functions:EEex_Options_Option:getDefault',
    'EEex_Options_Option:getDefault',
    'EEex_Options_Option',
    'getDefault',
  ),
  makeCallable(
    'eeex-functions:EEex_Options_Option:set',
    'EEex_Options_Option:set',
    'EEex_Options_Option',
    'set',
    [{ name: 'newValue', type: '<any>', description: 'new value' }],
  ),
  makeAliasCallable('eeex-functions:EEex_Test_RunThing', 'EEex_Test_RunThing', 'run', 'CThing'),
  makeAliasCallable('eeex-functions:EEex_Test_RunOther', 'EEex_Test_RunOther', 'run', 'COther'),
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

void test('game namespaces complete canonical members after colon syntax', () => {
  assert.deepEqual(
    findApiStructureMembers(index, defaultSettings, 'C', '', 0).map(
      (symbol) => symbol.instanceName,
    ),
    ['AddGold'],
  );
  assert.equal(findApiSymbol(index, defaultSettings, 'C:AddGold')?.signature, 'C:AddGold(Gold)');
});

void test('colon-delimited EEex methods remain distinct', () => {
  assert.deepEqual(
    findApiStructureMembers(index, defaultSettings, 'EEex_Options_Option', '', 0).map(
      (symbol) => symbol.instanceName,
    ),
    ['get', 'getDefault', 'set'],
  );
});

void test('typed instance aliases resolve and consume the receiver in signature help', () => {
  const documentText = ['---@type CThing', 'local thing', 'thing:run(1)'].join('\n');
  const symbol = findApiSymbolForExpression(
    index,
    defaultSettings,
    'thing:run',
    documentText,
    documentText.length,
  );
  assert.equal(symbol?.name, 'EEex_Test_RunThing');
  assert.deepEqual(makeApiCallableView(symbol!, 'thing:run'), {
    signature: 'thing:run(value)',
    parameters: [{ name: 'value', type: 'integer', description: 'value to use' }],
  });
});

void test('ambiguous untyped instance aliases produce no guessed lookup', () => {
  assert.equal(findApiSymbolForExpression(index, defaultSettings, 'thing:run', '', 0), undefined);
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

function makeCallable(
  id: string,
  name: string,
  containerName: string,
  instanceName: string,
  parameters: NonNullable<ApiSymbol['parameters']> = [],
): ApiSymbol {
  return {
    id,
    name,
    kind: 'method',
    sourceSection: id.startsWith('eeex-functions:') ? 'eeex-functions' : 'ee-game-lua-functions',
    signature: `${name}(${parameters.map((parameter) => parameter.name).join(', ')})`,
    ...(parameters.length > 0 ? { parameters } : {}),
    containerName,
    instanceName,
    documentationMarkdown: 'Official wording.',
    documentationState: 'documented',
    upstreamUrl: `https://example.com/${id}#L1`,
    licenseStatus: 'allowed',
  };
}

function makeAliasCallable(
  id: string,
  name: string,
  aliasName: string,
  receiverType: string,
): ApiSymbol {
  const parameters = [
    { name: 'receiver', type: receiverType, description: 'receiver value' },
    { name: 'value', type: 'integer', description: 'value to use' },
  ];
  return {
    id,
    name,
    kind: 'function',
    sourceSection: 'eeex-functions',
    signature: `${name}(receiver, value)`,
    parameters,
    callableAliases: [{ name: aliasName, receiverType, consumesFirstParameter: true }],
    documentationMarkdown: 'Official wording.',
    documentationState: 'documented',
    upstreamUrl: `https://example.com/${id}#L1`,
    licenseStatus: 'allowed',
  };
}
