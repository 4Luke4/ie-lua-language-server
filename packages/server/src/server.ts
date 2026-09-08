import * as path from 'node:path';
import {
  CompletionItemKind,
  ResponseError,
  ShowMessageNotification,
  MessageType,
  LSPErrorCodes,
  createConnection,
  DiagnosticSeverity,
  FoldingRangeKind,
  Location,
  ProposedFeatures,
  Range,
  SemanticTokensBuilder,
  SymbolKind,
  TextDocumentSyncKind,
  TextDocuments,
  TextEdit,
} from 'vscode-languageserver/node';
import type {
  CompletionItem,
  DocumentSymbol,
  ExecuteCommandParams,
  InitializeParams,
  InitializeResult,
  RenameParams,
  SemanticTokensLegend,
  SymbolInformation,
  WorkspaceEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as luaparse from 'luaparse';
import { loadApiIndexFromManifest } from './apiIndexLoader';
import {
  analyzeDocument,
  trailingWhitespaceEdits,
  visibleSymbols,
  referenceAt,
  renameLocations,
  luaKeywords,
  DebouncedValidationScheduler,
  emptyApiIndex,
  filterApiSymbols,
  filterGlobalApiSymbols,
  findApiStructureMembers,
  findApiSymbolForExpression,
  makeApiCallableView,
  makeDocumentation,
  mergeSettings,
  normalizeSettings,
  shouldValidate,
  type AnalyzedDocument,
  type ApiIndex,
  type ApiSymbol,
  type IeLuaSettings,
  type LuaDiagnostic,
  type SettingsInput,
  type SourceLocation,
  type SymbolInfo,
} from '@ie-lua/shared';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
// Versions can repeat after reopening a URI; session identity and generation must also match.
interface AnalysisState {
  document: TextDocument;
  session: symbol | undefined;
  generation: number;
  settings?: IeLuaSettings;
  result: Promise<AnalyzedDocument>;
}
const analyses = new Map<string, AnalysisState>();
const sessions = new Map<string, symbol>();
const snapshots = new WeakMap<TextDocument, { session: symbol | undefined; generation: number }>();
const settingsCache = new Map<string, Promise<IeLuaSettings>>();
let generation = 0;
let stopped = false;
const scheduler = new DebouncedValidationScheduler();

let hasConfigurationCapability = false;
let initializationSettings: SettingsInput | undefined;
const startupApi = loadApiIndex();
let apiIndex: ApiIndex = startupApi.index ?? emptyApiIndex;
connection.onInitialized(() => {
  reportApiLoad(startupApi);
  if (!startupApi.index) {
    background(
      connection.sendNotification(ShowMessageNotification.type, {
        type: MessageType.Warning,
        message:
          'IE Lua API data is unavailable. Language editing remains available; see the server log and retry Reload API Data.',
      }),
    );
  }
});

const semanticLegend: SemanticTokensLegend = {
  tokenTypes: ['namespace', 'function', 'method', 'parameter', 'variable', 'property'],
  tokenModifiers: ['declaration', 'readonly', 'deprecated'],
};

connection.onInitialize((params: InitializeParams): InitializeResult => {
  hasConfigurationCapability = Boolean(params.capabilities.workspace?.configuration);
  initializationSettings = readInitializationSettings(params.initializationOptions);

  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Incremental,
        save: {
          includeText: false,
        },
      },
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', ':'],
      },
      hoverProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ['(', ','],
      },
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: {
        prepareProvider: false,
      },
      documentFormattingProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      foldingRangeProvider: true,
      semanticTokensProvider: {
        legend: semanticLegend,
        full: true,
      },
      // The VS Code client owns these command IDs and forwards them explicitly.
      // Advertising them here makes vscode-languageclient register duplicates.
    },
  };
});

connection.onDidChangeConfiguration(() => {
  invalidateAnalyses();
  background(refreshAfterConfigurationChange());
});

connection.onShutdown(() => {
  stopped = true;
  invalidateAnalyses();
  sessions.clear();
});

documents.onDidOpen((event) => {
  sessions.set(event.document.uri, Symbol(event.document.uri));
});

documents.onDidChangeContent((event) => {
  scheduler.cancel(event.document.uri);
  analyses.delete(event.document.uri);
  background(onDocumentChanged(snapshot(event.document)));
});

