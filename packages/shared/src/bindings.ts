import { scanLuaFallback } from './fallbackScanner';
import { createLocationMapper } from './positions';
import type { AnalyzedDocument, ReferenceInfo, SymbolInfo, TextRange } from './types';

type Node = { type: string; range: [number, number]; [key: string]: unknown };
type Scope = { parent?: Scope; range: TextRange; depth: number; bindings: Map<string, SymbolInfo> };
export type BindingAnalysis = Pick<
  AnalyzedDocument,
  'symbols' | 'references' | 'folds' | 'semanticTokens'
>;
const node = (value: unknown): Node | undefined =>
  value && typeof value === 'object' && 'type' in value && 'range' in value
    ? (value as Node)
    : undefined;
const nodes = (value: unknown): Node[] =>
  Array.isArray(value) ? value.flatMap((v) => node(v) ?? []) : [];

export function analyzeBindings(text: string, ast: unknown): BindingAnalysis {
  const symbols: SymbolInfo[] = [],
    references: ReferenceInfo[] = [];
  const folds: BindingAnalysis['folds'] = [];
  const root: Scope = { range: { start: 0, end: text.length }, depth: 0, bindings: new Map() };
  const globals = new Map<string, SymbolInfo>();
  const members = new Map<string, SymbolInfo>();
  const memberKeys = new Map<ReferenceInfo, string>();
  const lookup = (scope: Scope, name: string): SymbolInfo | undefined =>
    scope.bindings.get(name) ?? (scope.parent ? lookup(scope.parent, name) : globals.get(name));
  const mapLocation = createLocationMapper(text);
  const location = (n: Node) => mapLocation(n.range[0], n.range[1]);
  function reference(n: Node, scope: Scope, declaration?: SymbolInfo) {
    const name = String(n.name);
    const resolved = declaration ?? lookup(scope, name);
    references.push({
      name,
      location: location(n),
      ...(resolved ? { resolvedDeclaration: resolved } : {}),
      ...(declaration ? { isDeclaration: true } : {}),
    });
  }
  function declare(
    n: Node,
    scope: Scope,
    kind: SymbolInfo['kind'],
    local: boolean,
    visibleFrom: number,
  ) {
    const name = String(n.name);
    let symbol = local ? undefined : globals.get(name);
    if (!symbol) {
      symbol = {
        name,
        kind,
        location: location(n),
        bindingId: local ? `local:${n.range[0]}` : `global:${name}`,
        scopeRange: local ? scope.range : root.range,
        scopeDepth: local ? scope.depth + 1 : 0,
        visibleFrom: local ? visibleFrom : 0,
      };
      symbols.push(symbol);
      (local ? scope.bindings : globals).set(name, symbol);
    }
    reference(n, scope, symbol);
    return symbol;
  }
  function memberReference(n: Node, scope: Scope, declaration = false) {
    const field = node(n.identifier);
    let base = node(n.base);
    const parts = [String(field?.name)];
    while (base?.type === 'MemberExpression') {
      parts.unshift(String(node(base.identifier)?.name));
      base = node(base.base);
    }
    if (!field || base?.type !== 'Identifier') {
      visit(n.base, scope);
      return;
    }
    const rootName = String(base.name);
    const owner = lookup(scope, rootName)?.bindingId ?? `global:${rootName}`;
    const key = `member:${owner}:${parts.join('.')}`;
    const name = `${rootName}${n.indexer === ':' ? ':' : '.'}${parts.join('.')}`;
    visit(n.base, scope);
    if (declaration && !members.has(key)) {
      const symbol: SymbolInfo = {
        name,
        kind: n.indexer === ':' ? 'method' : 'function',
        location: location(field),
        bindingId: key,
        scopeRange: scope.range,
        scopeDepth: scope.depth,
        visibleFrom: 0,
      };
      members.set(key, symbol);
      symbols.push(symbol);
    }
    const ref: ReferenceInfo = {
      name,
      member: true,
      location: location(field),
      ...(declaration ? { isDeclaration: true } : {}),
    };
    references.push(ref);
    memberKeys.set(ref, key);
  }
  function scoped(n: Node, parent: Scope): Scope {
    return {
      parent,
      range: { start: n.range[0], end: n.range[1] },
      depth: parent.depth + 1,
      bindings: new Map(),
    };
  }
  function fold(n: Node, kind: 'region' | 'comment' = 'region') {
    const loc = location(n);
    if (loc.range.end.line > loc.range.start.line) folds.push({ location: loc, kind });
  }
  function visit(value: unknown, scope: Scope) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, scope);
      return;
    }
    const n = node(value);
    if (!n) return;
    const body = nodes(n.body);
    switch (n.type) {
      case 'Identifier':
        reference(n, scope);
        return;
      case 'LocalStatement':
        // Lua locals become visible after their initializers, including multi-assignment.
        visit(n.init, scope);
        for (const variable of nodes(n.variables))
          declare(variable, scope, 'local', true, n.range[1]);
        return;
      case 'FunctionDeclaration': {
        const identifier = node(n.identifier);
        if (identifier?.type === 'Identifier') {
          if (n.isLocal) declare(identifier, scope, 'function', true, identifier.range[1]);
          else {
            const existing = lookup(scope, String(identifier.name));
            if (existing) {
              existing.kind = 'function';
              reference(identifier, scope);
            } else declare(identifier, scope, 'function', false, 0);
          }
        } else if (identifier) memberReference(identifier, scope, true);
        const inner = scoped(n, scope);
        for (const parameter of nodes(n.parameters)) {
          if (parameter.type === 'Identifier')
            declare(parameter, inner, 'parameter', true, parameter.range[1]);
        }
        // Colon methods have an implicit local receiver with no editable source declaration.
        if (identifier?.indexer === ':')
          inner.bindings.set('self', {
            name: 'self',
            kind: 'parameter',
            location: location(identifier),
            bindingId: `implicit:${n.range[0]}`,
            scopeRange: inner.range,
            scopeDepth: inner.depth + 1,
            visibleFrom: identifier.range[1],
          });
        visit(body, inner);
        fold(n);
        return;
      }
      case 'AssignmentStatement':
        visit(n.init, scope);
        for (const variable of nodes(n.variables)) {
          if (variable.type === 'Identifier' && !lookup(scope, String(variable.name)))
            declare(variable, scope, 'global', false, 0);
          else visit(variable, scope);
        }
        return;
      case 'ForNumericStatement':
      case 'ForGenericStatement': {
        visit(n.start, scope);
        visit(n.end, scope);
        visit(n.step, scope);
        visit(n.iterators, scope);
        const inner = scoped(n, scope);
        const variables =
          n.type === 'ForNumericStatement'
            ? [node(n.variable)].filter((v): v is Node => !!v)
            : nodes(n.variables);
        for (const variable of variables)
          declare(variable, inner, 'local', true, body[0]?.range[0] ?? n.range[1]);
        visit(body, inner);
        fold(n);
        return;
      }
      case 'RepeatStatement': {
        const inner = scoped(n, scope);
        visit(body, inner);
        visit(n.condition, inner);
        fold(n);
        return;
      }
      case 'IfClause':
      case 'ElseifClause':
      case 'ElseClause':
      case 'WhileStatement':
      case 'DoStatement':
        visit(n.condition, scope);
        visit(body, scoped(n, scope));
        fold(n);
        return;
      case 'MemberExpression':
        // Track field navigation separately from lexically scoped variable references.
        memberReference(n, scope);
        return;
      case 'TableKeyString':
        visit(n.value, scope);
        return;
      case 'LabelStatement':
      case 'GotoStatement':
        return;
      case 'Comment':
        fold(n, 'comment');
        return;
      default:
        for (const [key, child] of Object.entries(n)) {
          if (!['loc', 'range', 'globals', 'comments'].includes(key)) visit(child, scope);
        }
    }
  }
  visit(ast, root);
  const chunk = node(ast);
  for (const comment of nodes(chunk?.comments)) fold(comment, 'comment');
  // A global can be declared later in a chunk or in another embedded region.
  for (const ref of references) {
    const global = ref.member ? members.get(memberKeys.get(ref) ?? '') : globals.get(ref.name);
    if (!ref.resolvedDeclaration && global) ref.resolvedDeclaration = global;
  }
  const semanticTokens = references.flatMap((ref) => {
    const symbol = ref.resolvedDeclaration;
    if (!symbol) return [];
    return [
      {
        location: ref.location,
        tokenType:
          symbol.kind === 'parameter'
            ? ('parameter' as const)
            : symbol.kind === 'function' || symbol.kind === 'method'
              ? ('function' as const)
              : ('variable' as const),
        tokenModifiers: ref.isDeclaration ? ['declaration' as const] : [],
      },
    ];
  });
  return { symbols, references, folds, semanticTokens };
}

