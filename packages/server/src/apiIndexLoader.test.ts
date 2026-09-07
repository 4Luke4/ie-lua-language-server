import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { loadApiIndexFromManifest } from './apiIndexLoader';

const generatedAt = '2026-08-25T00:00:00.000Z';

function symbol(id: string) {
  return {
    id,
    name: id,
    kind: 'function',
    sourceSection: 'lua52',
    documentationState: 'documented',
    upstreamUrl: 'https://example.com',
    licenseStatus: 'allowed',
  };
}

function withFixture(run: (directory: string) => void): void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-lua-api-loader-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

void test('loads legacy schema-v2 single-file manifests', () => {
  withFixture((directory) => {
    fs.writeFileSync(
      path.join(directory, 'section.json'),
      JSON.stringify({
        schemaVersion: 2,
        generatedAt,
        source: { id: 'lua52' },
        symbols: [symbol('legacy')],
      }),
    );
    fs.writeFileSync(
      path.join(directory, 'index.json'),
      JSON.stringify({
        schemaVersion: 2,
        generatedAt,
        sources: [],
        sections: [{ id: 'lua52', title: 'Lua 5.2', file: 'section.json', symbolCount: 1 }],
      }),
    );

    assert.deepEqual(
      loadApiIndexFromManifest(path.join(directory, 'index.json')).symbols.map((entry) => entry.id),
      ['legacy'],
    );
  });
});

void test('loads every schema-v3 shard in manifest order', () => {
  withFixture((directory) => {
    for (const id of ['first', 'second']) {
      fs.writeFileSync(
        path.join(directory, `${id}.json`),
        JSON.stringify({
          schemaVersion: 3,
          generatedAt,
          source: { id: 'lua52' },
          symbols: [symbol(id)],
        }),
      );
    }
    fs.writeFileSync(
      path.join(directory, 'index.json'),
      JSON.stringify({
        schemaVersion: 3,
        generatedAt,
        sources: [],
        sections: [
          {
            id: 'lua52',
            title: 'Lua 5.2',
            files: [
              { title: 'First', file: 'first.json', symbolCount: 1 },
              { title: 'Second', file: 'second.json', symbolCount: 1 },
            ],
            symbolCount: 2,
          },
        ],
      }),
    );

    assert.deepEqual(
      loadApiIndexFromManifest(path.join(directory, 'index.json')).symbols.map((entry) => entry.id),
      ['first', 'second'],
    );
  });
});

void test('rejects shard paths outside the manifest directory', () => {
  withFixture((directory) => {
    fs.writeFileSync(
      path.join(directory, 'index.json'),
      JSON.stringify({
        schemaVersion: 3,
        generatedAt,
        sources: [],
        sections: [
          {
            id: 'lua52',
            title: 'Lua 5.2',
            files: [{ title: 'Escape', file: '../escape.json', symbolCount: 0 }],
            symbolCount: 0,
          },
        ],
      }),
    );

    assert.throws(
      () => loadApiIndexFromManifest(path.join(directory, 'index.json')),
      /escapes the manifest directory/u,
    );
  });
});

void test('accepts inline legacy indexes and rejects malformed consumed metadata', () => {
  withFixture((directory) => {
    const file = path.join(directory, 'index.json');
    const valid = { schemaVersion: 1, generatedAt, sources: [], symbols: [symbol('legacy')] };
    fs.writeFileSync(file, JSON.stringify(valid));
    assert.equal(loadApiIndexFromManifest(file).symbols[0]?.name, 'legacy');
    for (const invalid of [
      null, [], { ...valid, schemaVersion: 4 }, { ...valid, sources: [null] },
      { ...valid, symbols: {} }, { ...valid, symbols: [null] },
      ...[
        { name: null }, { kind: 'invalid' }, { sourceSection: 'invalid' },
        { parameters: [null] }, { parameters: [{ name: 'arg', type: 1 }] },
        { returns: [{ description: [] }] }, { callableAliases: [{ name: 'alias' }] },
        { documentationMarkdown: {} }, { byteSize: -1 },
      ].map((fields) => ({ ...valid, symbols: [{ ...symbol('bad'), ...fields }] })),
    ]) {
      fs.writeFileSync(file, JSON.stringify(invalid));
      assert.throws(() => loadApiIndexFromManifest(file));
    }
  });
});

void test('missing or malformed shards reject the whole candidate', () => {
  withFixture((directory) => {
    const file = path.join(directory, 'index.json');
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 3, generatedAt, sources: [], sections: [{
      id: 'lua52', files: [{ file: 'good.json' }, { file: 'bad.json' }],
    }] }));
    fs.writeFileSync(path.join(directory, 'good.json'), JSON.stringify({ schemaVersion: 3, generatedAt, symbols: [symbol('good')] }));
    assert.throws(() => loadApiIndexFromManifest(file));
    for (const content of ['{broken', JSON.stringify({ schemaVersion: 3, generatedAt, symbols: [null] })]) {
      fs.writeFileSync(path.join(directory, 'bad.json'), content);
      assert.throws(() => loadApiIndexFromManifest(file));
    }
  });
});