documents.onDidSave((event) => {
  background(maybeValidate(snapshot(event.document), 'save'));
});

documents.onDidClose((event) => {
  scheduler.cancel(event.document.uri);
  sessions.delete(event.document.uri);
  settingsCache.delete(event.document.uri);
  analyses.delete(event.document.uri);
  background(connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }));
});

connection.onCompletion(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document) return [];
  const settings = await getDocumentSettings(document);
  const memberReceiver = document ? getMemberReceiverAt(document, params.position) : undefined;
  const apiSymbols =
    document && memberReceiver
      ? findApiStructureMembers(
          apiIndex,
          settings,
          memberReceiver,
          document.getText(),
          document.offsetAt(params.position),
        )
      : filterGlobalApiSymbols(apiIndex, settings);
  const analysis = document && !memberReceiver ? await getOrAnalyze(document) : undefined;
  const workspaceNames = new Set(
    analysis
      ? visibleSymbols(analysis, document!.offsetAt(params.position)).map((symbol) => symbol.name)
      : [],
  );

  const completionSymbols = apiSymbols.flatMap((symbol) => {
    const primary = { symbol, label: completionLabel(symbol, memberReceiver) };
    if (memberReceiver) return [primary];
    return [
      primary,
      ...(symbol.callableAliases ?? [])
        .filter((alias) => !alias.receiverType)
        .map((alias) => ({ symbol, label: alias.name })),
    ];
  });

  return [
    ...completionSymbols
      .filter(({ label }) => !workspaceNames.has(label))
      .map(({ symbol, label }): CompletionItem => {
        const item: CompletionItem = {
          label,
          kind: toCompletionKind(symbol.kind),
          documentation: toMarkdownDocumentation(symbol),
          data: {
            apiSymbolId: symbol.id,
          },
        };
        const callableView = makeApiCallableView(symbol, label);
        if (callableView) {
          item.detail = callableView.signature;
        } else if (symbol.signature) {
          item.detail = symbol.signature;
        }
        return item;
      }),
    ...[...workspaceNames].map((name) => ({
      label: name,
      kind: CompletionItemKind.Variable,
      data: {
        workspaceSymbol: true,
      },
    })),
  ];
});

connection.onCompletionResolve((item) => item);

connection.onHover(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const name = getWordAt(document, params.position);
  if (!name) {
    return null;
  }

  const analysis = await getOrAnalyze(document);
  const local = referenceAt(analysis, document.offsetAt(params.position))?.resolvedDeclaration;
  if (local && local.name === name)
    return { contents: { kind: 'markdown', value: `\`${local.kind} ${local.name}\`` } };

  const settings = await getDocumentSettings(document);
  const apiSymbol = findApiSymbolForExpression(
    apiIndex,
    settings,
    name,
    document.getText(),
    document.offsetAt(params.position),
  );
  if (apiSymbol) {
    return {
      contents: {
        kind: 'markdown',
        value: makeDocumentation(apiSymbol),
      },
    };
  }

  const symbol = visibleSymbols(analysis, document.offsetAt(params.position)).find(
    (candidate) => candidate.name === name,
  );
  if (!symbol) {
    return null;
  }

  return {
    contents: {
      kind: 'markdown',
      value: `\`${symbol.kind} ${symbol.name}\``,
    },
  };
});

connection.onSignatureHelp(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const beforeCursor = text.slice(0, offset);
  const match = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_:.]*)\s*\([^()]*$/u);
  const name = match?.[1];
  if (!name) {
    return null;
  }

  const settings = await getDocumentSettings(document);
  const apiSymbol = findApiSymbolForExpression(apiIndex, settings, name, text, offset);
  const callableView = apiSymbol ? makeApiCallableView(apiSymbol, name) : undefined;
  if (!apiSymbol || !callableView) {
    return null;
  }

  const signature = {
    label: callableView.signature,
    documentation: {
      kind: 'markdown' as const,
      value: makeDocumentation(apiSymbol),
    },
  };
  const parameters = callableView.parameters.map((parameter) => ({
    label: parameter.name,
    ...(parameter.description
      ? {
          // Parameter descriptions contain upstream Markdown such as code spans and links.
          documentation: { kind: 'markdown' as const, value: parameter.description },
        }
      : {}),
  }));
  if (parameters && parameters.length > 0) {
    Object.assign(signature, { parameters });
  }

  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter: Math.max(0, (match[0].match(/,/g) ?? []).length),
  };
});

