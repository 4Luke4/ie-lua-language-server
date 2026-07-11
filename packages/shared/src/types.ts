export const languageIds = {
  lua: 'ie-lua',
  menu: 'ie-menu',
} as const;

export type IeLuaLanguageId = (typeof languageIds)[keyof typeof languageIds];

export type LuaDialect = 'lua52' | 'luajit';
export type ValidationMode = 'manual' | 'save' | 'type' | 'saveAndType';
export type UnknownGlobalSeverity = 'off' | 'hint' | 'warning';

export type SourceSectionId =
  | 'ee-game-lua-functions'
  | 'eeex-functions'
  | 'ee-game-structures-x64'
  | 'lua52'
  | 'luajit'
  | 'ee-utility-functions';

export type ApiSymbolKind =
  'function' | 'method' | 'module' | 'structure' | 'field' | 'variable' | 'keyword' | 'annotation';

export type DocumentationState = 'documented' | 'undocumented' | 'permission-gated';
export type LicenseStatus = 'allowed' | 'permission-gated' | 'unknown';

export interface IeLuaSettings {
  dialect: LuaDialect;
  validation: {
    mode: ValidationMode;
  };
  symbolSources: {
    enabled: SourceSectionId[];
  };
  diagnostics: {
    unknownGlobals: UnknownGlobalSeverity;
  };
  formatter: {
    configPath: string;
  };
  menu: {
    blockKeys: string[];
    expressionKeys: string[];
  };
}

export interface ApiSymbol {
  id: string;
  name: string;
  kind: ApiSymbolKind;
  sourceSection: SourceSectionId;
  signature?: string;
  parameters?: ApiParameter[];
  returns?: ApiReturn[];
  instanceName?: string;
  documentationMarkdown?: string;
  documentationState: DocumentationState;
  upstreamUrl: string;
  upstreamCommit?: string;
  licenseStatus: LicenseStatus;
}

export interface ApiParameter {
  name: string;
  type?: string;
  defaultValue?: string;
  description?: string;
}

export interface ApiReturn {
  type?: string;
  description?: string;
}

export interface ApiIndex {
  schemaVersion: 1;
  generatedAt: string;
  sources: ApiSource[];
  symbols: ApiSymbol[];
}

export interface ApiIndexManifest {
  schemaVersion: 1;
  generatedAt: string;
  sources: ApiSource[];
  sections: ApiSectionReference[];
}

export interface ApiSectionReference {
  id: SourceSectionId;
  title: string;
  file: string;
  symbolCount: number;
  licenseStatus: LicenseStatus;
}

export interface ApiSectionFile {
  schemaVersion: 1;
  generatedAt: string;
  source: ApiSource;
  symbols: ApiSymbol[];
}

export interface ApiSource {
  id: SourceSectionId;
  title: string;
  url: string;
  commit?: string;
  licenseStatus: LicenseStatus;
}

export interface TextRange {
  start: number;
  end: number;
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface SourceLocation {
  range: Range;
  offsetRange: TextRange;
}

export interface EmbeddedLuaRegion {
  id: string;
  kind: 'chunk' | 'block' | 'expression';
  key?: string;
  luaText: string;
  hostRange: TextRange;
  luaContentRange: TextRange;
  virtualPrefix: string;
  virtualSuffix: string;
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'method' | 'local' | 'global' | 'parameter' | 'field';
  location: SourceLocation;
  containerName?: string;
  documentation?: string;
}

export interface ReferenceInfo {
  name: string;
  location: SourceLocation;
  resolvedDeclaration?: SymbolInfo;
}

export interface LuaDiagnostic {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'hint';
  location: SourceLocation;
}

export interface SemanticTokenInfo {
  location: SourceLocation;
  tokenType: 'namespace' | 'function' | 'method' | 'parameter' | 'variable' | 'property';
  tokenModifiers: Array<'declaration' | 'readonly' | 'deprecated'>;
}

export interface FoldInfo {
  location: SourceLocation;
  kind?: 'comment' | 'region';
}

export interface AnalyzedDocument {
  uri: string;
  languageId: IeLuaLanguageId;
  text: string;
  symbols: SymbolInfo[];
  references: ReferenceInfo[];
  diagnostics: LuaDiagnostic[];
  semanticTokens: SemanticTokenInfo[];
  folds: FoldInfo[];
  embeddedRegions: EmbeddedLuaRegion[];
}
