const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');
const { connect } = require('./lsp-client.cjs');

const report = {
  schemaVersion: 1,
  commit: process.env.GITHUB_SHA,
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  osRelease: os.release(),
  operationTimeoutMs: 30000,
  status: 'running',
  measurements: [],
};
function measurement(name, times, details = {}) {
  assert.ok(
    times.length && times.every((time) => Number.isFinite(time) && time >= 0 && time < 30000),
  );
  const sorted = [...times].sort((a, b) => a - b);
  const middle = (sorted.length - 1) / 2;
  report.measurements.push({
    name,
    ...details,
    rawMs: times,
    medianMs: (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  });
}
async function timed(operation) {
  const start = performance.now();
  await operation();
  return performance.now() - start;
}
function fixture(lines, languageId) {
  const body = [
    'local value = 1',
    ...Array.from({ length: lines - 3 }, () => 'value = value + 1'),
    'print(value)',
  ];
  return languageId === 'ie-menu' ? '`' + body.join('\n') + '\n`' : body.join('\n') + '\n';
}
async function main() {
  const startups = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    let client;
    try {
      startups.push(
        await timed(async () => {
          client = await connect({ requestTimeout: 30000, quiet: true });
        }),
      );
      assert.ok(client.initialized.capabilities.completionProvider);
    } finally {
      await client?.close();
    }
  }
  measurement('startup', startups);
  const client = await connect({
    requestTimeout: 30000,
    quiet: true,
    settings: { validation: { mode: 'type', debounceMs: 1 } },
  });
  try {
    for (const languageId of ['ie-lua', 'ie-menu']) {
      for (const lines of [100, 1000, 10000]) {
        const text = fixture(lines, languageId);
        const uri = pathToFileURL(
          path.join(
            os.tmpdir(),
            `responsiveness-${lines}.${languageId === 'ie-menu' ? 'menu' : 'lua'}`,
          ),
        ).href;
        const textDocument = { uri };
        client.notify('textDocument/didOpen', {
          textDocument: { uri, languageId, version: 1, text },
        });
        const params = { textDocument, position: { line: 1, character: 2 } };
        const completion = async () => {
          const result = await client.request('textDocument/completion', params);
          assert.ok(result.some((entry) => entry.label === 'value'));
        };
        const hover = async () =>
          assert.ok((await client.request('textDocument/hover', params))?.contents);
        await completion();
        await hover();
        const completionTimes = [],
          hoverTimes = [],
          diagnosticTimes = [];
        for (let i = 0; i < 20; i++) {
          completionTimes.push(await timed(completion));
          hoverTimes.push(await timed(hover));
        }
        for (let version = 2; version <= 4; version++) {
          diagnosticTimes.push(
            await timed(async () => {
              const start = client.notifications.length;
              client.notify('textDocument/didChange', {
                textDocument: { uri, version },
                contentChanges: [{ text: text.replace('value = 1', `value = ${version}`) }],
              });
              const result = await client.waitFor(
                (m) =>
                  m.method === 'textDocument/publishDiagnostics' &&
                  m.params.uri === uri &&
                  m.params.version === version,
                start,
              );
              assert.deepEqual(result.params.diagnostics, []);
            }),
          );
        }
        const details = {
          languageId,
          lines: text.split('\n').length,
          bytes: Buffer.byteLength(text),
        };
        measurement('completion', completionTimes, details);
        measurement('hover', hoverTimes, details);
        measurement('edit-to-diagnostics', diagnosticTimes, details);
        client.notify('textDocument/didClose', { textDocument });
      }
    }
    const churn = [];
    for (let i = 0; i < 100; i++) {
      churn.push(
        await timed(async () => {
          const uri = pathToFileURL(path.join(os.tmpdir(), 'responsiveness-churn.lua')).href;
          client.notify('textDocument/didOpen', {
            textDocument: { uri, languageId: 'ie-lua', version: 1, text: 'local obsolete =' },
          });
          client.notify('textDocument/didChange', {
            textDocument: { uri, version: 2 },
            contentChanges: [{ text: 'local current = 1' }],
          });
          client.notify('textDocument/didClose', { textDocument: { uri } });
          assert.deepEqual(await client.request('workspace/symbol', { query: '' }), []);
        }),
      );
    }
    measurement('open-change-close', churn);
    assert.equal(report.measurements.length, 20);
  } finally {
    await client.close();
  }
  report.status = 'passed';
}
main()
  .catch((error) => {
    report.status = 'failed';
    report.error = error.message;
    process.exitCode = 1;
  })
  .finally(() => {
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync('reports/responsiveness.json', JSON.stringify(report, null, 2) + '\n');
  });