connection.onDefinition(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document) {
    return null;
  }
  const name = getWordAt(document, params.position);
  if (!name) {
    return null;
  }

  const analysis = await getOrAnalyze(document);
  const symbol = referenceAt(analysis, document.offsetAt(params.position))?.resolvedDeclaration;
  if (symbol) {
    return Location.create(document.uri, toLspRange(symbol.location));
  }

  const settings = await getDocumentSettings(document);
  const apiSymbol = findApiSymbolForExpression(
    apiIndex,
    settings,
    name,
    document.getText(),
    document.offsetAt(params.position),
  );
  if (!apiSymbol) {
    return null;
  }

  return Location.create(apiSymbol.upstreamUrl, Range.create(0, 0, 0, 0));
});

connection.onReferences(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const name = getWordAt(document, params.position);
  if (!name) {
    return [];
  }

  const analysis = await getOrAnalyze(document);
  const selected = referenceAt(analysis, document.offsetAt(params.position));
  if (!selected) return [];
  return analysis.references
    .filter((reference) =>
      selected.resolvedDeclaration
        ? selected.resolvedDeclaration.bindingId
          ? reference.resolvedDeclaration?.bindingId === selected.resolvedDeclaration.bindingId
          : reference.resolvedDeclaration === selected.resolvedDeclaration
        : !reference.resolvedDeclaration && reference.name === selected.name,
    )
    .filter((reference) => params.context.includeDeclaration || !reference.isDeclaration)
    .map((reference) => Location.create(document.uri, toLspRange(reference.location)));
});

connection.onRenameRequest(async (params: RenameParams): Promise<WorkspaceEdit | null> => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document || !isValidIdentifier(params.newName)) {
    return null;
  }

  const analysis = await getOrAnalyze(document);
  const locations = renameLocations(analysis, document.offsetAt(params.position), params.newName);
  if (!locations) return null;
  return {
    changes: {
      [document.uri]: locations.map((location) =>
        TextEdit.replace(toLspRange(location), params.newName),
      ),
    },
  };
});

connection.onDocumentSymbol(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const analysis = await getOrAnalyze(document);
  return analysis.symbols.map((symbol) => toDocumentSymbol(symbol));
});

connection.onWorkspaceSymbol(async (params) => {
  const query = params.query.toLowerCase();
  const symbols: SymbolInformation[] = [];
  const states = documents.all().map((document) => analysisState(snapshot(document)));
  const results = await Promise.allSettled(states.map((state) => state.result));
  for (const [index, state] of states.entries()) {
    const result = results[index]!;
    if (!isCurrent(state)) continue;
    if (result.status === 'rejected') throw result.reason;
    for (const symbol of result.value.symbols) {
      if (!query || symbol.name.toLowerCase().includes(query)) {
        symbols.push({
          name: symbol.name,
          kind: toSymbolKind(symbol.kind),
          location: Location.create(state.document.uri, toLspRange(symbol.location)),
        });
      }
    }
  }
  return symbols;
});

connection.languages.semanticTokens.on(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  const builder = new SemanticTokensBuilder();
  if (!document) {
    return builder.build();
  }
  const analysis = await getOrAnalyze(document);
  const tokens = analysis.semanticTokens
    .filter((token) => token.location.range.start.line === token.location.range.end.line)
    .sort((a, b) => a.location.offsetRange.start - b.location.offsetRange.start);
  for (const token of tokens) {
    const range = toLspRange(token.location);
    builder.push(
      range.start.line,
      range.start.character,
      Math.max(1, range.end.character - range.start.character),
      semanticLegend.tokenTypes.indexOf(token.tokenType),
      token.tokenModifiers.reduce((mask, modifier) => {
        const index = semanticLegend.tokenModifiers.indexOf(modifier);
        return index === -1 ? mask : mask | (1 << index);
      }, 0),
    );
  }
  return builder.build();
});

connection.onFoldingRanges(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const analysis = await getOrAnalyze(document);
  return analysis.folds.map((fold) => ({
    startLine: fold.location.range.start.line,
    startCharacter: fold.location.range.start.character,
    endLine: fold.location.range.end.line,
    endCharacter: fold.location.range.end.character,
    kind: fold.kind === 'comment' ? FoldingRangeKind.Comment : FoldingRangeKind.Region,
  }));
});

