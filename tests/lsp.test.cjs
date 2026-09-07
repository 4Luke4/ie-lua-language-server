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
    assert.deepEqual(edits, [
      {
        range: { start: { line: 1, character: 15 }, end: { line: 1, character: 17 } },
        newText: '',
      },
    ]);
  },
);

test('unavailable API candidates fall back to an empty index', { timeout: 30000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-empty-'));
  let client;
  t.after(async () => {
    // Windows cannot remove the current directory of a running server process.
    try {
      await client?.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
  const server = path.join(directory, 'server.js');
  fs.copyFileSync('dist/server/server.js', server);
  fs.writeFileSync(path.join(directory, 'bad.json'), '{malformed');
  client = await connect({ server, cwd: directory, index: path.join(directory, 'bad.json') });
  assert.deepEqual(
    await client.request('workspace/executeCommand', {
      command: 'ieLua.showApiSource',
      arguments: [],
    }),
    [],
  );
});

function change(client, doc, version, text) {
  client.notify('textDocument/didChange', {
    textDocument: { uri: doc.uri, version },
    contentChanges: [{ text }],
  });
}
function validate(client, doc) {
  return client.request('workspace/executeCommand', {
    command: 'ieLua.validateDocument',
    arguments: [doc.uri],
  });
}

test(
  'delayed configuration cannot publish old versions or resurrect closed sessions',
  { timeout: 30000 },
  async (t) => {
    const client = await connect();
    t.after(() => client.close());
    client.holdConfiguration();
    const doc = openWithoutAnalysis(client, 'race.lua', 'local obsolete =');
    const old = await client.waitForConfiguration();
    const validation = validate(client, doc).catch((error) => error);
    // A round trip ensures validation has captured the original session before close.
    await client.request('workspace/executeCommand', { command: 'ieLua.showApiSource' });
    client.notify('textDocument/didClose', { textDocument: doc });
    const reopened = openWithoutAnalysis(client, 'race.lua', 'local current = 1');
    const fresh = await client.waitForConfiguration(1);
    fresh.respond({ validation: { mode: 'manual' } });
    await validate(client, reopened);
    old.respond({ validation: { mode: 'type', debounceMs: 1 } });
    assert.match((await validation).message, /Document changed/);
    const symbols = await client.request('workspace/symbol', { query: '' });
    assert.ok(symbols.some((s) => s.name === 'current'));
    assert.ok(!symbols.some((s) => s.name === 'obsolete'));
    assert.ok(
      !client.notifications.some(
        (m) => m.method === 'textDocument/publishDiagnostics' && m.params.diagnostics.length,
      ),
    );
  },
);

test(
  'out-of-order configuration generations and edits use one current snapshot',
  { timeout: 30000 },
  async (t) => {
    const client = await connect();
    t.after(() => client.close());
    client.holdConfiguration();
    const doc = openWithoutAnalysis(client, 'configuration-race.lua', 'local obsolete =');
    const old = await client.waitForConfiguration();
    client.notify('workspace/didChangeConfiguration', { settings: {} });
    const fresh = await client.waitForConfiguration(1);
    change(client, doc, 2, 'local current = 1LL');
    fresh.respond({ dialect: 'luajit', validation: { mode: 'save' } });
    client.notify('textDocument/didSave', { textDocument: doc });
    await client.waitFor(
      (m) =>
        m.method === 'textDocument/publishDiagnostics' &&
        m.params.version === 2 &&
        m.params.diagnostics.length === 0,
    );
    old.respond({ dialect: 'lua52', validation: { mode: 'type', debounceMs: 1 } });
    await validate(client, doc);
    const publications = client.notifications.filter(
      (m) => m.method === 'textDocument/publishDiagnostics',
    );
    assert.ok(publications.length);
    assert.ok(
      publications.every((m) => m.params.version === 2 && m.params.diagnostics.length === 0),
    );
  },
);

test(
  'configuration failures recover and shutdown does not await suspended analysis',
  { timeout: 30000 },
  async () => {
    const client = await connect();
    try {
      client.holdConfiguration();
      const doc = openWithoutAnalysis(client, 'failed-configuration.lua', 'local value = 1');
      (await client.waitForConfiguration()).reject();
      // Wait until the background failure is observed before retrying.
      await client.waitFor(
        (m) =>
          m.method === 'window/logMessage' &&
          m.params.message.includes('Background document operation failed'),
      );
      const pending = validate(client, doc);
      (await client.waitForConfiguration(1)).respond({ validation: { mode: 'manual' } });
      await pending;
      client.notify('workspace/didChangeConfiguration', { settings: {} });
      await client.waitForConfiguration(2);
    } finally {
      await client.close();
    }
  },
);

test(
  'formatting preserves literal contents for both dialects over stdio',
  { timeout: 30000 },
  async (t) => {
    const client = await connect();
    t.after(() => client.close());
    for (const dialect of ['lua52', 'luajit']) {
      await client.setSettings({ dialect });
      const doc = await open(
        client,
        `literal-${dialect}.lua`,
        'local s = [=[value  \r\nnext\t]=]  \nprint(s)\t',
      );
      const edits = await client.request('textDocument/formatting', {
        textDocument: doc,
        options: { tabSize: 2, insertSpaces: true },
      });
      assert.deepEqual(edits, [
        {
          range: { start: { line: 1, character: 8 }, end: { line: 1, character: 10 } },
          newText: '',
        },
        {
          range: { start: { line: 2, character: 8 }, end: { line: 2, character: 9 } },
          newText: '',
        },
      ]);
    }
  },
);

function openWithoutAnalysis(client, name, text) {
  const document = { uri: uri(name), version: 1, languageId: 'ie-lua', text };
  client.notify('textDocument/didOpen', { textDocument: document });
  return { uri: document.uri };
}

test('API reload retains last good data and recovers atomically', { timeout: 30000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-reload-'));
  let client;
  t.after(async () => {
    try {
      await client?.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
  const server = path.join(directory, 'server.js');
  fs.copyFileSync('dist/server/server.js', server);
  const index = path.join(directory, 'index.json');
  const makeIndex = (name) => ({
    schemaVersion: 1,
    generatedAt: '2026-09-07',
    sources: [],
    symbols: [
      {
        id: name,
        name,
        kind: 'function',
        sourceSection: 'lua52',
        documentationState: 'undocumented',
        licenseStatus: 'unknown',
        upstreamUrl: 'https://example.com/',
      },
    ],
  });
  fs.writeFileSync(index, JSON.stringify(makeIndex('first_api')));
  client = await connect({ server, cwd: directory, index });
  const doc = await open(client, 'reload.lua', 'first_api()');
  const completion = () =>
    client.request('textDocument/completion', { textDocument: doc, position: position(0, 0) });
  assert.ok((await completion()).some((item) => item.label === 'first_api'));
  fs.writeFileSync(index, '{ secret_fixture_content');
  await assert.rejects(
    client.request('workspace/executeCommand', { command: 'ieLua.reloadApiData' }),
    /Previous API data retained/,
  );
  assert.ok((await completion()).some((item) => item.label === 'first_api'));
  assert.ok(!JSON.stringify(client.notifications).includes('secret_fixture_content'));
  fs.writeFileSync(index, JSON.stringify(makeIndex('second_api')));
  assert.equal(
    await client.request('workspace/executeCommand', { command: 'ieLua.reloadApiData' }),
    null,
  );
  const updated = await completion();
  assert.ok(updated.some((item) => item.label === 'second_api'));
  assert.ok(!updated.some((item) => item.label === 'first_api'));
});

test(
  'resource settings stay separate and missing validation targets are no-ops',
  { timeout: 30000 },
  async (t) => {
    const client = await connect({
      settingsForResource: (resource) => ({
        dialect: resource.endsWith('jit-resource.lua') ? 'luajit' : 'lua52',
        validation: { mode: 'manual' },
      }),
    });
    t.after(() => client.close());
    const jit = await open(client, 'jit-resource.lua', 'local value = 1LL');
    const lua = await open(client, 'lua-resource.lua', 'local value = 1LL');
    await validate(client, jit);
    await validate(client, lua);
    await client.waitFor(
      (m) =>
        m.method === 'textDocument/publishDiagnostics' &&
        m.params.uri === lua.uri &&
        m.params.diagnostics.length > 0,
    );
    assert.ok(
      client.notifications.some(
        (m) =>
          m.method === 'textDocument/publishDiagnostics' &&
          m.params.uri === jit.uri &&
          m.params.diagnostics.length === 0,
      ),
    );
    const start = client.notifications.length;
    await client.request('workspace/executeCommand', {
      command: 'ieLua.validateDocument',
      arguments: [],
    });
    assert.ok(
      !client.notifications
        .slice(start)
        .some((m) => m.method === 'textDocument/publishDiagnostics'),
    );
  },
);
