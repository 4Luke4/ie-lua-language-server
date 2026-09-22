const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { connect } = require('./lsp-client.cjs');
const inventory = require('./feature-inventory.json');

// This suite is a coverage gate rather than a second regression suite: it proves that each
// language service the README names individually still answers with a real result over the stdio
// transport non-VS Code editors use. Deep behavioural regressions stay in tests/lsp.test.cjs.
const report = {
  schemaVersion: 1,
  commit: process.env.GITHUB_SHA,
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  status: 'running',
  declared: inventory.declaredLanguageServices,
  features: [],
};
const uri = (name) => pathToFileURL(path.join(os.tmpdir(), name)).href;
const position = (line, character) => ({ line, character });

async function open(client, name, text, languageId = 'ie-lua') {
  const document = { uri: uri(name), version: 1, languageId, text };
  client.notify('textDocument/didOpen', { textDocument: document });
  // documentSymbol round-trips the open notification, so the document is analysed before the caller
  // issues the request it actually cares about.
  await client.request('textDocument/documentSymbol', { textDocument: { uri: document.uri } });
  return { uri: document.uri };
}

function save() {
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/features-stdio.json', JSON.stringify(report, null, 2) + '\n');
}

// Each declared service gets its own named subtest so a regression names the service that broke.
// Its outcome is recorded either way, so the uploaded report is complete after a failure.
async function feature(t, id, run) {
  assert.ok(inventory.declaredLanguageServices.includes(id), `Undeclared service: ${id}`);
  const entry = { feature: id, status: 'running' };
  report.features.push(entry);
  await t.test(id, async () => {
    try {
      entry.evidence = await run();
      entry.status = 'passed';
    } catch (error) {
      entry.status = 'failed';
      entry.error = error?.stack ?? String(error);
      throw error;
    } finally {
      save();
    }
  });
}

