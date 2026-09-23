import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import type { ApiSymbol } from '@ie-lua/shared';
import {
  AnchorRegistry,
  decodeHtml,
  htmlToMarkdown,
  makeLua52Symbols,
  makeLuaJitSymbols,
  parseRootToctreeCategories,
  readLocalTree,
  readUpstreamPins,
  resolveReferenceLinks,
  verifyLocalCommit,
} from './ingest-docs';

void test('root toctrees preserve upstream category order and spaces', () => {
  const categories = parseRootToctreeCategories(
    [
      '.. _Structures:',
      '',
      '.. toctree::',
      '   :maxdepth: 1',
      '',
      '   C2/index',
      '   UI/index',
      '   File Formats/index',
      '',
      '.. note:: Done.',
    ].join('\n'),
    'ee-game-structures-x64',
  );

  assert.deepEqual(categories, ['C2', 'UI', 'File Formats']);
});

void test('root toctrees reject duplicate and nested category paths', () => {
  assert.throws(
    () =>
      parseRootToctreeCategories(
        ['.. toctree::', '', '   Action/index', '   Action/index'].join('\n'),
        'eeex-functions',
      ),
    /repeats category: Action/u,
  );
  assert.throws(
    () =>
      parseRootToctreeCategories(
        ['.. toctree::', '', '   nested/Action/index'].join('\n'),
        'eeex-functions',
      ),
    /unsupported toctree entry/u,
  );
});

void test('upstream pins are read from the tracked pin file and validated', () => {
  const pins = readUpstreamPins();
  assert.match(pins.lua52.url, /^https:\/\/www\.lua\.org\/ftp\/lua-5\.2\.\d+\.tar\.gz$/u);
  assert.match(pins.lua52.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(pins.luajit.repository, 'LuaJIT/LuaJIT');
  assert.match(pins.luajit.commit, /^[0-9a-f]{40}$/u);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-lua-pins-'));
  const file = path.join(directory, 'pins.json');
  fs.writeFileSync(file, JSON.stringify({ ...pins, lua52: { ...pins.lua52, sha256: 'short' } }));
  assert.throws(() => readUpstreamPins(file), /malformed upstream pins/u);
});

void test('local checkouts list like the Git tree API and must sit at the pinned commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-lua-tree-'));
  const commit = 'a'.repeat(40);
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), `${commit}\n`);
  fs.mkdirSync(path.join(root, 'source', 'EEex Functions', 'Action'), { recursive: true });
  fs.writeFileSync(path.join(root, 'source', 'EEex Functions', 'index.rst'), '');
  fs.writeFileSync(path.join(root, 'source', 'EEex Functions', 'Action', 'index.rst'), '');

  assert.deepEqual(readLocalTree(root).tree, [
    { path: 'source', type: 'tree' },
    { path: 'source/EEex Functions', type: 'tree' },
    { path: 'source/EEex Functions/Action', type: 'tree' },
    { path: 'source/EEex Functions/Action/index.rst', type: 'blob' },
    { path: 'source/EEex Functions/index.rst', type: 'blob' },
  ]);
  verifyLocalCommit(root, commit);
  assert.throws(() => verifyLocalCommit(root, 'b'.repeat(40)), /expected the pinned commit/u);
  assert.throws(() => verifyLocalCommit(path.join(root, 'source'), commit), /<missing>/u);

  // A junction is a directory link that Windows runners can create without privileges; POSIX
  // ignores the type and creates an ordinary symbolic link.
  fs.symlinkSync(path.join(root, 'source'), path.join(root, 'linked'), 'junction');
  assert.throws(() => readLocalTree(root), /symbolic links are not read/u);
});

