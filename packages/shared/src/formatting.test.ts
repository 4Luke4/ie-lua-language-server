import assert from 'node:assert/strict';
import test from 'node:test';
import { trailingWhitespaceEdits } from './formatting';
import { maskLuaTrivia } from './bindings';

function formatted(text: string): string {
  for (const { start, end } of trailingWhitespaceEdits(text).reverse()) {
    text = text.slice(0, start) + text.slice(end);
  }
  return text;
}

void test('whitespace deletions preserve line endings, Unicode and final-newline state', () => {
  for (const eol of ['\n', '\r\n', '\r']) {
    for (const final of ['', eol]) {
      const before = `local value = "😀"  ${eol}print(value)\t${final}`;
      const after = `local value = "😀"${eol}print(value)${final}`;
      assert.equal(formatted(before), after);
      assert.deepEqual(trailingWhitespaceEdits(after), []);
    }
  }
  assert.equal(formatted('a()  \r\nb()\t\nc()  '), 'a()\r\nb()\nc()');
  assert.deepEqual(trailingWhitespaceEdits(''), []);
  assert.equal(formatted('  '), '');
});

void test('formatting protects strings, comments and incomplete constructs', () => {
  const protectedTexts = [
    '"unfinished  \nnext  ',
    "'unfinished  \nnext  ",
    '"escaped\\\n  next"',
    '"escaped\\\r\n  next"',
    '"skip\\z  \n  next"',
    '[[line  \nnext\t]]',
    '[==[line  \r\nnext\t]==]',
    '[=[unfinished  \nnext  ',
    '-- line comment  ',
    '--[[comment  \nnext  ]]',
    '--[==[unfinished  \nnext  ',
  ];
  for (const text of protectedTexts) {
    assert.equal(formatted(text), text, JSON.stringify(text));
    assert.deepEqual(trailingWhitespaceEdits(formatted(text)), []);
  }
  assert.equal(formatted('local s = [[value  \n]]  \nprint(s)  '), 'local s = [[value  \n]]\nprint(s)');
  assert.equal(formatted('-- comment  \rprint(1)  '), '-- comment  \rprint(1)');
  assert.equal(maskLuaTrivia('-- comment\rprint(1)'), '          \rprint(1)');
});