connection.onDocumentFormatting(async (params) => {
  const document = getOpenDocument(params.textDocument.uri);
  if (!document) {
    return [];
  }
  return formatDocument(document);
});

connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
  switch (params.command) {
    case 'ieLua.validateDocument': {
      const uri = typeof params.arguments?.[0] === 'string' ? params.arguments[0] : undefined;
      const document = uri ? getOpenDocument(uri) : undefined;
      if (document) {
        await validateDocument(document);
      }
      return null;
    }
    case 'ieLua.validateWorkspace':
      await validateAllOpenDocuments('manual');
      return null;
    case 'ieLua.reloadApiData': {
      const loaded = loadApiIndex();
      reportApiLoad(loaded);
      if (!loaded.index)
        throw new ResponseError(
          -32603,
          'API reload failed. Previous API data retained. See the server log and retry Reload API Data.',
        );
      apiIndex = loaded.index;
      // Pending unknown-global diagnostics must not cross an API generation boundary.
      invalidateAnalyses();
      return null;
    }
    case 'ieLua.showApiSource':
      return apiIndex.sources;
    case 'ieLua.openServerLog':
      connection.window.showInformationMessage(
        'IE Lua server log is available in the language client output channel.',
      );
      return null;
    default:
      return null;
  }
});

function snapshot(document: TextDocument): TextDocument {
  const copy = TextDocument.create(
    document.uri,
    document.languageId,
    document.version,
    document.getText(),
  );
  snapshots.set(copy, { session: sessions.get(document.uri), generation });
  return copy;
}

function getOpenDocument(uri: string): TextDocument | undefined {
  const document = documents.get(uri);
  return document ? snapshot(document) : undefined;
}

function isCurrent(state: Pick<AnalysisState, 'document' | 'session' | 'generation'>): boolean {
  return (
    !stopped &&
    state.session !== undefined &&
    sessions.get(state.document.uri) === state.session &&
    generation === state.generation &&
    documents.get(state.document.uri)?.version === state.document.version
  );
}

function requireCurrent(state: AnalysisState): void {
  if (!isCurrent(state)) throw new ResponseError(LSPErrorCodes.ContentModified, 'Document changed');
}

function isContentModified(error: unknown): boolean {
  return error instanceof ResponseError && error.code === LSPErrorCodes.ContentModified;
}

function background(work: Promise<unknown>): void {
  void work.catch((error: unknown) => {
    if (!isContentModified(error) && !stopped)
      connection.console.error('Background document operation failed. Retry the operation.');
  });
}

function invalidateAnalyses(): void {
  generation++;
  scheduler.clear();
  analyses.clear();
  settingsCache.clear();
}

function analysisState(document: TextDocument): AnalysisState {
  const identity = snapshots.get(document)!;
  const cached = analyses.get(document.uri);
  if (
    cached &&
    cached.document.version === document.version &&
    cached.session === identity.session &&
    cached.generation === identity.generation &&
    isCurrent(cached)
  )
    return cached;
  let state: AnalysisState;
  const result = getSettings(document.uri).then((settings) => {
    requireCurrent(state);
    state.settings = settings;
    return analyzeDocument({
      uri: document.uri,
      languageId: document.languageId === 'ie-menu' ? 'ie-menu' : 'ie-lua',
      text: document.getText(),
      settings,
      luaparse,
    });
  });
  state = { document, ...identity, result };
  if (isCurrent(state)) analyses.set(document.uri, state);
  void result.catch(() => {
    if (analyses.get(document.uri) === state) analyses.delete(document.uri);
  });
  return state;
}

async function onDocumentChanged(document: TextDocument): Promise<void> {
  const state = analysisState(document);
  await state.result;
  requireCurrent(state);
  const settings = state.settings!;
  if (!shouldValidate(settings.validation.mode, 'type')) return;
  scheduler.schedule(
    document.uri,
    () => {
      if (isCurrent(state)) background(validateDocument(document));
    },
    settings.validation.debounceMs,
  );
}

function toMarkdownDocumentation(symbol: ApiSymbol): { kind: 'markdown'; value: string } {
  return { kind: 'markdown', value: makeDocumentation(symbol) };
}

