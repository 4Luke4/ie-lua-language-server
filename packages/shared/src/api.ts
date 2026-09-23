import type { ApiIndex, ApiSymbol, IeLuaSettings } from './types';

export const emptyApiIndex: ApiIndex = {
  schemaVersion: 3,
  generatedAt: '1970-01-01T00:00:00.000Z',
  sources: [],
  symbols: [],
};

export function filterApiSymbols(index: ApiIndex, settings: IeLuaSettings): ApiSymbol[] {
  const enabled = new Set(settings.symbolSources.enabled);
  return index.symbols.filter((symbol) => enabled.has(symbol.sourceSection));
}

export function filterGlobalApiSymbols(index: ApiIndex, settings: IeLuaSettings): ApiSymbol[] {
  return filterApiSymbols(index, settings).filter((symbol) => symbol.kind !== 'field');
}

export function findApiSymbol(
  index: ApiIndex,
  settings: IeLuaSettings,
  name: string,
): ApiSymbol | undefined {
  const symbols = filterApiSymbols(index, settings);
  const exactMatch = symbols.find((symbol) => symbol.name === name && !isBaseClassField(symbol));
  if (exactMatch) {
    return exactMatch;
  }

  const aliasMatches = symbols.filter((symbol) =>
    symbol.callableAliases?.some((alias) => !alias.receiverType && alias.name === name),
  );
  if (aliasMatches.length === 1) {
    return aliasMatches[0];
  }

  const methodCall = name.match(/^(.+):([A-Za-z_][A-Za-z0-9_]*)$/u);
  if (!methodCall) {
    return undefined;
  }

  const [, receiver, methodName] = methodCall;
  const callableSymbols = symbols.filter(
    (symbol) => symbol.kind === 'function' || symbol.kind === 'method',
  );
  const receiverMatch = callableSymbols.find(
    (symbol) =>
      (symbol.containerName === receiver && symbol.instanceName === methodName) ||
      symbol.name === `${receiver}.${methodName}`,
  );
  if (receiverMatch) {
    return receiverMatch;
  }

  const methodMatches = callableSymbols.filter(
    (symbol) =>
      symbol.instanceName === methodName ||
      symbol.name.endsWith(`.${methodName}`) ||
      symbol.callableAliases?.some((alias) => alias.name === methodName),
  );
  return methodMatches.length === 1 ? methodMatches[0] : undefined;
}

export function findApiSymbolForExpression(
  index: ApiIndex,
  settings: IeLuaSettings,
  expression: string,
  documentText: string,
  offset: number,
): ApiSymbol | undefined {
  const direct = findApiSymbol(index, settings, expression);
  if (direct) {
    return direct;
  }

  const separator = Math.max(expression.lastIndexOf('.'), expression.lastIndexOf(':'));
  if (separator === -1) {
    return undefined;
  }
  const receiver = expression.slice(0, separator);
  const memberName = expression.slice(separator + 1);
  const symbols = filterApiSymbols(index, settings);
  const callableMatch = findCallableMember(symbols, receiver, memberName, documentText, offset);
  if (callableMatch) {
    return callableMatch;
  }
  const structureName = resolveStructureName(symbols, receiver, documentText, offset);
  return structureName ? findStructureField(symbols, structureName, memberName) : undefined;
}

export function findApiStructureMembers(
  index: ApiIndex,
  settings: IeLuaSettings,
  receiver: string,
  documentText: string,
  offset: number,
): ApiSymbol[] {
  const symbols = filterApiSymbols(index, settings);
  const directMembers = symbols.filter(
    (symbol) =>
      symbol.containerName === receiver && symbol.instanceName && !isBaseClassField(symbol),
  );
  const structureName = resolveStructureName(symbols, receiver, documentText, offset);
  const annotatedType = inferAnnotationType(receiver, documentText, offset);
  const resolvedType = annotatedType ?? structureName;
  // A structure also offers everything it extends; see structureLineage.
  const receiverTypes = structureName
    ? structureLineage(symbols, structureName)
    : resolvedType
      ? [resolvedType]
      : [];
  const methods = symbols.filter((symbol) =>
    symbol.callableAliases?.some(
      (alias) =>
        alias.receiverType !== undefined &&
        receiverTypes.some((receiverType) => typesMatch(alias.receiverType!, receiverType)),
    ),
  );
  return uniqueSymbols([
    ...directMembers,
    ...(structureName ? lineageFields(symbols, structureName) : []),
    ...methods,
  ]);
}

