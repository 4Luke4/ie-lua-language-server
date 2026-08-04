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

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ieLua.validateDocument', async () => {
      const uri = vscode.window.activeTextEditor?.document.uri.toString();
      await executeServerCommand('ieLua.validateDocument', uri ? [uri] : []);
    }),
    vscode.commands.registerCommand('ieLua.validateWorkspace', async () => {
      await executeServerCommand('ieLua.validateWorkspace', []);
    }),
    vscode.commands.registerCommand('ieLua.reloadApiData', async () => {
      await executeServerCommand('ieLua.reloadApiData', []);
      vscode.window.showInformationMessage('IE Lua API data reloaded.');
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
