import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CompletionItemKind,
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
import {
  analyzeDocument,
  DebouncedValidationScheduler,
  emptyApiIndex,
  filterApiSymbols,
  filterGlobalApiSymbols,
  findApiStructureMembers,
  findApiSymbol,
  findApiSymbolForExpression,
  makeDocumentation,
  mergeSettings,
  normalizeSettings,
  shouldValidate,
  type AnalyzedDocument,
  type ApiIndex,
  type ApiIndexManifest,
  type ApiSectionFile,
  type ApiSymbol,
  type IeLuaSettings,
  type LuaDiagnostic,
  type SettingsInput,
  type SourceLocation,
  type SymbolInfo,
} from '@ie-lua/shared';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analyses = new Map<string, AnalyzedDocument>();
const scheduler = new DebouncedValidationScheduler();

let hasConfigurationCapability = false;
let initializationSettings: SettingsInput | undefined;
let apiIndex: ApiIndex = loadApiIndex();

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
  void refreshAfterConfigurationChange();
});

documents.onDidOpen((event) => {
  void analyzeOnly(event.document);
});

documents.onDidChangeContent((event) => {
  void onDocumentChanged(event.document);
});

documents.onDidSave((event) => {
  void maybeValidate(event.document, 'save');
});

documents.onDidClose((event) => {
  scheduler.cancel(event.document.uri);
  analyses.delete(event.document.uri);
  void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  const settings = await getSettings(params.textDocument.uri);
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
  const workspaceNames = new Set(analysis?.symbols.map((symbol) => symbol.name) ?? []);

  return [
    ...apiSymbols.map((symbol): CompletionItem => {
      const item: CompletionItem = {
        label: symbol.instanceName ?? symbol.name,
        kind: toCompletionKind(symbol.kind),
        documentation: toMarkdownDocumentation(symbol),
        data: {
          apiSymbolId: symbol.id,
        },
      };
      if (symbol.signature) {
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
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const name = getWordAt(document, params.position);
  if (!name) {
    return null;
  }

  const settings = await getSettings(document.uri);
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

  const analysis = await getOrAnalyze(document);
  const symbol = analysis.symbols.find((candidate) => candidate.name === name);
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
  const document = documents.get(params.textDocument.uri);
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

  const settings = await getSettings(document.uri);
  const apiSymbol = findApiSymbol(apiIndex, settings, name);
  if (!apiSymbol?.signature) {
    return null;
  }

  const signature = {
    label: apiSymbol.signature,
    documentation: {
      kind: 'markdown' as const,
      value: makeDocumentation(apiSymbol),
    },
  };
  const parameters = apiSymbol.parameters?.map((parameter) => ({
    label: parameter.name,
    ...(parameter.description ? { documentation: parameter.description } : {}),
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
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  const name = getWordAt(document, params.position);
  if (!name) {
    return null;
  }

  const analysis = await getOrAnalyze(document);
  const symbol = findNearestSymbol(analysis, name, document.offsetAt(params.position));
  if (symbol) {
    return Location.create(document.uri, toLspRange(symbol.location));
  }

  const settings = await getSettings(document.uri);
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
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const name = getWordAt(document, params.position);
  if (!name) {
    return [];
  }

  const analysis = await getOrAnalyze(document);
  return analysis.references
    .filter((reference) => reference.name === name)
    .map((reference) => Location.create(document.uri, toLspRange(reference.location)));
});

connection.onRenameRequest(async (params: RenameParams): Promise<WorkspaceEdit | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isValidIdentifier(params.newName)) {
    return null;
  }

  const oldName = getWordAt(document, params.position);
  if (!oldName) {
    return null;
  }

  const analysis = await getOrAnalyze(document);
  const edits = analysis.references
    .filter((reference) => reference.name === oldName)
    .map((reference) => TextEdit.replace(toLspRange(reference.location), params.newName));

  return {
    changes: {
      [document.uri]: edits,
    },
  };
});

connection.onDocumentSymbol(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  const analysis = await getOrAnalyze(document);
  return analysis.symbols.map((symbol) => toDocumentSymbol(symbol));
});

connection.onWorkspaceSymbol(async (params) => {
  const query = params.query.toLowerCase();
  const symbols: SymbolInformation[] = [];
  for (const [uri, analysis] of analyses.entries()) {
    for (const symbol of analysis.symbols) {
      if (!query || symbol.name.toLowerCase().includes(query)) {
        symbols.push({
          name: symbol.name,
          kind: toSymbolKind(symbol.kind),
          location: Location.create(uri, toLspRange(symbol.location)),
        });
      }
    }
  }
  return symbols;
});

connection.languages.semanticTokens.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  const builder = new SemanticTokensBuilder();
  if (!document) {
    return builder.build();
  }
  const analysis = await getOrAnalyze(document);
  for (const token of analysis.semanticTokens) {
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
  const document = documents.get(params.textDocument.uri);
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
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  return formatDocument(document);
});

connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
  switch (params.command) {
    case 'ieLua.validateDocument': {
      const uri = typeof params.arguments?.[0] === 'string' ? params.arguments[0] : undefined;
      const document = uri ? documents.get(uri) : documents.all()[0];
      if (document) {
        await validateDocument(document);
      }
      return null;
    }
    case 'ieLua.validateWorkspace':
      await validateAllOpenDocuments('manual');
      return null;
    case 'ieLua.reloadApiData':
      apiIndex = loadApiIndex();
      return null;
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

async function onDocumentChanged(document: TextDocument): Promise<void> {
  await analyzeOnly(document);
  const settings = await getSettings(document.uri);
  if (!shouldValidate(settings.validation.mode, 'type')) {
    return;
  }
  scheduler.schedule(
    document.uri,
    () => {
      void validateDocument(document);
    },
    settings.validation.debounceMs,
  );
}

function toMarkdownDocumentation(symbol: ApiSymbol): { kind: 'markdown'; value: string } {
  return {
    kind: 'markdown',
    value: makeDocumentation(symbol),
  };
}

async function maybeValidate(
  document: TextDocument,
  trigger: 'manual' | 'save' | 'type',
): Promise<void> {
  const settings = await getSettings(document.uri);
  if (shouldValidate(settings.validation.mode, trigger)) {
    await validateDocument(document);
  }
}

async function validateAllOpenDocuments(trigger: 'manual' | 'save' | 'type'): Promise<void> {
  await Promise.all(documents.all().map((document) => maybeValidate(document, trigger)));
}

async function refreshAfterConfigurationChange(): Promise<void> {
  scheduler.clear();
  analyses.clear();
  await Promise.all(documents.all().map((document) => analyzeOnly(document)));

  for (const document of documents.all()) {
    const settings = await getSettings(document.uri);
    if (settings.validation.mode === 'manual') {
      void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    }
  }
}

async function validateDocument(document: TextDocument): Promise<void> {
  const analysis = await getOrAnalyze(document);
  const settings = await getSettings(document.uri);
  const diagnostics = [
    ...analysis.diagnostics,
    ...collectUnknownGlobalDiagnostics(document, analysis, settings),
  ];
  void connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: diagnostics.map(toDiagnostic),
  });
}

async function analyzeOnly(document: TextDocument): Promise<AnalyzedDocument> {
  const settings = await getSettings(document.uri);
  const analysis = analyzeDocument({
    uri: document.uri,
    languageId: document.languageId === 'ie-menu' ? 'ie-menu' : 'ie-lua',
    text: document.getText(),
    settings,
    luaparse,
  });
  analyses.set(document.uri, analysis);
  return analysis;
}

async function getOrAnalyze(document: TextDocument): Promise<AnalyzedDocument> {
  return analyses.get(document.uri) ?? analyzeOnly(document);
}

async function getSettings(resource: string): Promise<IeLuaSettings> {
  if (!hasConfigurationCapability) {
    return normalizeSettings(initializationSettings);
  }
  const configuration = await connection.workspace.getConfiguration({
    scopeUri: resource,
    section: 'ieLua',
  });
  return normalizeSettings(mergeSettings(initializationSettings, configuration as SettingsInput));
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

function getMemberReceiverAt(
  document: TextDocument,
  position: { line: number; character: number },
): string | undefined {
  const beforeCursor = document.getText().slice(0, document.offsetAt(position));
  return beforeCursor.match(
    /([A-Za-z_][A-Za-z0-9_:]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.[A-Za-z0-9_]*$/u,
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

function findNearestSymbol(
  analysis: AnalyzedDocument,
  name: string,
  offset: number,
): SymbolInfo | undefined {
  const candidates = analysis.symbols.filter((symbol) => symbol.name === name);
  return candidates
    .sort(
      (a, b) =>
        Math.abs(a.location.offsetRange.start - offset) -
        Math.abs(b.location.offsetRange.start - offset),
    )
    .at(0);
}

function formatDocument(document: TextDocument): TextEdit[] {
  if (document.languageId === 'ie-menu') {
    return [];
  }

  const text = document.getText();
  const trimmed = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n');
  if (trimmed === text) {
    return [];
  }
  return [
    TextEdit.replace(
      Range.create(document.positionAt(0), document.positionAt(text.length)),
      trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`,
    ),
  ];
}

function collectUnknownGlobalDiagnostics(
  document: TextDocument,
  analysis: AnalyzedDocument,
  settings: IeLuaSettings,
): LuaDiagnostic[] {
  if (settings.diagnostics.unknownGlobals === 'off') {
    return [];
  }

  const declarations = new Set(analysis.symbols.map((symbol) => symbol.name));
  const apiSymbols = new Set(filterApiSymbols(apiIndex, settings).map((symbol) => symbol.name));
  const seen = new Set<string>();
  const diagnostics: LuaDiagnostic[] = [];

  for (const reference of analysis.references) {
    if (
      reference.resolvedDeclaration ||
      declarations.has(reference.name) ||
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

function loadApiIndex(): ApiIndex {
  const configuredPath = process.env.IE_LUA_API_INDEX;
  const candidates = [
    configuredPath,
    path.resolve(process.cwd(), 'resources/api/api-index.json'),
    path.resolve(__dirname, '../../resources/api/api-index.json'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      return loadApiIndexFromManifest(candidate);
    } catch {
      continue;
    }
  }

  return emptyApiIndex;
}

function loadApiIndexFromManifest(manifestPath: string): ApiIndex {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ApiIndexManifest | ApiIndex;
  if ('symbols' in manifest) {
    return manifest;
  }

  const manifestDirectory = path.dirname(manifestPath);
  const symbols: ApiSymbol[] = [];
  for (const sectionReference of manifest.sections) {
    const sectionPath = path.resolve(manifestDirectory, sectionReference.file);
    const section = JSON.parse(fs.readFileSync(sectionPath, 'utf8')) as ApiSectionFile;
    symbols.push(...section.symbols);
  }

  return {
    schemaVersion: manifest.schemaVersion,
    generatedAt: manifest.generatedAt,
    sources: manifest.sources,
    symbols,
  };
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);
}

documents.listen(connection);
connection.listen();