export interface ApiCallableView {
  signature: string;
  parameters: NonNullable<ApiSymbol['parameters']>;
}

export function makeApiCallableView(
  symbol: ApiSymbol,
  expression: string,
): ApiCallableView | undefined {
  if (!symbol.signature) return undefined;
  const separator = Math.max(expression.lastIndexOf('.'), expression.lastIndexOf(':'));
  const member = separator === -1 ? expression : expression.slice(separator + 1);
  const alias = symbol.callableAliases?.find(
    (candidate) => candidate.name === member || candidate.name === expression,
  );
  const parameters = symbol.parameters ?? [];
  if (!alias) return { signature: symbol.signature, parameters };
  const visibleParameters = alias.consumesFirstParameter ? parameters.slice(1) : parameters;
  return {
    signature: `${expression}(${visibleParameters.map((parameter) => parameter.name).join(', ')})`,
    parameters: visibleParameters,
  };
}

/**
 * Locates each parameter inside a signature's own parameter list, as [start, end) UTF-16 offsets
 * for LSP parameter labels.
 *
 * Searching the whole label for a name finds the first occurrence anywhere, which is wrong when
 * the callable's own name contains it or when a published name repeats, as in
 * "Infinity_LuaConsoleInput(???,???)". Returns undefined when any parameter cannot be located, so
 * the caller can fall back to plain names.
 */
export function parameterLabelOffsets(
  signature: string,
  names: readonly string[],
): Array<[number, number]> | undefined {
  const open = signature.indexOf('(');
  const close = signature.lastIndexOf(')');
  if (open === -1 || close < open) return undefined;
  const offsets: Array<[number, number]> = [];
  let cursor = open + 1;
  for (const name of names) {
    const start = name ? signature.indexOf(name, cursor) : -1;
    if (start === -1 || start + name.length > close) return undefined;
    offsets.push([start, start + name.length]);
    cursor = start + name.length;
  }
  return offsets;
}

export function makeDocumentation(symbol: ApiSymbol): string {
  const chunks: string[] = [`### \`${symbol.name}\``];
  if (symbol.signature) {
    chunks.push(`\`\`\`lua\n${symbol.signature}\n\`\`\``);
  }

  const layoutFacts: string[] = [];
  if (symbol.dataType) {
    layoutFacts.push(`**Type:** \`${symbol.dataType}\``);
  }
  if (symbol.byteOffset) {
    layoutFacts.push(`**Offset:** \`${symbol.byteOffset}\``);
  }
  if (symbol.byteSize !== undefined) {
    layoutFacts.push(`**Size:** ${symbol.byteSize} bytes`);
  } else if (symbol.sizeExpression) {
    layoutFacts.push(`**Size:** \`${symbol.sizeExpression}\``);
  }
  if (symbol.memberCount !== undefined) {
    layoutFacts.push(`**Fields:** ${symbol.memberCount}`);
  }
  if (layoutFacts.length > 0) {
    // VS Code's Markdown renderer needs real line breaks; escaped "\\n" text is shown verbatim.
    chunks.push(layoutFacts.join('  \n'));
  }

  if (symbol.documentationMarkdown) {
    chunks.push(symbol.documentationMarkdown);
  } else if (symbol.documentationState === 'undocumented') {
    chunks.push('Undocumented in official source.');
  }
  chunks.push('---', `Source: [${symbol.upstreamUrl}](${symbol.upstreamUrl})`);
  return chunks.join('\n\n');
}

function resolveStructureName(
  symbols: ApiSymbol[],
  expression: string,
  documentText: string,
  offset: number,
): string | undefined {
  const parts = expression.split('.');
  const first = parts.shift();
  if (!first) {
    return undefined;
  }

  let structureName =
    findStructureName(symbols, first) ??
    inferAnnotatedStructureName(symbols, first, documentText, offset);
  if (!structureName) {
    return undefined;
  }

  for (const memberName of parts) {
    const field = findStructureField(symbols, structureName, memberName);
    structureName = field?.dataType
      ? findReferencedStructureName(symbols, field.dataType)
      : undefined;
    if (!structureName) {
      return undefined;
    }
  }

  return structureName;
}