async function maybeValidate(
  document: TextDocument,
  trigger: 'manual' | 'save' | 'type',
): Promise<void> {
  const state = analysisState(document);
  await state.result;
  requireCurrent(state);
  if (shouldValidate(state.settings!.validation.mode, trigger)) {
    scheduler.cancel(document.uri);
    await validateDocument(document);
  }
}

async function validateAllOpenDocuments(trigger: 'manual' | 'save' | 'type'): Promise<void> {
  await Promise.all(documents.all().map((document) => maybeValidate(snapshot(document), trigger)));
}

async function refreshAfterConfigurationChange(): Promise<void> {
  await Promise.all(
    documents.all().map(async (current) => {
      const state = analysisState(snapshot(current));
      await state.result;
      requireCurrent(state);
      if (state.settings!.validation.mode === 'manual') {
        await connection.sendDiagnostics({
          uri: state.document.uri,
          version: state.document.version,
          diagnostics: [],
        });
      }
    }),
  );
}

async function validateDocument(document: TextDocument): Promise<void> {
  const state = analysisState(document);
  const analysis = await state.result;
  requireCurrent(state);
  scheduler.cancel(document.uri);
  const diagnostics = [
    ...analysis.diagnostics,
    ...collectUnknownGlobalDiagnostics(document, analysis, state.settings!),
  ];
  await connection.sendDiagnostics({
    uri: document.uri,
    version: document.version,
    diagnostics: diagnostics.map(toDiagnostic),
  });
}

async function getOrAnalyze(document: TextDocument): Promise<AnalyzedDocument> {
  const state = analysisState(document);
  const analysis = await state.result;
  requireCurrent(state);
  return analysis;
}

async function getDocumentSettings(document: TextDocument): Promise<IeLuaSettings> {
  const state = analysisState(document);
  await state.result;
  requireCurrent(state);
  return state.settings!;
}

function getSettings(resource: string): Promise<IeLuaSettings> {
  const cached = settingsCache.get(resource);
  if (cached) return cached;
  const pending = hasConfigurationCapability
    ? connection.workspace
        .getConfiguration({ scopeUri: resource, section: 'ieLua' })
        .then((configuration: SettingsInput) =>
          normalizeSettings(mergeSettings(initializationSettings, configuration)),
        )
    : Promise.resolve(normalizeSettings(initializationSettings));
  settingsCache.set(resource, pending);
  void pending.catch(() => {
    if (settingsCache.get(resource) === pending) settingsCache.delete(resource);
  });
  return pending;
}

function readInitializationSettings(initializationOptions: unknown): SettingsInput | undefined {
  if (!isRecord(initializationOptions)) {
    return undefined;
  }

  const settingsRoot = isRecord(initializationOptions.settings)
    ? initializationOptions.settings
    : initializationOptions;
  const ieLuaSettings = isRecord(settingsRoot.ieLua) ? settingsRoot.ieLua : settingsRoot;
  return ieLuaSettings as SettingsInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDiagnostic(diagnostic: LuaDiagnostic) {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    severity:
      diagnostic.severity === 'error'
        ? DiagnosticSeverity.Error
        : diagnostic.severity === 'warning'
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Hint,
    source: 'ie-lua',
    range: toLspRange(diagnostic.location),
  };
}

function toLspRange(location: SourceLocation): Range {
  return Range.create(
    location.range.start.line,
    location.range.start.character,
    location.range.end.line,
    location.range.end.character,
  );
}

function toDocumentSymbol(symbol: SymbolInfo): DocumentSymbol {
  return {
    name: symbol.name,
    kind: toSymbolKind(symbol.kind),
    range: toLspRange(symbol.location),
    selectionRange: toLspRange(symbol.location),
  };
}

function toSymbolKind(kind: SymbolInfo['kind']): SymbolKind {
  switch (kind) {
    case 'function':
    case 'method':
      return SymbolKind.Function;
    case 'field':
      return SymbolKind.Field;
    case 'parameter':
      return SymbolKind.Variable;
    case 'local':
    case 'global':
    default:
      return SymbolKind.Variable;
  }
}

