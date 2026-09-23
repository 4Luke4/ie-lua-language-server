import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let outputChannel: vscode.LogOutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // vscode-languageclient 10 requires a log-capable channel for custom client output.
  outputChannel = vscode.window.createOutputChannel('IE Lua Language Server', { log: true });
  context.subscriptions.push(outputChannel);

  const serverModule = context.asAbsolutePath(path.join('dist', 'server', 'server.js'));
  const apiIndexPath = context.asAbsolutePath(path.join('resources', 'api', 'api-index.json'));
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        env: {
          ...process.env,
          IE_LUA_API_INDEX: apiIndexPath,
        },
      },
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
        env: {
          ...process.env,
          IE_LUA_API_INDEX: apiIndexPath,
        },
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'ie-lua' },
      { scheme: 'file', language: 'ie-menu' },
      { scheme: 'untitled', language: 'ie-lua' },
      { scheme: 'untitled', language: 'ie-menu' },
    ],
    synchronize: {
      configurationSection: 'ieLua',
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{lua,menu}'),
    },
    outputChannel,
    // Upstream documentation uses a few inline HTML tags with no Markdown equivalent: <br/> inside
    // table cells, <sup> for exponents, <u>, <pre>. With supportHtml off, VS Code strips them and
    // table cells run together. VS Code still sanitizes rendered HTML against its own allowlist, and
    // isTrusted stays unset, so documentation can never run command links.
    markdown: {
      supportHtml: true,
    },
    middleware: {
      // API symbols are defined in upstream documentation, so the server answers with the pinned
      // https source URL. Handing that to the editor as a document location fails, because there is
      // nothing to open as text. Open it the way Show API Source does and report no in-editor
      // location, so the command resolves instead of failing silently.
      provideDefinition: async (document, position, token, next) => {
        const result = await next(document, position, token);
        const external = externalDefinition(result);
        if (!external) return result;
        await vscode.env.openExternal(external);
        return undefined;
      },
    },
  };

  client = new LanguageClient(
    'ieLuaLanguageServer',
    'IE Lua Language Server',
    serverOptions,
    clientOptions,
  );

  registerCommands(context);
  await client.start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}

// A definition answer is either a Location, a Definition array, or LocationLink entries. Only a
// single http(s) target is treated as external; anything else is a real in-editor location and is
// left for the editor to handle normally.
function externalDefinition(result: vscode.ProviderResult<unknown>): vscode.Uri | undefined {
  const entries = Array.isArray(result) ? result : result ? [result] : [];
  if (entries.length !== 1) return undefined;
  const entry = entries[0] as { uri?: vscode.Uri; targetUri?: vscode.Uri };
  const uri = entry?.uri ?? entry?.targetUri;
  return uri && ['http', 'https'].includes(uri.scheme) ? uri : undefined;
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ieLua.validateDocument', async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (
        !document ||
        !['ie-lua', 'ie-menu'].includes(document.languageId) ||
        !['file', 'untitled'].includes(document.uri.scheme)
      ) {
        void vscode.window.showInformationMessage(
          'Open an IE Lua or IE Menu document to validate it.',
        );
        return;
      }
      await executeServerCommand('ieLua.validateDocument', [document.uri.toString()]);
    }),
    vscode.commands.registerCommand('ieLua.validateWorkspace', async () => {
      await executeServerCommand('ieLua.validateWorkspace', []);
    }),
    vscode.commands.registerCommand('ieLua.reloadApiData', async () => {
      try {
        const result = await executeServerCommand('ieLua.reloadApiData', []);
        if (result === null) void vscode.window.showInformationMessage('IE Lua API data reloaded.');
      } catch {
        void vscode.window.showErrorMessage(
          'API reload failed. Previous API data retained. See the IE Lua server log and retry Reload API Data.',
        );
      }
    }),
    vscode.commands.registerCommand('ieLua.showApiSource', async () => {
      const sources = await executeServerCommand<Array<{ title: string; url: string }>>(
        'ieLua.showApiSource',
        [],
      );
      if (!sources || sources.length === 0) {
        vscode.window.showInformationMessage('No API source metadata is currently loaded.');
        return;
      }
      const selected = await vscode.window.showQuickPick(
        sources.map((source) => ({
          label: source.title,
          description: source.url,
          source,
        })),
        { placeHolder: 'Select an API source' },
      );
      if (selected) {
        await vscode.env.openExternal(vscode.Uri.parse(selected.source.url));
      }
    }),
    vscode.commands.registerCommand('ieLua.openServerLog', () => {
      outputChannel?.show();
    }),
  );
}

async function executeServerCommand<T = unknown>(
  command: string,
  args: unknown[],
): Promise<T | undefined> {
  if (!client) {
    vscode.window.showWarningMessage('IE Lua language server is not running.');
    return undefined;
  }
  return client.sendRequest<T>('workspace/executeCommand', {
    command,
    arguments: args,
  });
}
