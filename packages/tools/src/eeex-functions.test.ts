import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseEeexFunctionSymbols,
  parseGameFunctionSymbol,
  parseGameIndexDescriptions,
  renderRstMarkdown,
} from './eeex-functions';

const commit = 'b4d0acd776f5d3b8337afbd038d6128efce51cfd';

void test('game pages derive canonical colon names, metadata, and formatted documentation', () => {
  const sourcePath = 'source/EE Game Lua Functions/C/C_AddGold.rst';
  const symbol = parseGameFunctionSymbol({
    commit,
    sourcePath,
    text: [
      '.. _C_AddGold:',
      '',
      '===========',
      'C\\:AddGold',
      '===========',
      '',
      'Adds *gold* to the party.',
      '',
      '::',
      '',
      '   C:AddGold(Gold)',
      '',
      '**Parameters**',
      '',
      '* ``string`` *Gold* - numeric amount',
      '',
      '**Returns**',
      '',
      'None',
      '',
      '**Notes**',
      '',
      '.. note:: Keep the value positive.',
      '',
      '**Example**',
      '',
      '::',
      '',
      '   C:AddGold("1000")',
      '',
      '**See Also**',
      '',
      ':ref:`C\\:AddSpell<C_AddSpell>`',
    ].join('\n'),
  });

  assert.equal(symbol.name, 'C:AddGold');
  assert.equal(symbol.containerName, 'C');
  assert.equal(symbol.instanceName, 'AddGold');
  assert.deepEqual(symbol.parameters, [
    { name: 'Gold', type: 'string', description: 'numeric amount' },
  ]);
  assert.match(symbol.documentationMarkdown ?? '', /Adds \*gold\* to the party\./u);
  assert.match(symbol.documentationMarkdown ?? '', /> \*\*Note\*\*/u);
  assert.match(symbol.documentationMarkdown ?? '', /```lua\nC:AddGold\("1000"\)\n```/u);
  assert.match(symbol.documentationMarkdown ?? '', /\[C:AddSpell\]\(#C_AddSpell\)/u);
  assert.match(symbol.upstreamUrl, /#L11$/u);
});

void test('game index descriptions fill placeholders without inventing empty descriptions', () => {
  const indexText = [
    '+----------------------+-------------------+',
    '| **Function**         | **Description**   |',
    '+======================+===================+',
    '| :ref:`C\\:Foo<C_Foo>` | Index wording.    |',
    '+----------------------+-------------------+',
    '| :ref:`C\\:Bar<C_Bar>` |                   |',
    '+----------------------+-------------------+',
  ].join('\n');
  const descriptions = parseGameIndexDescriptions(indexText, 'index.rst');
  assert.equal(descriptions.get('C_Foo'), 'Index wording.');
  assert.equal(descriptions.get('C_Bar'), '');

  const makePlaceholder = (anchor: string, signature: string, indexDescription?: string) =>
    parseGameFunctionSymbol({
      commit,
      sourcePath: `source/EE Game Lua Functions/C/${anchor}.rst`,
      text: `.. _${anchor}:\n\n================\n${signature.replace(':', '\\:')}\n================\n\n.. description\n\n::\n\n   ${signature}()\n`,
      ...(indexDescription !== undefined ? { indexDescription } : {}),
    });
  assert.match(
    makePlaceholder('C_Foo', 'C:Foo', descriptions.get('C_Foo')).documentationMarkdown ?? '',
    /Index wording\./u,
  );
  assert.equal(makePlaceholder('C_Bar', 'C:Bar').documentationState, 'undocumented');
});

void test('EEex indexes retain colon methods and parse defaults, returns, warnings, and aliases', () => {
  const text = [
    '.. _EEex_Test_Run:',
    '',
    'EEex_Test_Run',
    '^^^^^^^^^^^^^',
    '',
    '**Instance Name:** ``run``',
    '',
    '.. admonition:: Summary',
    '',
    '   Runs ``value``. :raw-html:`<br/>` Then returns it.',
    '',
    '**Parameters:**',
    '',
    '+----------+----------+-------------------+------------------+',
    '| **Name** | **Type** | **Default Value** | **Description**  |',
    '+==========+==========+===================+==================+',
    '| self     | CThing   |                   | Receiver.        |',
    '+----------+----------+-------------------+------------------+',
    '| value    | integer  | ``1``             | Value to return. |',
    '+----------+----------+-------------------+------------------+',
    '',
    '**Return Values:**',
    '',
    '+----------+-----------------+',
    '| **Type** | **Description** |',
    '+==========+=================+',
    '| integer  | See summary.    |',
    '+----------+-----------------+',
    '',
    '.. code-block:: lua',
    '',
    '   thing:run(2)',
    '',
    '.. _EEex_Test_Object:get():',
    '',
    'EEex_Test_Object:get()',
    '^^^^^^^^^^^^^^^^^^^^^^',
    '',
    '.. warning::',
    '   This function is currently undocumented.',
  ].join('\n');
  const symbols = parseEeexFunctionSymbols({
    commit,
    sourcePath: 'source/EEex Functions/Test/index.rst',
    text,
  });
  assert.deepEqual(
    symbols.map((symbol) => symbol.name),
    ['EEex_Test_Run', 'EEex_Test_Object:get'],
  );
  assert.equal(symbols[0]?.parameters?.[1]?.defaultValue, '1');
  assert.equal(symbols[0]?.returns?.[0]?.type, 'integer');
  assert.deepEqual(symbols[0]?.callableAliases, [
    { name: 'run', receiverType: 'CThing', consumesFirstParameter: true },
  ]);
  assert.match(symbols[0]?.documentationMarkdown ?? '', /> \*\*Summary\*\*/u);
  assert.match(symbols[0]?.documentationMarkdown ?? '', /<br\/>/u);
  assert.match(symbols[0]?.documentationMarkdown ?? '', /```lua\nthing:run\(2\)\n```/u);
  assert.equal(symbols[1]?.documentationState, 'undocumented');
  assert.match(
    symbols[1]?.documentationMarkdown ?? '',
    /This function is currently undocumented\./u,
  );
});

void test('RST tables, paragraph boundaries, emphasis, and substitutions survive conversion', () => {
  const markdown = renderRstMarkdown(
    [
      'First *paragraph*.',
      '',
      'Second :bold-italic:`paragraph` |rarr| value.',
      '',
      ':raw-html:`<pre>` CThing :raw-html:`<br>` \\COther :raw-html:`</pre>`',
      ':ref:``',
      '',
      '+-------+----------------+',
      '| Key   | Description    |',
      '+=======+================+',
      '| value | ``a|b``        |',
      '+-------+----------------+',
      '| slash | ``a\\\\|b``       |',
      '+-------+----------------+',
    ].join('\n'),
  );
  assert.match(markdown, /First \*paragraph\*\.\n\nSecond \*\*\*paragraph\*\*\* → value\./u);
  assert.match(markdown, /<pre> CThing <br\/> COther <\/pre>/u);
  assert.doesNotMatch(markdown, /:ref:/u);
  assert.match(markdown, /\| value \| `a\\\|b` \|/u);
  assert.ok(markdown.includes(`| slash | \`a${'\\'.repeat(3)}|b\` |`));
});

void test('unsupported non-empty directives fail ingestion', () => {
  assert.throws(() => renderRstMarkdown('.. imaginary:: value'), /unsupported RST directive/u);
});