void test(':ref: links resolve to the one pinned line that defines them, or become plain text', () => {
  const anchors = new AnchorRegistry();
  anchors.record('source/EE Game Lua Functions/C/C_AddSpell.rst', '.. _C_AddSpell:\n\nC\\:AddSpell');
  anchors.record('source/A/index.rst', 'Intro\n\n.. _Twice:\n');
  anchors.record('source/B/index.rst', '.. _twice:\n');
  anchors.record('source/C/index.rst', '.. _CAOEEntry\\:\\:AOEType:\n');
  assert.equal(anchors.resolve('CAOEEntry::AOEType')?.sourcePath, 'source/C/index.rst');
  const url = (label: string): string | undefined => {
    const target = anchors.resolve(label);
    return target ? `https://example.com/${target.sourcePath}#L${target.line}` : undefined;
  };
  const symbol: ApiSymbol = {
    id: 'ee-game-lua-functions:C:AddGold',
    name: 'C:AddGold',
    kind: 'method',
    sourceSection: 'ee-game-lua-functions',
    parameters: [{ name: 'Gold', description: 'see [C:AddSpell](#c_addspell)' }],
    returns: [{ description: 'like [Twice](#Twice)' }],
    documentationMarkdown: [
      '[C:AddSpell](#C_AddSpell), [Missing](#Nowhere)',
      '',
      '```lua',
      'local t = x[1](#y)',
      '```',
    ].join('\n'),
    documentationState: 'documented',
    upstreamUrl: 'https://example.com/C_AddGold.rst#L11',
    licenseStatus: 'allowed',
  };

  const unresolved = resolveReferenceLinks([symbol], url);
  const target = 'https://example.com/source/EE Game Lua Functions/C/C_AddSpell.rst#L1';
  assert.equal(
    symbol.documentationMarkdown,
    [`[C:AddSpell](${target}), Missing`, '', '```lua', 'local t = x[1](#y)', '```'].join('\n'),
  );
  // Sphinx labels are case-insensitive, and a label defined twice is ambiguous rather than guessed.
  assert.equal(symbol.parameters?.[0]?.description, `see [C:AddSpell](${target})`);
  assert.equal(symbol.returns?.[0]?.description, 'like Twice');
  assert.deepEqual([...unresolved].sort(), ['Nowhere', 'Twice']);
});

void test('HTML documentation keeps published characters, emphasis, superscripts and links', () => {
  const base = 'https://www.lua.org/manual/5.2/manual.html';
  assert.equal(
    htmlToMarkdown(
      [
        '<p>',
        'Returns <code>m</code> and <code>e</code> such that <em>x = m2<sup>e</sup></em>,',
        'as the ISO&nbsp;C function <a href="#pdf-frexp"><code>frexp</code></a> does',
        '(see &sect;<a href="#6.4">6.4</a>) &ndash; &lsquo;quoted&rsquo; &middot;&middot;&middot;',
      ].join('\n'),
      base,
    ),
    [
      'Returns `m` and `e` such that *x = m2<sup>e</sup>*, as the ISO\u00A0C function',
      `[\`frexp\`](${base}#pdf-frexp) does (see §[6.4](${base}#6.4)) – ‘quoted’ ···`,
    ].join(' '),
  );
  assert.throws(() => htmlToMarkdown('<p>&unknown;', base), /Unsupported HTML entity &unknown;/u);
  assert.equal(decodeHtml('&le; &pi; &#x41; &#66;'), '≤ π A B');
});

void test('HTML tables, lists, breaks and LuaJIT link chrome convert to their Markdown forms', () => {
  const page = 'https://luajit.org/ext_ffi_api.html';
  assert.equal(
    htmlToMarkdown(
      [
        '<p>The following parameters are defined:</p>',
        '<table class="abitable">',
        '<tr class="abihead"><td class="abiparam">Parameter</td><td>Description</td></tr>',
        '<tr><td>32bit</td><td>32 bit <tt>a|b</tt> architecture</td></tr>',
        '</table>',
        '<ul>',
        '<li>See <a href="ext_ffi_semantics.html#convert">conversion rules</a>.</li>',
        '<li>Also <a href="https://www.lua.org/manual/5.1/manual.html#5"><span class="ext">&raquo;</span>&nbsp;standard Lua</a>.</li>',
        '</ul>',
        '<p>First line<br>second line</p>',
      ].join('\n'),
      page,
    ),
    [
      'The following parameters are defined:',
      '',
      '| Parameter | Description |',
      '| --- | --- |',
      '| 32bit | 32 bit `a\\|b` architecture |',
      '',
      '- See [conversion rules](https://luajit.org/ext_ffi_semantics.html#convert).',
      '- Also [standard Lua](https://www.lua.org/manual/5.1/manual.html#5).',
      '',
      'First line<br/>second line',
    ].join('\n'),
  );
});

