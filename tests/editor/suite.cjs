const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function eventually(operation, predicate) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (predicate(result)) return result;
    } catch (error) {
      // VS Code cancels in-flight requests while applying theme/accessibility settings.
      if (error?.name !== 'Canceled' && error?.name !== 'CancellationError') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for editor feature');
}
async function run() {
  const results = [];
  try {
    const extension = vscode.extensions.getExtension(
      'infinity-engine-tools.ie-lua-language-server',
    );
    assert.ok(extension, 'Installed extension exists');
    assert.ok(
      path
        .resolve(extension.extensionPath)
        .startsWith(path.resolve(process.env.IE_TEST_EXTENSIONS) + path.sep),
      'Must load installed VSIX, not checkout',
    );
    await extension.activate();
    assert.ok(extension.isActive);
    results.push('installed VSIX activation');
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'validateDocument',
      'validateWorkspace',
      'reloadApiData',
      'showApiSource',
      'openServerLog',
    ])
      assert.equal(commands.filter((c) => c === `ieLua.${command}`).length, 1);
    const doc = await vscode.workspace.openTextDocument({
      language: 'ie-lua',
      content:
        'Infinity_DisplayString(\nCGameObject\n---@type CGameSprite\nlocal sprite\nsprite.\n',
    });
    await vscode.window.showTextDocument(doc);
    const complete = await eventually(
      () =>
        vscode.commands.executeCommand(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          new vscode.Position(0, 0),
        ),
      (r) => r?.items.some((i) => i.label === 'Infinity_DisplayString'),
    );
    assert.ok(complete.items.length);
    const hover = await eventually(
      () =>
        vscode.commands.executeCommand(
          'vscode.executeHoverProvider',
          doc.uri,
          new vscode.Position(1, 4),
        ),
      (r) => r?.length,
    );
    assert.ok(hover.some((h) => h.contents.some((c) => (c.value ?? '').includes('m_objectType'))));
    const signature = await eventually(
      () =>
        vscode.commands.executeCommand(
          'vscode.executeSignatureHelpProvider',
          doc.uri,
          new vscode.Position(0, 23),
        ),
      (r) => r?.signatures.length,
    );
    assert.ok(signature.signatures[0].label.includes('Infinity_DisplayString'));
    await eventually(
      () =>
        vscode.commands.executeCommand(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          new vscode.Position(4, 7),
        ),
      (r) => r?.items.some((i) => i.label === 'm_active'),
    );
    results.push('completion, narrative hover, signatures, typed fields');
    for (const command of [
      'validateDocument',
      'validateWorkspace',
      'reloadApiData',
      'openServerLog',
    ])
      await vscode.commands.executeCommand(`ieLua.${command}`);
    // Opening and cancelling the native picker exercises forwarding without browsing externally.
    const picker = vscode.commands.executeCommand('ieLua.showApiSource');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    await picker;
    results.push('five commands');
    for (const theme of ['Default High Contrast', 'Default Dark Modern']) {
      await eventually(
        () =>
          vscode.workspace
            .getConfiguration('workbench')
            .update('colorTheme', theme, vscode.ConfigurationTarget.Global),
        () => true,
      );
      await eventually(
        () =>
          vscode.workspace
            .getConfiguration('editor')
            .update('accessibilitySupport', 'on', vscode.ConfigurationTarget.Global),
        () => true,
      );
      await eventually(
        () =>
          vscode.workspace
            .getConfiguration('workbench')
            .update('reduceMotion', 'on', vscode.ConfigurationTarget.Global),
        () => true,
      );
      await eventually(
        () =>
          vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            doc.uri,
            new vscode.Position(1, 4),
          ),
        (r) => r?.length,
      );
    }
    results.push('high contrast, accessibility support, reduced motion');
    const menu = await vscode.workspace.openTextDocument({
      language: 'ie-menu',
      content: 'menu { action `local invalid =` }',
    });
    await vscode.window.showTextDocument(menu);
    await vscode.commands.executeCommand('ieLua.validateDocument');
    await eventually(
      async () => vscode.languages.getDiagnostics(menu.uri),
      (r) => r.length > 0,
    );
    const formatted = await vscode.commands.executeCommand(
      'vscode.executeFormatDocumentProvider',
      menu.uri,
      { tabSize: 2, insertSpaces: true },
    );
    assert.equal(formatted.length, 0);
    results.push('embedded menu diagnostics and formatting boundary');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  } finally {
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync(
      'reports/editor.json',
      JSON.stringify(
        { vscode: vscode.version, platform: process.platform, arch: process.arch, passed: results },
        null,
        2,
      ),
    );
  }
}
module.exports = { run };
