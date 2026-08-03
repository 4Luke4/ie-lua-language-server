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
  const receiverMatch = symbols.find((symbol) => symbol.name === `${receiver}.${methodName}`);
  if (receiverMatch) {
    return receiverMatch;
  }

  const methodMatches = symbols.filter((symbol) => symbol.name.endsWith(`.${methodName}`));
  return methodMatches.length === 1 ? methodMatches[0] : undefined;
}

export function makeDocumentation(symbol: ApiSymbol): string {
  const chunks: string[] = [`### \`${symbol.name}\``];
  if (symbol.signature) {
    chunks.push('```lua', symbol.signature, '```');
  }
  if (symbol.documentationState === 'undocumented') {
    chunks.push('Undocumented in official source.');
  } else if (symbol.documentationState === 'permission-gated') {
    chunks.push('Documentation text is permission-gated and is not bundled.');
  } else if (symbol.documentationMarkdown) {
    chunks.push(symbol.documentationMarkdown);
  }
  chunks.push('---', `Source: [${symbol.upstreamUrl}](${symbol.upstreamUrl})`);
  return chunks.join('\n\n');
}