export function visibleSymbols(analysis: AnalyzedDocument, offset: number): SymbolInfo[] {
  const visible = analysis.symbols.filter(
    (s) =>
      !s.scopeRange ||
      (s.scopeRange.start <= offset &&
        offset <= s.scopeRange.end &&
        (s.visibleFrom ?? 0) <= offset),
  );
  visible.sort(
    (a, b) =>
      (b.scopeDepth ?? 0) - (a.scopeDepth ?? 0) || (b.visibleFrom ?? 0) - (a.visibleFrom ?? 0),
  );
  return visible.filter((s, i) => visible.findIndex((other) => other.name === s.name) === i);
}

export function referenceAt(analysis: AnalyzedDocument, offset: number): ReferenceInfo | undefined {
  return analysis.references.find(
    (r) => r.location.offsetRange.start <= offset && offset < r.location.offsetRange.end,
  );
}

export function renameLocations(analysis: AnalyzedDocument, offset: number, newName: string) {
  const target = referenceAt(analysis, offset)?.resolvedDeclaration;
  if (
    !analysis.bindingsComplete ||
    !target?.bindingId ||
    target.bindingId.startsWith('implicit:') ||
    target.bindingId.startsWith('member:')
  )
    return undefined;
  const renamed = {
    ...analysis,
    symbols: analysis.symbols.map((s) =>
      s.bindingId === target.bindingId ? { ...s, name: newName } : s,
    ),
  };
  // Check both renamed uses and pre-existing uses that the new declaration could capture.
  for (const ref of analysis.references) {
    const selected = ref.resolvedDeclaration?.bindingId === target.bindingId;
    if ((!selected && ref.name !== newName) || ref.isDeclaration) continue;
    const resolved = visibleSymbols(renamed, ref.location.offsetRange.start).find(
      (s) => s.name === newName,
    );
    const expected = selected ? target.bindingId : ref.resolvedDeclaration?.bindingId;
    if (resolved?.bindingId !== expected) return undefined;
  }
  if (
    analysis.symbols.some(
      (s) =>
        s.bindingId !== target.bindingId &&
        s.name === newName &&
        s.scopeRange?.start === target.scopeRange?.start &&
        s.scopeRange?.end === target.scopeRange?.end,
    )
  )
    return undefined;
  return analysis.references
    .filter((r) => r.resolvedDeclaration?.bindingId === target.bindingId)
    .map((r) => r.location);
}

// Retain offset-stable discovery when parsing fails; no destructive edits use these guesses.
export function fallbackBindings(text: string): BindingAnalysis {
  const masked = maskLuaTrivia(text);
  return scanLuaFallback(masked);
}
export function maskLuaTrivia(text: string): string {
  const chars = text.split('');
  for (const { start, end } of luaProtectedRanges(text)) {
    for (let j = start; j < end; j++) if (chars[j] !== '\n' && chars[j] !== '\r') chars[j] = ' ';
  }
  return chars.join('');
}

// Unterminated strings/comments protect the remaining buffer, including whitespace.
export function luaProtectedRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    const comment = text.startsWith('--', i);
    if (comment) i += 2;
    const long = text[i] === '[' ? text.slice(i).match(/^\[(=*)\[/u) : null;
    if (long) {
      const close = `]${long[1]}]`;
      const end = text.indexOf(close, i + long[0].length);
      i = end < 0 ? text.length : end + close.length;
      ranges.push({ start, end: i });
      continue;
    }
    if (comment) {
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
      ranges.push({ start, end: i });
      continue;
    }
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i++];
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i++] === quote) break;
      }
      ranges.push({ start, end: Math.min(i, text.length) });
      continue;
    }
    i++;
  }
  return ranges;
}