test('stdio server answers every declared language service', { timeout: 120000 }, async (t) => {
  // Manual validation keeps diagnostics a deliberate act of the diagnostics case instead of
  // background noise that every other case would have to wait out.
  const client = await connect({
    quiet: true,
    settings: { validation: { mode: 'manual', debounceMs: 20 } },
  });
  t.after(async () => {
    report.status = report.features.every((entry) => entry.status === 'passed')
      ? 'passed'
      : 'failed';
    save();
    await client.close();
  });

  const lexical = await open(
    client,
    'ie-features.lua',
    'local value = 1\nfunction hello(arg)\n  return value + arg\nend\nhello(value)\n',
  );
  const api = await open(
    client,
    'ie-features-api.lua',
    'Infinity_DisplayString(\nCGameObject\n---@type CGameSprite\nlocal sprite\nsprite.\n',
  );
  const other = await open(
    client,
    'ie-features-other.lua',
    'function otherHelper()\n  return 1\nend\n',
  );

  await feature(t, 'completion', async () => {
    const items = await client.request('textDocument/completion', {
      textDocument: api,
      position: position(0, 0),
    });
    const match = items.find((item) => item.label === 'Infinity_DisplayString');
    assert.ok(match, 'API completion must offer Infinity_DisplayString');
    return { label: match.label, itemCount: items.length };
  });

  await feature(t, 'hover', async () => {
    const hover = await client.request('textDocument/hover', {
      textDocument: lexical,
      position: position(1, 11),
    });
    assert.match(hover.contents.value, /hello/u);
    return { markdownLength: hover.contents.value.length };
  });

  await feature(t, 'signature help', async () => {
    const help = await client.request('textDocument/signatureHelp', {
      textDocument: api,
      position: position(0, 23),
    });
    assert.match(help.signatures[0].label, /Infinity_DisplayString/u);
    return { label: help.signatures[0].label, activeParameter: help.activeParameter };
  });

  await feature(t, 'go to definition', async () => {
    const result = await client.request('textDocument/definition', {
      textDocument: lexical,
      position: position(4, 2),
    });
    const location = Array.isArray(result) ? result[0] : result;
    assert.equal(location.uri, lexical.uri, 'Definition must resolve in the same document');
    assert.equal(location.range.start.line, 1, 'Definition must resolve to the declaration');
    return { line: location.range.start.line };
  });

  await feature(t, 'find references', async () => {
    const references = await client.request('textDocument/references', {
      textDocument: lexical,
      position: position(0, 6),
      context: { includeDeclaration: true },
    });
    assert.ok(references.length >= 2, 'value is declared once and read twice');
    assert.ok(references.every((reference) => reference.uri === lexical.uri));
    return { count: references.length };
  });

  await feature(t, 'same-file rename', async () => {
    const rename = await client.request('textDocument/rename', {
      textDocument: lexical,
      position: position(4, 2),
      newName: 'greet',
    });
    assert.deepEqual(Object.keys(rename.changes), [lexical.uri], 'Rename stays in one document');
    assert.ok(rename.changes[lexical.uri].length >= 2, 'Declaration and call site both change');
    assert.equal(
      await client.request('textDocument/rename', {
        textDocument: lexical,
        position: position(4, 2),
        newName: 'not an identifier',
      }),
      null,
      'An invalid new name must be rejected rather than applied',
    );
    return { editCount: rename.changes[lexical.uri].length };
  });

  await feature(t, 'diagnostics', async () => {
    const broken = await open(client, 'ie-features-errors.lua', 'local broken =\n');
    const start = client.notifications.length;
    await client.request('workspace/executeCommand', {
      command: 'ieLua.validateDocument',
      arguments: [broken.uri],
    });
    const published = await client.waitFor(
      (message) =>
        message.method === 'textDocument/publishDiagnostics' &&
        message.params.uri === broken.uri &&
        message.params.diagnostics.length > 0,
      start,
    );
    assert.equal(published.params.diagnostics[0].source, 'ie-lua');
    return { count: published.params.diagnostics.length };
  });

  await feature(t, 'formatting', async () => {
    const messy = await open(client, 'ie-features-format.lua', 'local kept = 1   \nreturn kept\n');
    const edits = await client.request('textDocument/formatting', {
      textDocument: messy,
      options: { tabSize: 2, insertSpaces: true },
    });
    assert.ok(edits.length >= 1, 'Trailing whitespace must produce an edit');
    assert.ok(
      edits.every((edit) => edit.newText === ''),
      'Formatting only deletes trailing whitespace',
    );
    assert.deepEqual(edits[0].range, { start: position(0, 14), end: position(0, 17) });
    return { editCount: edits.length };
  });

  await feature(t, 'document symbols', async () => {
    const symbols = await client.request('textDocument/documentSymbol', { textDocument: lexical });
    assert.ok(symbols.some((symbol) => symbol.name === 'hello'));
    return { count: symbols.length };
  });

  await feature(t, 'workspace symbols', async () => {
    // Queried for a symbol declared in a different open document, so this cannot pass on
    // document-symbol behaviour alone.
    const symbols = await client.request('workspace/symbol', { query: 'otherHelper' });
    const match = symbols.find((symbol) => symbol.name === 'otherHelper');
    assert.ok(match, 'Workspace symbols must span open documents');
    assert.equal(match.location.uri, other.uri);
    return { count: symbols.length };
  });

  await feature(t, 'semantic tokens', async () => {
    const tokens = await client.request('textDocument/semanticTokens/full', {
      textDocument: lexical,
    });
    assert.ok(tokens.data.length > 0, 'Semantic tokens must not be empty');
    assert.equal(tokens.data.length % 5, 0, 'Tokens are encoded as five-integer tuples');
    return { tokenCount: tokens.data.length / 5 };
  });

  await feature(t, 'folding', async () => {
    const ranges = await client.request('textDocument/foldingRange', { textDocument: lexical });
    assert.ok(
      ranges.some((range) => range.startLine === 1),
      'The function body must be foldable',
    );
    return { count: ranges.length };
  });

  const passed = new Set(
    report.features.filter((entry) => entry.status === 'passed').map((entry) => entry.feature),
  );
  assert.deepEqual(
    inventory.declaredLanguageServices.filter((service) => !passed.has(service)),
    [],
    'Every declared language service must be verified over stdio',
  );
});
