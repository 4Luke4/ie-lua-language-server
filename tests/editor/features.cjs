const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const upstream =
  'https://github.com/Bubb13/EEex-Docs/blob/b4d0acd776f5d3b8337afbd038d6128efce51cfd/source/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(operation, predicate = Boolean, description = 'editor result') {
  const deadline = Date.now() + 20000;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await operation();
      if (predicate(last)) return last;
    } catch (error) {
      if (!['Canceled', 'CancellationError'].includes(error?.name)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(last)}`);
}
let sequence = 0;
async function document(text, suffix = 'lua') {
  const file = path.join(process.env.IE_TEST_WORKSPACE, `feature-${++sequence}.${suffix}`);
  fs.writeFileSync(file, text);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  await vscode.window.showTextDocument(doc);
  return doc;
}
const at = (doc, word, last = false) =>
  doc.positionAt(last ? doc.getText().lastIndexOf(word) : doc.getText().indexOf(word));
const execute = (name, ...args) => vscode.commands.executeCommand(`vscode.${name}`, ...args);
const label = (item) => (typeof item.label === 'string' ? item.label : item.label.label);
const markdown = (hovers) =>
  hovers.flatMap((h) => h.contents.map((c) => (typeof c === 'string' ? c : c.value))).join('\n');
async function completion(doc, position, expected) {
  return eventually(
    () => execute('executeCompletionItemProvider', doc.uri, position, undefined, 100),
    (r) => r?.items.some((i) => label(i) === expected),
    `completion ${expected}`,
  );
}
async function hover(doc, word) {
  return markdown(
    await eventually(
      () => execute('executeHoverProvider', doc.uri, at(doc, word, true)),
      (r) => r?.length,
    ),
  );
}
async function signature(doc, position, expected) {
  const result = await eventually(
    () => execute('executeSignatureHelpProvider', doc.uri, position),
    (r) => r?.signatures.length,
  );
  assert.equal(result.signatures[0].label, expected);
  return result;
}
async function replace(doc, text) {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    doc.uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    text,
  );
  assert.equal(await vscode.workspace.applyEdit(edit), true);
}
async function configure(values) {
  for (const [key, value] of Object.entries(values)) {
    await vscode.workspace
      .getConfiguration('ieLua')
      .update(key, value, vscode.ConfigurationTarget.Workspace);
  }
}
async function diagnostics(doc, expected, command = true) {
  return eventually(
    async () => {
      if (command) {
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('ieLua.validateDocument');
      }
      return vscode.languages.getDiagnostics(doc.uri);
    },
    expected,
    'diagnostics',
  );
}
const ranges = (locations) =>
  locations
    .map((l) => [
      l.range.start.line,
      l.range.start.character,
      l.range.end.line,
      l.range.end.character,
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const cases = [];
const scenario = (id, run) => cases.push({ id, run });

scenario('activation', async ({ extension }) => {
  const doc = await document('local activated = 1');
  assert.equal(doc.languageId, 'ie-lua');
  await eventually(() => extension.isActive);
  assert.equal(extension.packageJSON.version, '0.5.3');
  const commands = await vscode.commands.getCommands(true);
  for (const { command } of extension.packageJSON.contributes.commands)
    assert.equal(commands.filter((c) => c === command).length, 1);
  assert.equal(vscode.workspace.getConfiguration('editor').get('accessibilitySupport'), 'on');
  assert.equal(vscode.workspace.getConfiguration('workbench').get('reduceMotion'), 'on');
  await eventually(
    () => vscode.window.activeColorTheme.kind,
    (kind) =>
      kind ===
      (process.env.IE_TEST_THEME === 'Default High Contrast'
        ? vscode.ColorThemeKind.HighContrast
        : vscode.ColorThemeKind.Dark),
  );
});
scenario('lexical-navigation', async () => {
  const text =
    'local outer = 1\nlocal function greet(arg)\n  local outer = arg\n  return outer\nend\nprint(outer)\n-- outer\nlocal text = "outer"\n';
  const doc = await document(text);
  const definitions = await eventually(
    () => execute('executeDefinitionProvider', doc.uri, new vscode.Position(3, 10)),
    (r) => r?.length,
  );
  assert.equal((definitions[0].uri ?? definitions[0].targetUri).toString(), doc.uri.toString());
  assert.deepEqual(ranges(definitions.map((d) => ({ range: d.range ?? d.targetSelectionRange }))), [
    [2, 8, 2, 13],
  ]);
  const references = await execute('executeReferenceProvider', doc.uri, new vscode.Position(3, 10));
  // VS Code's command requests declarations as well as uses.
  assert.deepEqual(ranges(references), [
    [2, 8, 2, 13],
    [3, 9, 3, 14],
  ]);
  const rename = await execute(
    'executeDocumentRenameProvider',
    doc.uri,
    new vscode.Position(3, 10),
    'inner',
  );
  assert.deepEqual(
    rename.entries().map(([uri]) => uri.toString()),
    [doc.uri.toString()],
  );
  assert.deepEqual(ranges(rename.get(doc.uri)), [
    [2, 8, 2, 13],
    [3, 9, 3, 14],
  ]);
  assert.equal(await vscode.workspace.applyEdit(rename), true);
  assert.equal(
    doc.getText(),
    text.replace('local outer = arg', 'local inner = arg').replace('return outer', 'return inner'),
  );
  assert.match(await hover(doc, 'inner'), /local inner/u);
  const symbols = await execute('executeDocumentSymbolProvider', doc.uri);
  assert.deepEqual(symbols.map((s) => s.name).sort(), ['arg', 'greet', 'inner', 'outer', 'text']);
  const workspace = await execute('executeWorkspaceSymbolProvider', 'greet');
  assert.deepEqual(
    workspace.filter((s) => s.location.uri.toString() === doc.uri.toString()).map((s) => s.name),
    ['greet'],
  );
  const complete = await completion(doc, new vscode.Position(5, 0), 'outer');
  assert.equal(
    complete.items.some((i) => label(i) === 'arg' || label(i) === 'inner'),
    false,
  );
  const folds = await execute('executeFoldingRangeProvider', doc.uri);
  assert.deepEqual(
    folds.map((f) => [f.start, f.end]),
    [[1, 4]],
  );
  const legend = await execute('provideDocumentSemanticTokensLegend', doc.uri);
  const tokens = await execute('provideDocumentSemanticTokens', doc.uri);
  let line = 0,
    character = 0;
  const decoded = [];
  for (let i = 0; i < tokens.data.length; i += 5) {
    line += tokens.data[i];
    character = tokens.data[i] ? tokens.data[i + 1] : character + tokens.data[i + 1];
    decoded.push({
      line,
      character,
      length: tokens.data[i + 2],
      type: legend.tokenTypes[tokens.data[i + 3]],
      modifiers: tokens.data[i + 4],
    });
  }
  assert.ok(
    decoded.some(
      (t) => t.line === 1 && t.character === 15 && t.length === 5 && t.type === 'function',
    ),
  );
  assert.ok(
    decoded.some(
      (t) => t.line === 1 && t.character === 21 && t.length === 3 && t.type === 'parameter',
    ),
  );
  assert.equal(
    decoded.some((t) => t.line === 6),
    false,
  );
  assert.ok(
    decoded.some((t) => (t.modifiers & (1 << legend.tokenModifiers.indexOf('declaration'))) !== 0),
  );
});
scenario('fallback-and-rename-safety', async () => {
  const doc = await document('local safe = 1\nfunction incomplete(');
  const symbols = await eventually(
    () => execute('executeDocumentSymbolProvider', doc.uri),
    (r) => r?.some((s) => s.name === 'safe'),
  );
  assert.ok(symbols.some((s) => s.name === 'incomplete'));
  const reject = async (word, name) => {
    try {
      const edit = await execute('executeDocumentRenameProvider', doc.uri, at(doc, word), name);
      assert.ok(!edit || edit.size === 0);
    } catch (error) {
      assert.match(String(error), /rename|invalid|cannot|no result/iu);
    }
  };
  await reject('safe', 'better');
  await replace(doc, 'local safe, taken = 1, 2\nprint(safe,taken)');
  await reject('safe', 'taken');
  await reject('safe', 'bad name');
  await reject('safe', 'end');
});
scenario('game-api', async () => {
  const doc = await document('Infinity_DisplayString(\nC:AddGold(\n');
  const completions = await completion(doc, new vscode.Position(0, 0), 'Infinity_DisplayString');
  const item = completions.items.find((i) => label(i) === 'Infinity_DisplayString');
  assert.equal(item.detail, 'Infinity_DisplayString(arg1)');
  assert.equal(item.insertText ?? label(item), 'Infinity_DisplayString');
  const help = await hover(doc, 'Infinity_DisplayString');
  for (const fragment of ['Displays to the screen', '**Notes**', '```lua', '20000000 + 1'])
    assert.ok(help.includes(fragment));
  await signature(doc, new vscode.Position(0, 23), 'Infinity_DisplayString(arg1)');
  const members = await completion(doc, new vscode.Position(1, 2), 'AddGold');
  assert.equal(members.items.find((i) => label(i) === 'AddGold').detail, 'C:AddGold(Gold)');
  const call = await signature(doc, new vscode.Position(1, 10), 'C:AddGold(Gold)');
  assert.equal(call.signatures[0].parameters[0].label, 'Gold');
  const definitions = await execute(
    'executeDefinitionProvider',
    doc.uri,
    new vscode.Position(1, 4),
  );
  assert.equal(
    (definitions[0].uri ?? definitions[0].targetUri).toString(),
    upstream + 'EE%20Game%20Lua%20Functions/C/C_AddGold.rst#L11',
  );
});
scenario('eeex-api', async () => {
  const doc = await document(
    '---@type CGameObject\nlocal object\nobject:isSprite(\nEEex_Options_Option:set(\nEEex_Area_CreateVisualEffect\n',
  );
  const members = await completion(doc, new vscode.Position(2, 7), 'isSprite');
  assert.equal(members.items.find((i) => label(i) === 'isSprite').detail, 'isSprite(allowDead)');
  const help = await signature(doc, new vscode.Position(2, 16), 'object:isSprite(allowDead)');
  assert.equal(help.activeParameter, 0);
  assert.deepEqual(
    help.signatures[0].parameters.map((p) => p.label),
    ['allowDead'],
  );
  assert.ok(help.signatures[0].documentation.value.includes('false'));
  const options = await hover(doc, 'EEex_Options_Option:set');
  for (const fragment of ['**Note**', '**Return Values:**', '| newValue |', '<non-nil>'])
    assert.ok(options.includes(fragment));
  assert.ok((await hover(doc, 'EEex_Area_CreateVisualEffect')).includes('**Warning**'));
  await replace(doc, 'EEex_GameObject_IsSprite(object, ');
  const second = await signature(
    doc,
    doc.positionAt(doc.getText().length),
    'EEex_GameObject_IsSprite(object, allowDead)',
  );
  assert.equal(second.activeParameter, 1);
});
scenario('structures', async () => {
  const doc = await document(
    '---@type CGameSprite\nlocal sprite\nsprite.m_derivedStats.baseclass_0\nCGameObject\n',
  );
  await completion(doc, new vscode.Position(2, 7), 'm_derivedStats');
  const help = await hover(doc, 'sprite.m_derivedStats.baseclass_0');
  for (const fragment of ['CDerivedStatsTemplate', '0x0', '752'])
    assert.ok(help.includes(fragment));
  assert.ok((await hover(doc, 'CGameObject')).includes('m_objectType'));
  const definitions = await execute(
    'executeDefinitionProvider',
    doc.uri,
    new vscode.Position(2, 27),
  );
  assert.equal(
    (definitions[0].uri ?? definitions[0].targetUri).toString(),
    vscode.Uri.parse(upstream + 'EE%20Game%20Structures%20(x64)/CD/index.rst#L131').toString(),
  );
  await replace(doc, '---@param sprite CGameSprite\nlocal function inspect(sprite)\n sprite.\nend');
  await completion(doc, new vscode.Position(2, 8), 'm_active');
});
scenario('diagnostics-settings', async () => {
  const doc = await document('local good = 1');
  for (const mode of ['manual', 'save', 'type', 'saveAndType']) {
    await configure({
      'validation.mode': mode,
      'validation.debounceMs': 200,
      'diagnostics.unknownGlobals': 'off',
      dialect: 'lua52',
    });
    await replace(doc, 'local good = 1');
    await diagnostics(doc, (r) => r.length === 0);
    await replace(doc, 'local broken =');
    if (mode === 'manual' || mode === 'save') {
      await sleep(350);
      assert.deepEqual(vscode.languages.getDiagnostics(doc.uri), []);
      if (mode === 'save') await doc.save();
      else await vscode.commands.executeCommand('ieLua.validateDocument');
    }
    const errors = await diagnostics(doc, (r) => r.some((d) => d.code === 'lua-parse'), false);
    assert.equal(errors[0].severity, vscode.DiagnosticSeverity.Error);
    assert.equal(errors[0].range.start.line, 0);
    // Cancelling a pending invalid edit must publish only the latest valid state.
    await replace(doc, 'local broken =');
    await replace(doc, 'local good = 1');
    if (mode === 'save' || mode === 'saveAndType') await doc.save();
    await diagnostics(doc, (r) => r.length === 0, mode === 'manual');
  }
  await configure({ 'validation.mode': 'manual' });
  for (const [value, severity] of [
    ['off', undefined],
    ['hint', vscode.DiagnosticSeverity.Hint],
    ['warning', vscode.DiagnosticSeverity.Warning],
  ]) {
    await configure({ 'diagnostics.unknownGlobals': value });
    await replace(doc, 'unknown_test_global()');
    const ds = await diagnostics(doc, (r) =>
      severity === undefined
        ? r.length === 0
        : r.some((d) => d.code === 'unknown-global' && d.severity === severity),
    );
    if (severity !== undefined) assert.deepEqual(ranges(ds), [[0, 0, 0, 19]]);
  }
  await configure({ 'diagnostics.unknownGlobals': 'off', dialect: 'lua52' });
  await replace(doc, 'local value = 1LL');
  await diagnostics(doc, (r) => r.some((d) => d.code === 'lua-parse'));
  await configure({ dialect: 'luajit' });
  await diagnostics(doc, (r) => r.length === 0);
  await configure({ dialect: 'lua52' });
  await replace(doc, 'Infinity_DisplayString');
  await configure({ 'symbolSources.enabled': [] });
  await eventually(
    () => execute('executeCompletionItemProvider', doc.uri, new vscode.Position(0, 0)),
    (r) => r && !r.items.some((i) => label(i) === 'Infinity_DisplayString'),
  );
  await configure({ 'symbolSources.enabled': undefined });
  await completion(doc, new vscode.Position(0, 0), 'Infinity_DisplayString');
  await replace(doc, 'local broken =');
  await diagnostics(doc, (r) => r.length > 0);
  await doc.save();
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  await eventually(
    () => vscode.languages.getDiagnostics(doc.uri),
    (r) => r.length === 0,
  );
});
scenario('menu', async () => {
  await configure({ 'validation.mode': 'manual' });
  const forms = [
    '`local region =`',
    'text lua "("',
    'action "local region ="',
    'onOpen "local region ="',
    'onClose "local region ="',
    'on escape "local region ="',
    'enabled "("',
    'clickable "("',
  ];
  for (const form of forms) {
    const doc = await document('menu\r\n{\r\n text "😀 plain"\r\n ' + form + '\r\n}\r\n', 'menu');
    assert.equal(doc.languageId, 'ie-menu');
    const ds = await diagnostics(doc, (r) => r.some((d) => d.code === 'lua-parse'));
    assert.equal(ds.length, 1);
    assert.equal(ds[0].range.start.line, 3);
    assert.ok(ds[0].range.start.character >= form.indexOf('"') + 1);
  }
  await configure({ 'menu.blockKeys': ['customAction'], 'menu.expressionKeys': ['customEnabled'] });
  const custom = await document('menu { customAction "local bad =" customEnabled "(" }', 'menu');
  await diagnostics(custom, (r) => r.length === 2);
  await configure({ 'menu.blockKeys': undefined, 'menu.expressionKeys': undefined });
  const doc = await document(
    'menu { text "local fake = 1" }\r\n`local value = 1\r\nfunction menuAction()\r\n return value\r\nend`',
    'menu',
  );
  await diagnostics(doc, (r) => r.length === 0);
  const symbols = await execute('executeDocumentSymbolProvider', doc.uri);
  assert.deepEqual(symbols.map((s) => s.name).sort(), ['menuAction', 'value']);
  assert.deepEqual(
    symbols.find((s) => s.name === 'menuAction').selectionRange.start,
    new vscode.Position(2, 9),
  );
  const refs = await execute('executeReferenceProvider', doc.uri, new vscode.Position(3, 9));
  assert.deepEqual(ranges(refs), [
    [1, 7, 1, 12],
    [3, 8, 3, 13],
  ]);
});
scenario('formatting', async () => {
  await configure({ 'formatter.configPath': 'missing-ci-formatter.toml' });
  const doc = await document('-- 😀\r\nlocal value = 1  \r\n');
  const edits = await execute('executeFormatDocumentProvider', doc.uri, {
    tabSize: 2,
    insertSpaces: true,
  });
  assert.equal(edits.length, 1);
  assert.equal(edits[0].newText, '-- 😀\nlocal value = 1\n');
  const change = new vscode.WorkspaceEdit();
  change.set(doc.uri, edits);
  assert.equal(await vscode.workspace.applyEdit(change), true);
  assert.equal(doc.getText(), '-- 😀\nlocal value = 1\n');
  assert.deepEqual(
    (await execute('executeFormatDocumentProvider', doc.uri, { tabSize: 2, insertSpaces: true })) ??
      [],
    [],
  );
  const menu = await document('menu { action "print(1)  " }  \r\n', 'menu');
  assert.deepEqual(
    (await execute('executeFormatDocumentProvider', menu.uri, {
      tabSize: 2,
      insertSpaces: true,
    })) ?? [],
    [],
  );
  assert.equal(menu.getText(), 'menu { action "print(1)  " }  \r\n');
  await configure({ 'formatter.configPath': undefined });
});
scenario('commands', async ({ extension }) => {
  const one = await document('local invalid =');
  const two = await document('local invalid =');
  await vscode.commands.executeCommand('ieLua.validateWorkspace');
  for (const doc of [one, two])
    await diagnostics(doc, (r) => r.some((d) => d.code === 'lua-parse'), false);
  const api = await document('Infinity_DisplayString');
  const file = path.join(
    extension.extensionPath,
    'resources/api/sections/ee-game-lua-functions/Infinity.json',
  );
  const original = fs.readFileSync(file, 'utf8');
  try {
    const shard = JSON.parse(original);
    shard.symbols = shard.symbols.filter((s) => s.name !== 'Infinity_DisplayString');
    fs.writeFileSync(file, JSON.stringify(shard));
    await vscode.commands.executeCommand('ieLua.reloadApiData');
    await eventually(
      () => execute('executeCompletionItemProvider', api.uri, new vscode.Position(0, 0)),
      (r) => r && !r.items.some((i) => label(i) === 'Infinity_DisplayString'),
    );
  } finally {
    fs.writeFileSync(file, original);
    await vscode.commands.executeCommand('ieLua.reloadApiData');
  }
  await completion(api, new vscode.Position(0, 0), 'Infinity_DisplayString');
  const picker = vscode.commands.executeCommand('ieLua.showApiSource');
  await sleep(300);
  await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
  await picker;
  await vscode.commands.executeCommand('ieLua.openServerLog');
  await eventually(
    () => vscode.window.visibleTextEditors.some((e) => e.document.uri.scheme === 'output'),
    Boolean,
    'server output channel',
  );
});
scenario('packaged-grammar', async ({ extension }) => {
  const { Registry, parseRawGrammar } = require('vscode-textmate');
  const { loadWASM, OnigScanner, OnigString } = require('vscode-oniguruma');
  const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const grammars = extension.packageJSON.contributes.grammars;
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (p) => new OnigScanner(p),
      createOnigString: (s) => new OnigString(s),
    }),
    loadGrammar: async (scope) => {
      const contribution = grammars.find((g) => g.scopeName === scope);
      if (!contribution) return null;
      const file = path.join(extension.extensionPath, contribution.path);
      return parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
    },
  });
  try {
    const lua = await registry.loadGrammar('source.ie-lua');
    const tokens = lua.tokenizeLine('local text = "value" -- comment').tokens;
    for (const prefix of ['string.', 'comment.'])
      assert.ok(tokens.some((t) => t.scopes.some((s) => s.startsWith(prefix))));
    const menu = await registry.loadGrammar('source.ie-menu');
    for (const [text, scope] of [
      ['action `local x = 1`', 'meta.embedded.block.lua.ie-menu'],
      ['enabled lua "x == 1"', 'meta.embedded.expression.lua.ie-menu'],
    ]) {
      assert.ok(menu.tokenizeLine(text).tokens.some((t) => t.scopes.includes(scope)));
    }
  } finally {
    registry.dispose();
  }
});
module.exports = { cases, eventually };
