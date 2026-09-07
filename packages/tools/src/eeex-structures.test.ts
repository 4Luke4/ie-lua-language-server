import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEeexStructureSymbols } from './eeex-structures';

const fixture = `.. _CGameObject:

CGameObject
------------

+------------+----------------------+---------------------------+---------------+
| **Offset** | **Size (Total: 24)** | **Type**                  | **Field**     |
+------------+----------------------+---------------------------+---------------+
| 0x0        | 8                    | qword                     | vfptr         |
+------------+----------------------+---------------------------+---------------+
|            | 4                    |                           | \`\`<padding>\`\` |
+------------+----------------------+---------------------------+---------------+
| 0x10       | 8                    | :ref:\`CPoint<CPoint>\` | m_pos         |
+------------+----------------------+---------------------------+---------------+

**Notes**

The object retains its original position.

.. _CGameSprite\\:\\:GroundItem:

CGameSprite::GroundItem
-----------------------

+------------+---------------------+----------------+-----------+
| **Offset** | **Size (Total: 8)** | **Type**       | **Field** |
+------------+---------------------+----------------+-----------+
| 0x0        | \`\`sizeof(TYPE)\`\`    | TYPE           | data      |
+------------+---------------------+----------------+-----------+
`;

void test('parses x64 layouts and retains narrative without inventing field prose', () => {
  const symbols = parseEeexStructureSymbols({
    commit: '0123456789abcdef0123456789abcdef01234567',
    indexPath: 'CG/index.rst',
    text: fixture,
  });

  const structure = symbols.find((symbol) => symbol.name === 'CGameObject');
  assert.equal(structure?.kind, 'structure');
  assert.equal(structure?.byteSize, 24);
  assert.equal(structure?.memberCount, 2);

  const field = symbols.find((symbol) => symbol.name === 'CGameObject.m_pos');
  assert.equal(field?.kind, 'field');
  assert.equal(field?.containerName, 'CGameObject');
  assert.equal(field?.instanceName, 'm_pos');
  assert.equal(field?.dataType, 'CPoint');
  assert.equal(field?.byteOffset, '0x10');
  assert.equal(field?.byteSize, 8);
  assert.equal(field?.documentationMarkdown, undefined);
  assert.match(field?.upstreamUrl ?? '', /#L\d+$/u);

  assert.equal(
    symbols.some((symbol) => symbol.name.includes('padding')),
    false,
  );
  assert.match(structure?.documentationMarkdown ?? '', /The object retains its original position/u);
  assert.equal(structure?.documentationState, 'documented');
  assert.equal(structure?.licenseStatus, 'allowed');
});

void test('normalizes escaped nested C++ structure names', () => {
  const symbols = parseEeexStructureSymbols({
    commit: '0123456789abcdef0123456789abcdef01234567',
    indexPath: 'CG/index.rst',
    text: fixture,
  });

  const field = symbols.find((symbol) => symbol.name === 'CGameSprite::GroundItem.data');
  assert.equal(field?.sizeExpression, 'sizeof(TYPE)');
});

void test('empty layouts retain introductory text and notes without parsing a phantom table', () => {
  const symbols = parseEeexStructureSymbols({
    commit: '0123456789abcdef0123456789abcdef01234567',
    indexPath: 'CL/index.rst',
    text: `.. _CLUAConsole:

CLUAConsole
^^^^^^^^^^^

See the console class.

+------------+---------------------+----------+-----------+
| **Offset** | **Size (Total: 0)** | **Type** | **Field** |
+------------+---------------------+----------+-----------+

**Notes**

No fields are exposed.

----
`,
  });
  assert.equal(symbols.length, 1);
  assert.equal(symbols[0]?.memberCount, 0);
  assert.match(symbols[0]?.documentationMarkdown ?? '', /See the console class/u);
  assert.match(symbols[0]?.documentationMarkdown ?? '', /No fields are exposed/u);
  assert.doesNotMatch(symbols[0]?.documentationMarkdown ?? '', /Offset/u);
});

void test('long trailing whitespace is handled without recursive regular expressions', () => {
  const symbols = parseEeexStructureSymbols({
    commit: '0123456789abcdef0123456789abcdef01234567',
    indexPath: 'CG/index.rst',
    text: fixture + '\n'.repeat(50000),
  });
  assert.equal(symbols.filter((symbol) => symbol.kind === 'structure').length, 2);
});