function findCallableMember(
  symbols: ApiSymbol[],
  receiver: string,
  memberName: string,
  documentText: string,
  offset: number,
): ApiSymbol | undefined {
  const direct = symbols.find(
    (symbol) =>
      symbol.containerName === receiver &&
      symbol.instanceName === memberName &&
      !isBaseClassField(symbol),
  );
  if (direct) return direct;

  const annotatedType = inferAnnotationType(receiver, documentText, offset);
  // An annotated receiver accepts methods of every structure it extends, nearest first.
  const annotatedStructure = annotatedType
    ? findReferencedStructureName(symbols, annotatedType)
    : undefined;
  const receiverTypes = annotatedStructure
    ? structureLineage(symbols, annotatedStructure)
    : annotatedType
      ? [annotatedType]
      : undefined;
  const aliasMatches = symbols.filter((symbol) =>
    symbol.callableAliases?.some(
      (alias) =>
        alias.name === memberName &&
        (!receiverTypes ||
          !alias.receiverType ||
          receiverTypes.some((receiverType) => typesMatch(alias.receiverType!, receiverType))),
    ),
  );
  for (const receiverType of receiverTypes ?? []) {
    const atLevel = aliasMatches.filter((symbol) =>
      symbol.callableAliases?.some(
        (alias) =>
          alias.name === memberName &&
          alias.receiverType !== undefined &&
          typesMatch(alias.receiverType, receiverType),
      ),
    );
    if (atLevel.length > 0) return atLevel.length === 1 ? atLevel[0] : undefined;
  }
  return aliasMatches.length === 1 ? aliasMatches[0] : undefined;
}

/**
 * EEex documents structure inheritance as layout rows named baseclass_<n> whose type is the base
 * structure. They are not members a script can read: the base structure's members are reached
 * directly on the derived one, so these rows are never offered, hovered, or resolved as fields.
 */
export function isBaseClassField(symbol: ApiSymbol): boolean {
  return symbol.kind === 'field' && /^baseclass_\d+$/u.test(symbol.instanceName ?? '');
}

/**
 * A structure followed by every structure it extends, nearest first and depth-first in
 * baseclass_<n> order. A base whose type is not a documented structure (for example an undocumented
 * template instantiation) contributes nothing rather than guessed members, and cycles are cut.
 */
function structureLineage(symbols: ApiSymbol[], structureName: string): string[] {
  const lineage: string[] = [];
  const visit = (name: string): void => {
    if (lineage.includes(name)) return;
    lineage.push(name);
    const bases = symbols
      .filter((symbol) => symbol.containerName === name && isBaseClassField(symbol))
      .sort((left, right) => baseClassIndex(left) - baseClassIndex(right));
    for (const base of bases) {
      const baseName = base.dataType
        ? findReferencedStructureName(symbols, base.dataType)
        : undefined;
      if (baseName) visit(baseName);
    }
  };
  visit(structureName);
  return lineage;
}

function baseClassIndex(symbol: ApiSymbol): number {
  return Number.parseInt(symbol.instanceName?.slice('baseclass_'.length) ?? '0', 10);
}

// The nearest declaration of a member name wins, as it would on the usertype at runtime.
function findStructureField(
  symbols: ApiSymbol[],
  structureName: string,
  memberName: string,
): ApiSymbol | undefined {
  for (const name of structureLineage(symbols, structureName)) {
    const field = symbols.find(
      (symbol) =>
        symbol.kind === 'field' &&
        symbol.containerName === name &&
        symbol.instanceName === memberName &&
        !isBaseClassField(symbol),
    );
    if (field) return field;
  }
  return undefined;
}

