import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyApiIndex,
  findApiStructureMembers,
  findApiSymbol,
  findApiSymbolForExpression,
  isBaseClassField,
  makeApiCallableView,
  makeDocumentation,
  parameterLabelOffsets,
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
  assert.match(documentation, /Undocumented in official source/u);
  assert.match(documentation, /```lua\nm_derivedStats: const struct CDerivedStats \*\*\n```/u);
  assert.doesNotMatch(documentation, /\\\\n/u);
});

void test('parameter label offsets stay inside the parameter list and keep repeats distinct', () => {
  assert.deepEqual(parameterLabelOffsets('Infinity_LuaConsoleInput(???,???)', ['???', '???']), [
    [25, 28],
    [29, 32],
  ]);
  // "a" also occurs in the callable's own name; the offset must point inside the parentheses.
  assert.deepEqual(parameterLabelOffsets('Infinity_SetArea(a)', ['a']), [[17, 18]]);
  assert.deepEqual(parameterLabelOffsets('Infinity_DisplayString(...)', ['...']), [[23, 26]]);
  assert.equal(parameterLabelOffsets('C:AddGold(Gold)', ['Missing']), undefined);
  assert.equal(parameterLabelOffsets('ffi.os', ['x']), undefined);
});

// A synthetic lineage shaped like EEex's CGameSprite -> CGameAIBase -> CGameObject, with a member
// declared at two levels, a base that names no documented structure, and a cycle back to the top.
const inheritance: ApiIndex = {
  ...index,
  symbols: [
    makeStructure('CDerived', 32),
    makeStructure('CMiddle', 24),
    makeStructure('CRoot', 16),
    makeField('CDerived', 'baseclass_0', 'CMiddle', '0x0', 24),
    makeField('CDerived', 'm_derived', 'int', '0x18', 4),
    makeField('CDerived', 'm_shared', 'short', '0x1c', 2),
    makeField('CMiddle', 'baseclass_0', 'CRoot', '0x0', 16),
    makeField('CMiddle', 'baseclass_1', 'CTemplate<int,1>', '0x10', 8),
    makeField('CMiddle', 'm_middle', 'int', '0x10', 4),
    makeField('CRoot', 'baseclass_0', 'CDerived', '0x0', 8),
    makeField('CRoot', 'm_root', 'int', '0x8', 4),
    makeField('CRoot', 'm_shared', 'int', '0xc', 4),
    makeAliasCallable('eeex-functions:EEex_Root_Ping', 'EEex_Root_Ping', 'ping', 'CRoot'),
  ],
};
const derivedDocument = ['---@type CDerived', 'local object', ''].join('\n');

void test('baseclass rows are inheritance, not members', () => {
  const baseRow = inheritance.symbols.find((symbol) => symbol.name === 'CDerived.baseclass_0')!;
  assert.equal(isBaseClassField(baseRow), true);
  assert.equal(isBaseClassField(inheritance.symbols.find((s) => s.name === 'CRoot.m_root')!), false);
  assert.equal(findApiSymbol(inheritance, defaultSettings, 'CDerived.baseclass_0'), undefined);
  assert.equal(
    findApiSymbolForExpression(
      inheritance,
      defaultSettings,
      'object.baseclass_0',
      derivedDocument,
      derivedDocument.length,
    ),
    undefined,
  );
});

void test('members of every extended structure complete on the derived one, nearest first', () => {
  const members = findApiStructureMembers(
    inheritance,
    defaultSettings,
    'object',
    derivedDocument,
    derivedDocument.length,
  );
  assert.deepEqual(
    members.map((symbol) => symbol.instanceName ?? symbol.name),
    ['m_derived', 'm_shared', 'm_middle', 'm_root', 'EEex_Root_Ping'],
  );
  // The nearest declaration of a repeated name wins, as it would at runtime.
  assert.equal(members.find((symbol) => symbol.instanceName === 'm_shared')?.dataType, 'short');
});

void test('inherited fields and methods resolve for hover and signature help', () => {
  const resolve = (expression: string): ApiSymbol | undefined =>
    findApiSymbolForExpression(
      inheritance,
      defaultSettings,
      expression,
      derivedDocument,
      derivedDocument.length,
    );
  assert.equal(resolve('object.m_root')?.name, 'CRoot.m_root');
  assert.equal(resolve('object.m_middle')?.name, 'CMiddle.m_middle');
  assert.equal(resolve('object.m_shared')?.name, 'CDerived.m_shared');
  assert.equal(resolve('object:ping')?.name, 'EEex_Root_Ping');
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
    documentationState: 'undocumented',
    upstreamUrl: `https://example.com/${name}#L1`,
    licenseStatus: 'allowed',
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
    documentationState: 'undocumented',
    upstreamUrl: `https://example.com/${name}#L1`,
    licenseStatus: 'allowed',
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