function toCompletionKind(kind: string): CompletionItemKind {
  switch (kind) {
    case 'function':
      return CompletionItemKind.Function;
    case 'method':
      return CompletionItemKind.Method;
    case 'module':
      return CompletionItemKind.Module;
    case 'structure':
      return CompletionItemKind.Struct;
    case 'field':
      return CompletionItemKind.Field;
    case 'keyword':
      return CompletionItemKind.Keyword;
    default:
      return CompletionItemKind.Variable;
  }
}

function completionLabel(symbol: ApiSymbol, memberReceiver: string | undefined): string {
  if (!memberReceiver) return symbol.name;
  if (symbol.containerName === memberReceiver && symbol.instanceName) return symbol.instanceName;
  return (
    symbol.callableAliases?.find((alias) => alias.receiverType)?.name ??
    symbol.instanceName ??
    symbol.name
  );
}

function getMemberReceiverAt(
  document: TextDocument,
  position: { line: number; character: number },
): string | undefined {
  const beforeCursor = document.getText().slice(0, document.offsetAt(position));
  return beforeCursor.match(
    /([A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)*)[.:][A-Za-z0-9_]*$/u,
  )?.[1];
}

function getWordAt(
  document: TextDocument,
  position: { line: number; character: number },
): string | undefined {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const left = text.slice(0, offset).match(/[A-Za-z_][A-Za-z0-9_:.]*$/)?.[0] ?? '';
  const right = text.slice(offset).match(/^[A-Za-z0-9_:.]*/)?.[0] ?? '';
  const word = `${left}${right}`;
  return word.length > 0 ? word : undefined;
}

function formatDocument(document: TextDocument): TextEdit[] {
  if (document.languageId === 'ie-menu') {
    return [];
  }

  return trailingWhitespaceEdits(document.getText()).map(({ start, end }) =>
    TextEdit.del(Range.create(document.positionAt(start), document.positionAt(end))),
  );
}

function collectUnknownGlobalDiagnostics(
  document: TextDocument,
  analysis: AnalyzedDocument,
  settings: IeLuaSettings,
): LuaDiagnostic[] {
  if (settings.diagnostics.unknownGlobals === 'off') {
    return [];
  }

  const apiSymbols = new Set(
    filterApiSymbols(apiIndex, settings).flatMap((symbol) => [
      symbol.name,
      symbol.name.split(/[.:]/u)[0] ?? symbol.name,
      ...(symbol.callableAliases ?? []).map((alias) => alias.name),
    ]),
  );
  const seen = new Set<string>();
  const diagnostics: LuaDiagnostic[] = [];

  for (const reference of analysis.references) {
    if (
      reference.resolvedDeclaration ||
      reference.member ||
      apiSymbols.has(reference.name) ||
      reference.name.includes('.') ||
      seen.has(`${reference.name}:${reference.location.offsetRange.start}`)
    ) {
      continue;
    }

    seen.add(`${reference.name}:${reference.location.offsetRange.start}`);
    diagnostics.push({
      code: 'unknown-global',
      message: `Unknown global '${reference.name}'.`,
      severity: settings.diagnostics.unknownGlobals === 'warning' ? 'warning' : 'hint',
      location: reference.location,
    });
  }

  return diagnostics.filter(
    (diagnostic) => document.getText(toLspRange(diagnostic.location)).trim().length > 0,
  );
}

interface ApiLoadResult {
  index?: ApiIndex;
  selected?: string;
  failures: string[];
}

function reportApiLoad(result: ApiLoadResult): void {
  for (const failure of result.failures) connection.console.warn(failure);
  if (result.selected) connection.console.info(`API data loaded from ${result.selected}`);
}

function loadApiIndex(): ApiLoadResult {
  const configuredPath = process.env.IE_LUA_API_INDEX;
  const candidates = [
    configuredPath,
    path.resolve(process.cwd(), 'resources/api/api-index.json'),
    path.resolve(__dirname, '../../resources/api/api-index.json'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const failures: string[] = [];
  for (const candidate of new Set(candidates)) {
    try {
      return { index: loadApiIndexFromManifest(candidate), selected: candidate, failures };
    } catch {
      // Do not log parser errors: JSON errors can contain excerpts of local input.
      failures.push(`API candidate could not be read or validated: ${candidate}`);
    }
  }
  return { failures };
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) && !luaKeywords.has(value);
}

documents.listen(connection);
connection.listen();