function lineageFields(symbols: ApiSymbol[], structureName: string): ApiSymbol[] {
  const seen = new Set<string>();
  const fields: ApiSymbol[] = [];
  for (const name of structureLineage(symbols, structureName)) {
    for (const symbol of symbols) {
      if (
        symbol.kind !== 'field' ||
        symbol.containerName !== name ||
        !symbol.instanceName ||
        isBaseClassField(symbol) ||
        seen.has(symbol.instanceName)
      ) {
        continue;
      }
      seen.add(symbol.instanceName);
      fields.push(symbol);
    }
  }
  return fields;
}

function uniqueSymbols(symbols: ApiSymbol[]): ApiSymbol[] {
  return [...new Map(symbols.map((symbol) => [symbol.id, symbol])).values()];
}

function typesMatch(left: string, right: string): boolean {
  return normalizeStructureType(left) === normalizeStructureType(right);
}

function inferAnnotatedStructureName(
  symbols: ApiSymbol[],
  receiver: string,
  documentText: string,
  offset: number,
): string | undefined {
  const annotatedType = inferAnnotationType(receiver, documentText, offset);
  return annotatedType ? findReferencedStructureName(symbols, annotatedType) : undefined;
}

function inferAnnotationType(
  receiver: string,
  documentText: string,
  offset: number,
): string | undefined {
  const lines = documentText.slice(0, offset).split(/\r?\n/u);
  let annotatedType: string | undefined;

  for (const [index, sourceLine] of lines.entries()) {
    const line = sourceLine.trimStart();
    const parameterPayload = annotationPayload(line, '---@param');
    if (parameterPayload) {
      const [annotatedReceiver, parameterType] = parameterPayload.split(/[ \t]+/u, 2);
      if (annotatedReceiver === receiver && parameterType) {
        annotatedType = parameterType;
      }
    }

    const typePayload = annotationPayload(line, '---@type');
    if (!typePayload) {
      continue;
    }

    const [candidateType] = typePayload.split(/[ \t]+/u, 1);
    const nextLine = lines[index + 1]?.trimStart() ?? '';
    const declaration = nextLine.startsWith('local ')
      ? nextLine.slice('local '.length).trimStart()
      : nextLine;
    const declaredReceiver = declaration.match(/^[A-Za-z_][A-Za-z0-9_]*/u)?.[0];
    if (declaredReceiver === receiver && candidateType) {
      annotatedType = candidateType;
    }
  }

  return annotatedType;
}

function annotationPayload(line: string, directive: string): string | undefined {
  if (!line.startsWith(directive)) {
    return undefined;
  }

  const separator = line[directive.length];
  if (separator !== ' ' && separator !== '\t') {
    return undefined;
  }

  return line.slice(directive.length + 1).trimStart();
}

function findReferencedStructureName(symbols: ApiSymbol[], dataType: string): string | undefined {
  const candidates = [dataType.trim(), normalizeStructureType(dataType)];
  return candidates
    .map((candidate) => findStructureName(symbols, candidate))
    .find((candidate): candidate is string => Boolean(candidate));
}

function normalizeStructureType(dataType: string): string {
  let normalized = stripLeadingTypeKeyword(dataType.trim(), 'const');
  normalized = stripLeadingTypeKeyword(normalized, 'struct');

  while (normalized.endsWith('*')) {
    normalized = normalized.slice(0, -1).trimEnd();
  }

  const trailingConstStart = normalized.length - 'const'.length;
  if (
    trailingConstStart > 0 &&
    normalized.endsWith('const') &&
    isHorizontalWhitespace(normalized[trailingConstStart - 1])
  ) {
    normalized = normalized.slice(0, trailingConstStart).trimEnd();
  }

  return normalized;
}

function stripLeadingTypeKeyword(value: string, keyword: string): string {
  if (!value.startsWith(keyword) || !isHorizontalWhitespace(value[keyword.length])) {
    return value;
  }

  let contentStart = keyword.length + 1;
  while (isHorizontalWhitespace(value[contentStart])) {
    contentStart += 1;
  }
  return value.slice(contentStart);
}

function isHorizontalWhitespace(value: string | undefined): boolean {
  return value === ' ' || value === '\t';
}

function findStructureName(symbols: ApiSymbol[], name: string): string | undefined {
  return symbols.find((symbol) => symbol.kind === 'structure' && symbol.name === name)?.name;
}
