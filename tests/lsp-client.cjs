const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function connect(options = {}) {
  const child = spawn(
    process.execPath,
    [options.server ?? path.resolve('dist/server/server.js'), '--stdio'],
    {
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        IE_LUA_API_INDEX: options.index ?? path.resolve('resources/api/api-index.json'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let buffer = Buffer.alloc(0),
    id = 0,
    stderr = '';
  console.log(`LSP process started: ${child.pid}`);
  const pending = new Map(),
    notifications = [];
  let settings = options.settings ?? {};
  const send = (message) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  };
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  child.on('error', (error) => {
    for (const entry of pending.values()) entry.reject(error);
  });
  child.on('exit', (code) => {
    for (const entry of pending.values())
      entry.reject(new Error(`Server exited ${code}: ${stderr}`));
  });
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const length = Number(
        buffer
          .subarray(0, end)
          .toString()
          .match(/Content-Length: (\d+)/iu)?.[1],
      );
      if (!Number.isSafeInteger(length)) throw new Error('Non-protocol output on stdout');
      if (buffer.length < end + 4 + length) return;
      const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString());
      buffer = buffer.subarray(end + 4 + length);
      if (message.method && message.id !== undefined) {
        const result =
          message.method === 'workspace/configuration'
            ? message.params.items.map(() => settings)
            : null;
        send({ id: message.id, result });
      } else if (message.id !== undefined) {
        const entry = pending.get(message.id);
        if (entry) {
          console.log(`LSP response ${message.id}`);
          clearTimeout(entry.timer);
          pending.delete(message.id);
          if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
          else entry.resolve(message.result);
        }
      } else notifications.push(message);
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      console.log(`LSP request ${requestId}: ${method}`);
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Timed out: ${method}\n${stderr}`));
      }, 10000);
      pending.set(requestId, { resolve, reject, timer });
      send({ id: requestId, method, params });
    });
  const notify = (method, params) => send({ method, params });
  const waitFor = async (predicate, start = 0) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const message = notifications.slice(start).find(predicate);
      if (message) return message;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Expected notification not received: ${stderr}`);
  };
  const close = async () => {
    try {
      if (child.exitCode === null) {
        await request('shutdown', null);
        notify('exit');
      }
      await Promise.race([
        new Promise((resolve) => {
          if (child.exitCode !== null) resolve();
          else child.once('exit', resolve);
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      assert.equal(child.exitCode, 0, 'LSP server must stop cleanly');
    } finally {
      child.kill();
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Connection closed'));
      }
      fs.mkdirSync('reports', { recursive: true });
      fs.appendFileSync('reports/lsp-stderr.log', stderr);
    }
  };
  const initialized = await request('initialize', {
    processId: process.pid,
    rootUri: null,
    capabilities: { workspace: { configuration: true } },
    initializationOptions: options.initializationOptions,
  }).catch((error) => { child.kill(); throw error; });
  notify('initialized', {});
  return {
    request,
    notify,
    waitFor,
    close,
    initialized,
    notifications,
    setSettings: async (value) => {
      settings = value;
      notify('workspace/didChangeConfiguration', { settings: { ieLua: value } });
      await request('workspace/symbol', { query: '' });
    },
  };
}
module.exports = { connect };
