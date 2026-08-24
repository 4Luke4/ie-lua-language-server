import type { ApiIndex, ApiSymbol, IeLuaSettings } from './types';

export const emptyApiIndex: ApiIndex = {
  schemaVersion: 1,
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
  const exactMatch = symbols.find((symbol) => symbol.name === name);
  if (exactMatch) {
    return exactMatch;
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
    (symbol) => symbol.name === `${receiver}.${methodName}`,
  );
  if (receiverMatch) {
    return receiverMatch;
  }

  const methodMatches = callableSymbols.filter((symbol) => symbol.name.endsWith(`.${methodName}`));
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

  const separator = expression.lastIndexOf('.');
  if (separator === -1) {
    return undefined;
  }
  const receiver = expression.slice(0, separator);
  const memberName = expression.slice(separator + 1);
  const symbols = filterApiSymbols(index, settings);
  const structureName = resolveStructureName(symbols, receiver, documentText, offset);
  return structureName
    ? symbols.find(
        (symbol) =>
          symbol.kind === 'field' &&
          symbol.containerName === structureName &&
          symbol.instanceName === memberName,
      )
    : undefined;
}

export function findApiStructureMembers(
  index: ApiIndex,
  settings: IeLuaSettings,
  receiver: string,
  documentText: string,
  offset: number,
): ApiSymbol[] {
  const symbols = filterApiSymbols(index, settings);
  const structureName = resolveStructureName(symbols, receiver, documentText, offset);
  return structureName
    ? symbols.filter((symbol) => symbol.kind === 'field' && symbol.containerName === structureName)
    : [];
}

export function makeDocumentation(symbol: ApiSymbol): string {
  const chunks: string[] = [`### \`${symbol.name}\``];
  if (symbol.signature) {
    chunks.push('\\`\\`\\`lua', symbol.signature, '\\`\\`\\`');
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
    chunks.push(layoutFacts.join('  \\n'));
  }

  if (symbol.documentationState === 'undocumented') {
    chunks.push('Undocumented in official source.');
  } else if (symbol.documentationState === 'permission-gated') {
    chunks.push('Narrative upstream documentation is permission-gated and is not bundled.');
  } else if (symbol.documentationMarkdown) {
    chunks.push(symbol.documentationMarkdown);
  }
  chunks.push('---', `Source: [${symbol.upstreamUrl}](${symbol.upstreamUrl})`);
  return chunks.join('\\n\\n');
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
    const field = symbols.find(
      (symbol) =>
        symbol.kind === 'field' &&
        symbol.containerName === structureName &&
        symbol.instanceName === memberName,
    );
    structureName = field?.dataType
      ? findReferencedStructureName(symbols, field.dataType)
      : undefined;
    if (!structureName) {
      return undefined;
    }
  }

  return structureName;
}

function inferAnnotatedStructureName(
  symbols: ApiSymbol[],
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

  return annotatedType ? findReferencedStructureName(symbols, annotatedType) : undefined;
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