void test('Lua 5.2 symbols render the manual text, including the keyword introduction', () => {
  const section = (number: string, title: string, body: string): string =>
    `<h2>${number} &ndash; <a name="${number}">${title}</a></h2>\n${body}\n`;
  const manual = [
    section(
      '3.1',
      'Lexical Conventions',
      '<p>\nThe following <em>keywords</em> are reserved\nand cannot be used as names:\n\n\n<pre>\n     and       break\n</pre>',
    ),
    section(
      '6.1',
      'Basic Functions',
      '<p>\nBasics.\n<hr><h3><a name="pdf-pcall"><code>pcall (f [, arg1, &middot;&middot;&middot;])</code></a></h3>\n<p>\nCalls function <code>f</code> in <em>protected mode</em>.',
    ),
    section('6.4', 'String Manipulation', '<p>\nThis library provides strings.'),
    section('6.5', 'Table Manipulation', '<p>\nThis library provides tables.'),
    section('6.6', 'Mathematical Functions', '<p>\nThis library provides math.'),
    section('6.7', 'Bitwise Operations', '<p>\nThis library provides bits.'),
    section('6.10', 'The Debug Library', '<p>\nThis library provides debugging.'),
  ].join('');

  const symbols = makeLua52Symbols(manual);
  const byId = (id: string): ApiSymbol | undefined => symbols.find((symbol) => symbol.id === id);
  assert.equal(
    byId('lua52:keyword:and')?.documentationMarkdown,
    'The following *keywords* are reserved and cannot be used as names:\n\n```lua\nand       break\n```',
  );
  assert.equal(byId('lua52:pcall')?.signature, 'pcall (f [, arg1, ···])');
  assert.equal(byId('lua52:pcall')?.documentationMarkdown, 'Calls function `f` in *protected mode*.');
  assert.equal(
    byId('lua52:pcall')?.upstreamUrl,
    'https://www.lua.org/manual/5.2/manual.html#pdf-pcall',
  );
  assert.equal(byId('lua52:string')?.documentationMarkdown, 'This library provides strings.');
});

void test('LuaJIT headings keep alternative call forms and link to their own entry', () => {
  const url = 'https://luajit.org/ext_ffi_api.html';
  const [symbol] = makeLuaJitSymbols([
    {
      url,
      html: [
        '<h3 id="ffi_new"><tt>cdata = ffi.new(ct [,nelem] [,init...])<br>',
        'cdata = <em>ctype</em>([nelem,] [init...])</tt></h3>',
        '<p>Creates a cdata object for the given <tt>ct</tt>.</p>',
      ].join('\n'),
    },
  ]);
  assert.equal(symbol?.name, 'ffi.new');
  assert.equal(
    symbol?.signature,
    'cdata = ffi.new(ct [,nelem] [,init...])\ncdata = ctype([nelem,] [init...])',
  );
  assert.equal(symbol?.upstreamUrl, `${url}#ffi_new`);
  assert.equal(symbol?.documentationMarkdown, 'Creates a cdata object for the given `ct`.');
  assert.throws(
    () => makeLuaJitSymbols([{ url, html: '<h3><tt>ffi.sizeof(ct)</tt></h3><p>Size.</p>' }]),
    /has no id to link to/u,
  );
});
