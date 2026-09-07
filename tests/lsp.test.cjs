const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { connect } = require('./lsp-client.cjs');
const uri = (name) => pathToFileURL(path.join(os.tmpdir(), name)).href;
const position = (line, character) => ({ line, character });
async function open(client, name, text, languageId = 'ie-lua') {
  const document = { uri: uri(name), version: 1, languageId, text };
  client.notify('textDocument/didOpen', { textDocument: document });
  await client.request('textDocument/documentSymbol', { textDocument: { uri: document.uri } });
  return { uri: document.uri };
}

test(
  'bundled stdio server implements advertised language features and lifecycle',
  { timeout: 60000 },
  async (t) => {
    const client = await connect();
    t.after(() => client.close());
    assert.equal(client.initialized.capabilities.executeCommandProvider, undefined);
    for (const capability of [
      'hoverProvider',
      'definitionProvider',
      'referencesProvider',
      'documentSymbolProvider',
      'workspaceSymbolProvider',
      'documentFormattingProvider',
      'foldingRangeProvider',
    ])
      assert.ok(client.initialized.capabilities[capability]);
    const doc = await open(
      client,
      'ie-protocol.lua',
      'local value = 1\nfunction hello(arg)\n  return value + arg\nend\nhello(value)\n',
    );
    const symbols = await client.request('textDocument/documentSymbol', { textDocument: doc });
    assert.ok(symbols.some((s) => s.name === 'hello'));
    assert.ok((await client.request('workspace/symbol', { query: 'hello' })).length);
    const hover = await client.request('textDocument/hover', {
      textDocument: doc,
      position: position(1, 11),
    });
    assert.ok(hover.contents.value.includes('hello'));
    const definitions = await client.request('textDocument/definition', {
      textDocument: doc,
      position: position(4, 2),
    });
    assert.ok(definitions && (Array.isArray(definitions) ? definitions.length : definitions.uri));
    const references = await client.request('textDocument/references', {
      textDocument: doc,
      position: position(4, 2),
      context: { includeDeclaration: true },
    });
    assert.ok(references.length >= 1);
    const rename = await client.request('textDocument/rename', {
      textDocument: doc,
      position: position(4, 2),
      newName: 'greet',
    });
    assert.ok(rename.changes[doc.uri].length >= 1);
    assert.equal(
      await client.request('textDocument/rename', {
        textDocument: doc,
        position: position(4, 2),
        newName: 'bad name',
      }),
      null,
    );
    assert.ok((await client.request('textDocument/foldingRange', { textDocument: doc })).length);
    assert.ok(
      (await client.request('textDocument/semanticTokens/full', { textDocument: doc })).data.length,
    );
    const api = await open(
      client,
      'ie-api.lua',
      'Infinity_DisplayString(\nCGameObject\n---@type CGameSprite\nlocal sprite\nsprite.\n',
    );
    const completions = await client.request('textDocument/completion', {
      textDocument: api,
      position: position(0, 0),
    });
    assert.ok(completions.some((c) => c.label === 'Infinity_DisplayString'));
    const signature = await client.request('textDocument/signatureHelp', {
      textDocument: api,
      position: position(0, 23),
    });
    assert.ok(signature.signatures[0].label.includes('Infinity_DisplayString'));
    const structure = await client.request('textDocument/hover', {
      textDocument: api,
      position: position(1, 4),
    });
    assert.match(structure.contents.value, /m_objectType/u);
    assert.match(structure.contents.value, /#L\d+/u);
    assert.ok(
      (
        await client.request('textDocument/completion', {
          textDocument: api,
          position: position(4, 7),
        })
      ).some((c) => c.label === 'm_active'),
    );
    await client.setSettings({ symbolSources: { enabled: [] }, validation: { mode: 'manual' } });
    assert.equal(
      (
        await client.request('textDocument/completion', {
          textDocument: api,
          position: position(0, 0),
        })
      ).some((c) => c.label === 'Infinity_DisplayString'),
      false,
    );
    const sources = await client.request('workspace/executeCommand', {
      command: 'ieLua.showApiSource',
      arguments: [],
    });
    assert.equal(sources.length, 6);
    for (const command of [
      'ieLua.reloadApiData',
      'ieLua.validateDocument',
      'ieLua.validateWorkspace',
      'ieLua.openServerLog',
    ])
      await client.request('workspace/executeCommand', { command, arguments: [doc.uri] });
    const closeStart = client.notifications.length;
    client.notify('textDocument/didClose', { textDocument: doc });
    await client.waitFor(
      (m) =>
        m.method === 'textDocument/publishDiagnostics' &&
        m.params.uri === doc.uri &&
        m.params.diagnostics.length === 0,
      closeStart,
    );
  },
);

test(
  'diagnostic modes, configuration updates, and document close',
  { timeout: 60000 },
  async (t) => {
    const client = await connect({ settings: { validation: { mode: 'manual', debounceMs: 20 } } });
    t.after(() => client.close());
    const doc = await open(client, 'ie-errors.lua', 'local broken =\n');
    await client.request('workspace/executeCommand', {
      command: 'ieLua.validateDocument',
      arguments: [doc.uri],
    });
    await client.waitFor(
      (m) =>
        m.method === 'textDocument/publishDiagnostics' &&
        m.params.uri === doc.uri &&
        m.params.diagnostics.length > 0,
    );
    let version = 1;
    for (const mode of ['save', 'type', 'saveAndType']) {
      await client.setSettings({ validation: { mode, debounceMs: 20 } });
      const start = client.notifications.length;
      client.notify('textDocument/didChange', {
        textDocument: { ...doc, version: ++version },
        contentChanges: [{ text: 'local invalid =\n' }],
      });
      if (mode === 'save') client.notify('textDocument/didSave', { textDocument: doc });
      await client.waitFor(
        (m) =>
          m.method === 'textDocument/publishDiagnostics' &&
          m.params.uri === doc.uri &&
          m.params.diagnostics.length > 0,
        start,
      );
    }
    await client.setSettings({
      validation: { mode: 'manual' },
      diagnostics: { unknownGlobals: 'warning' },
    });
    client.notify('textDocument/didChange', {
      textDocument: { ...doc, version: ++version },
      contentChanges: [{ text: 'mystery()\n' }],
    });
    const start = client.notifications.length;
    await client.request('workspace/executeCommand', {
      command: 'ieLua.validateDocument',
      arguments: [doc.uri],
    });
    await client.waitFor(
      (m) =>
        m.method === 'textDocument/publishDiagnostics' &&
        m.params.diagnostics.some((d) => d.code === 'unknown-global'),
      start,
    );
  },
);

test(
  'menu positions and conservative formatting survive CRLF and Unicode',
  { timeout: 30000 },
  async (t) => {
    const client = await connect();
    t.after(() => client.close());
    const menu = await open(
      client,
      'ie-menu.menu',
      'menu\r\n{\r\n action `function menuAction()\r\n return 1\r\nend`\r\n}\r\n',
      'ie-menu',
    );
    const symbols = await client.request('textDocument/documentSymbol', { textDocument: menu });
    const action = symbols.find((s) => s.name === 'menuAction');
    assert.ok(action);
    assert.equal(action.range.start.line, 2);
    assert.deepEqual(
      await client.request('textDocument/formatting', {
        textDocument: menu,
        options: { tabSize: 2, insertSpaces: true },
      }),
      [],
    );
    const lua = await open(client, 'ie-unicode.lua', '-- 😀\r\nlocal count = 1  \r\n');
    const edits = await client.request('textDocument/formatting', {
      textDocument: lua,
      options: { tabSize: 2, insertSpaces: true },
    });
    assert.equal(edits[0].newText, '-- 😀\nlocal count = 1\n');
  },
);

test('unavailable API candidates fall back to an empty index', { timeout: 30000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-empty-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const server = path.join(directory, 'server.js');
  fs.copyFileSync('dist/server/server.js', server);
  fs.writeFileSync(path.join(directory, 'bad.json'), '{malformed');
  const client = await connect({ server, cwd: directory, index: path.join(directory, 'bad.json') });
  t.after(() => client.close());
  assert.deepEqual(
    await client.request('workspace/executeCommand', {
      command: 'ieLua.showApiSource',
      arguments: [],
    }),
    [],
  );
});
