import type {
  FoldInfo,
  ReferenceInfo,
  SemanticTokenInfo,
  SourceLocation,
  SymbolInfo,
} from './types';

const identifier = '[A-Za-z_][A-Za-z0-9_]*';

export interface FallbackScanResult {
  symbols: SymbolInfo[];
  references: ReferenceInfo[];
  folds: FoldInfo[];
  semanticTokens: SemanticTokenInfo[];
}

export function scanLuaFallback(text: string, offsetBase = 0): FallbackScanResult {
  const symbols: SymbolInfo[] = [];
  const references: ReferenceInfo[] = [];
  const semanticTokens: SemanticTokenInfo[] = [];

  const functionPattern = new RegExp(
    `\\bfunction\\s+(${identifier}(?:(?:\\.|:)${identifier})*)\\s*\\(`,
    'g',
  );
  const localFunctionPattern = new RegExp(`\\blocal\\s+function\\s+(${identifier})\\s*\\(`, 'g');
  const localPattern = new RegExp(`\\blocal\\s+(${identifier}(?:\\s*,\\s*${identifier})*)`, 'g');
  const assignmentPattern = new RegExp(`(^|[^.\\w])(${identifier})\\s*=`, 'gm');
  const referencePattern = new RegExp(`\\b(${identifier})\\b`, 'g');

  for (const match of text.matchAll(functionPattern)) {
    const name = match[1] ?? '';
    const index = (match.index ?? 0) + match[0].indexOf(name);
    symbols.push(
      makeSymbol(text, offsetBase, index, name, name.includes(':') ? 'method' : 'function'),
    );
  }

  for (const match of text.matchAll(localFunctionPattern)) {
    const name = match[1] ?? '';
    const index = (match.index ?? 0) + match[0].indexOf(name);
    symbols.push(makeSymbol(text, offsetBase, index, name, 'function'));
  }

  for (const match of text.matchAll(localPattern)) {
    const names = (match[1] ?? '').split(',').map((part) => part.trim());
    for (const name of names) {
      if (!name || name === 'function') {
        continue;
      }
      const index = (match.index ?? 0) + match[0].indexOf(name);
      symbols.push(makeSymbol(text, offsetBase, index, name, 'local'));
    }
  }

  for (const match of text.matchAll(assignmentPattern)) {
    const name = match[2] ?? '';
    if (isKeyword(name)) {
      continue;
    }
    const index = (match.index ?? 0) + match[0].lastIndexOf(name);
    symbols.push(makeSymbol(text, offsetBase, index, name, 'global'));
  }

  const declarationByName = new Map(symbols.map((symbol) => [symbol.name, symbol]));
  for (const match of text.matchAll(referencePattern)) {
    const name = match[1] ?? '';
    if (isKeyword(name)) {
      continue;
    }
    const index = match.index ?? 0;
    const location = makeLocation(text, offsetBase + index, offsetBase + index + name.length);
    const resolvedDeclaration = declarationByName.get(name);
    references.push({
      name,
      location,
      ...(resolvedDeclaration ? { resolvedDeclaration } : {}),
    });
  }

  for (const symbol of symbols) {
    semanticTokens.push({
      location: symbol.location,
      tokenType:
        symbol.kind === 'method' ? 'method' : symbol.kind === 'function' ? 'function' : 'variable',
      tokenModifiers: ['declaration'],
    });
  }

  return {
    symbols: dedupeSymbols(symbols),
    references,
    folds: findFolds(text, offsetBase),
    semanticTokens,
  };
}

function makeSymbol(
  text: string,
  offsetBase: number,
  index: number,
  name: string,
  kind: SymbolInfo['kind'],
): SymbolInfo {
  return {
    name,
    kind,
    location: makeLocation(text, offsetBase + index, offsetBase + index + name.length),
  };
}

export function makeLocation(text: string, startOffset: number, endOffset: number): SourceLocation {
  return {
    offsetRange: {
      start: startOffset,
      end: endOffset,
    },
    range: {
      start: offsetToPosition(text, startOffset),
      end: offsetToPosition(text, endOffset),
    },
  };
}

export function offsetToPosition(
  text: string,
  offset: number,
): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;
  const boundedOffset = Math.max(0, Math.min(offset, text.length));

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

function findFolds(text: string, offsetBase: number): FoldInfo[] {
  const folds: FoldInfo[] = [];
  const stack: Array<{ keyword: string; offset: number }> = [];
  const pattern = /\b(function|do|then|repeat|end|until)\b/g;

  for (const match of text.matchAll(pattern)) {
    const keyword = match[1] ?? '';
    const offset = offsetBase + (match.index ?? 0);
    if (keyword === 'function' || keyword === 'do' || keyword === 'then' || keyword === 'repeat') {
      stack.push({ keyword, offset });
    } else {
      const start = stack.pop();
      if (start && offset > start.offset) {
        folds.push({
          location: makeLocation(text, start.offset, offset + keyword.length),
          kind: 'region',
        });
      }
    }
  }

  return folds;
}

function dedupeSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.name}:${symbol.location.offsetRange.start}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isKeyword(name: string): boolean {
  return luaKeywords.has(name);
}

export const luaKeywords = new Set([
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'goto',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
]);
