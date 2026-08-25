import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRootToctreeCategories } from './ingest-docs';

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
