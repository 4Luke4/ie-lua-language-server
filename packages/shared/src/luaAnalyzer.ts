import { analyzeBindings, fallbackBindings } from './bindings';
import { extractEmbeddedLua, getVirtualLuaText, mapVirtualOffsetToHost } from './menuExtractor';
import { defaultSettings } from './settings';
import type {
  AnalyzedDocument,
  IeLuaLanguageId,
  IeLuaSettings,
  LuaDiagnostic,
  SourceLocation,
} from './types';

type LuaparseModule = {
  parse: (text: string, options: Record<string, unknown>) => unknown;
};

export interface AnalyzeOptions {
  uri: string;
  languageId: IeLuaLanguageId;
  text: string;
  settings?: IeLuaSettings;
  luaparse?: LuaparseModule;
}

export function analyzeDocument(options: AnalyzeOptions): AnalyzedDocument {
  const settings = options.settings ?? defaultSettings;
  const base = analyzeLuaText(options.languageId === 'ie-menu' ? '' : options.text, settings.dialect, options.luaparse);

  if (options.languageId !== 'ie-menu') {
    return {
      uri: options.uri,
      languageId: options.languageId,
      text: options.text,
      ...base,
      embeddedRegions: [],
    };
  }

  const regions = extractEmbeddedLua(options.text, settings);
  for (const region of regions) {
    const virtualText = getVirtualLuaText(region);
    const analyzedRegion = analyzeLuaText(virtualText, settings.dialect, options.luaparse);
    const remapLocation = (location: SourceLocation): SourceLocation => {
      const start = mapVirtualOffsetToHost(region, location.offsetRange.start);
      const end = mapVirtualOffsetToHost(region, location.offsetRange.end);
      return {
        offsetRange: { start, end },
        range: {
          start: offsetToPosition(options.text, start),
          end: offsetToPosition(options.text, end),
        },
      };
    };

    base.bindingsComplete = base.bindingsComplete === true && analyzedRegion.bindingsComplete === true;
    const remapped = new Map(analyzedRegion.symbols.map(symbol => {
      const bindingId = symbol.bindingId?.startsWith('local:') ? `${region.id}:${symbol.bindingId}` : symbol.bindingId;
      return [symbol, {
        ...symbol,
        ...(bindingId ? { bindingId } : {}),
        location: remapLocation(symbol.location),
        ...(symbol.scopeRange ? { scopeRange: symbol.bindingId?.startsWith('global:')
          ? { start: 0, end: options.text.length }
          : { start: mapVirtualOffsetToHost(region, symbol.scopeRange.start), end: mapVirtualOffsetToHost(region, symbol.scopeRange.end) } } : {}),
        ...(symbol.visibleFrom !== undefined ? { visibleFrom: mapVirtualOffsetToHost(region, symbol.visibleFrom) } : {}),
      }];
    }));
    base.symbols.push(...remapped.values());
    base.references.push(...analyzedRegion.references.map(reference => ({
      ...reference,
      ...(reference.resolvedDeclaration ? { resolvedDeclaration: remapped.get(reference.resolvedDeclaration) ?? reference.resolvedDeclaration } : {}),
      location: remapLocation(reference.location),
    })));
    base.semanticTokens.push(
      ...analyzedRegion.semanticTokens.map((token) => ({
        ...token,
        location: remapLocation(token.location),
      })),
    );
    base.folds.push(
      ...analyzedRegion.folds.map((fold) => ({
        ...fold,
        location: remapLocation(fold.location),
      })),
    );
    base.diagnostics.push(
      ...analyzedRegion.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        location: remapLocation(diagnostic.location),
      })),
    );
  }

  const globals = new Map(base.symbols.filter(s => s.bindingId?.startsWith('global:')).map(s => [s.name, s]));
  for (const reference of base.references) {
    if (!reference.resolvedDeclaration && globals.has(reference.name)) reference.resolvedDeclaration = globals.get(reference.name)!;
  }

  return {
    uri: options.uri,
    languageId: options.languageId,
    text: options.text,
    ...base,
    embeddedRegions: regions,
  };
}

function analyzeLuaText(
  text: string,
  dialect: 'lua52' | 'luajit',
  luaparse?: LuaparseModule,
): Omit<AnalyzedDocument, 'uri' | 'languageId' | 'text' | 'embeddedRegions'> {
  let scanned = fallbackBindings(text);
  let bindingsComplete = !text.trim();
  const diagnostics: LuaDiagnostic[] = [];

  if (luaparse && text.trim().length > 0) {
    try {
      const ast = luaparse.parse(text, {
        comments: true,
        scope: true,
        locations: true,
        ranges: true,
        luaVersion: dialect === 'luajit' ? 'LuaJIT' : '5.2',
      });
      scanned = analyzeBindings(text, ast);
      bindingsComplete = true;
    } catch (error) {
      diagnostics.push(makeParseDiagnostic(text, error));
    }
  }

  return {
    bindingsComplete,
    symbols: scanned.symbols,
    references: scanned.references,
    diagnostics,
    semanticTokens: scanned.semanticTokens,
    folds: scanned.folds,
  };
}

function makeParseDiagnostic(text: string, error: unknown): LuaDiagnostic {
  const anyError = error as { message?: string; line?: number; column?: number; index?: number };
  const offset =
    typeof anyError.index === 'number'
      ? anyError.index
      : positionToOffset(text, {
          line: Math.max(0, (anyError.line ?? 1) - 1),
          character: Math.max(0, anyError.column ?? 0),
        });

  return {
    code: 'lua-parse',
    message: anyError.message ?? 'Lua parse error.',
    severity: 'error',
    location: {
      offsetRange: {
        start: offset,
        end: Math.min(text.length, offset + 1),
      },
      range: {
        start: offsetToPosition(text, offset),
        end: offsetToPosition(text, Math.min(text.length, offset + 1)),
      },
    },
  };
}

function offsetToPosition(text: string, offset: number): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;
  const boundedOffset = Math.max(0, Math.min(text.length, offset));
  for (let index = 0; index < boundedOffset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return {
    line,
    character: boundedOffset - lineStart,
  };
}

function positionToOffset(text: string, position: { line: number; character: number }): number {
  let line = 0;
  let offset = 0;
  while (line < position.line && offset < text.length) {
    if (text.charCodeAt(offset) === 10) {
      line += 1;
    }
    offset += 1;
  }
  return Math.min(text.length, offset + position.character);
}
