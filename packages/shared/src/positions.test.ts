import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocationMapper, createOffsetMapper, createPositionMapper } from './positions';

void test('indexed positions retain UTF-16 offsets, CRLF boundaries and EOF clamping', () => {
  const position = createPositionMapper('a😀\r\nb\n');
  const expected = [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 0],
    [1, 1],
    [2, 0],
  ];
  for (const [offset, [line, character]] of expected.entries()) {
    assert.deepEqual(position(offset), { line, character });
  }
  assert.deepEqual(position(-1), { line: 0, character: 0 });
  assert.deepEqual(position(100), { line: 2, character: 0 });
  assert.deepEqual(createPositionMapper('')(0), { line: 0, character: 0 });
  assert.deepEqual(createLocationMapper('a😀\r\nb\n')(5, 6), {
    offsetRange: { start: 5, end: 6 },
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
  });
});

void test('line and column pairs map back to the offsets the parser meant', () => {
  const text = 'a😀\r\nb\n';
  const offset = createOffsetMapper(text);
  const position = createPositionMapper(text);
  // Every in-range offset survives a round trip through both directions.
  for (let index = 0; index <= text.length; index += 1) {
    assert.equal(offset(position(index)), index);
  }
  assert.equal(offset({ line: 0, character: 0 }), 0);
  assert.equal(offset({ line: 1, character: 1 }), 6);
  // Out-of-range input clamps to the document rather than throwing or wrapping.
  assert.equal(offset({ line: -1, character: 2 }), 2);
  assert.equal(offset({ line: 9, character: 0 }), text.length);
  assert.equal(offset({ line: 1, character: 100 }), text.length);
  assert.equal(createOffsetMapper('')({ line: 0, character: 5 }), 0);
});
