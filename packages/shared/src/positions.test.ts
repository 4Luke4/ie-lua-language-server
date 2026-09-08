import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocationMapper, createPositionMapper } from './positions';

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
