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

Narrative text must not be copied.

.. _CGameSprite\\:\\:GroundItem:

CGameSprite::GroundItem
-----------------------

+------------+---------------------+----------------+-----------+
| **Offset** | **Size (Total: 8)** | **Type**       | **Field** |
+------------+---------------------+----------------+-----------+
| 0x0        | \`\`sizeof(TYPE)\`\`    | TYPE           | data      |
+------------+---------------------+----------------+-----------+
`;

void test('parses x64 structure layouts without narrative prose or padding', () => {
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
  assert.equal(
    symbols.some((symbol) => symbol.documentationMarkdown?.includes('Narrative')),
    false,
  );
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
