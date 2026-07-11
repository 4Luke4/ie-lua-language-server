import type { EmbeddedLuaRegion, IeLuaSettings, TextRange } from './types';

const backtick = '`';

interface QuotedString {
  content: string;
  range: TextRange;
  contentRange: TextRange;
}

export function extractEmbeddedLua(text: string, settings: IeLuaSettings): EmbeddedLuaRegion[] {
  const regions: EmbeddedLuaRegion[] = [];
  regions.push(...extractBacktickChunks(text));
  regions.push(...extractMenuQuotedLua(text, settings));
  return regions.sort((a, b) => a.hostRange.start - b.hostRange.start);
}

function extractBacktickChunks(text: string): EmbeddedLuaRegion[] {
  const regions: EmbeddedLuaRegion[] = [];
  let open = -1;
  let count = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== backtick || isEscaped(text, index)) {
      continue;
    }

    if (open === -1) {
      open = index;
      continue;
    }

    const contentStart = open + 1;
    const contentEnd = index;
    const luaText = text.slice(contentStart, contentEnd);
    if (luaText.trim().length > 0) {
      regions.push({
        id: `menu-backtick-${count}`,
        kind: 'chunk',
        luaText,
        hostRange: { start: open, end: index + 1 },
        luaContentRange: { start: contentStart, end: contentEnd },
        virtualPrefix: '',
        virtualSuffix: '',
      });
      count += 1;
    }
    open = -1;
  }

  return regions;
}

function extractMenuQuotedLua(text: string, settings: IeLuaSettings): EmbeddedLuaRegion[] {
  const regions: EmbeddedLuaRegion[] = [];
  const luaKeywordPattern = /\b([A-Za-z][A-Za-z0-9_ ]*?)\s+lua\s*/g;
  let expressionCount = 0;

  for (const match of text.matchAll(luaKeywordPattern)) {
    const key = normalizeMenuKey(match[1] ?? '');
    const quoteStart = match.index + match[0].length;
    const quoted = readQuotedString(text, quoteStart);
    if (!quoted) {
      continue;
    }
    regions.push({
      id: `menu-lua-expression-${expressionCount}`,
      kind: 'expression',
      key,
      luaText: quoted.content,
      hostRange: { start: match.index, end: quoted.range.end },
      luaContentRange: quoted.contentRange,
      virtualPrefix: 'return ',
      virtualSuffix: '',
    });
    expressionCount += 1;
  }

  const keys = [...settings.menu.blockKeys, ...settings.menu.expressionKeys]
    .map((key) => key.toLowerCase())
    .sort((a, b) => b.length - a.length);
  let genericCount = 0;

  for (const key of keys) {
    const keyPattern = new RegExp(`(^|\\n)([\\t ]*)(${escapeRegExp(key)})\\s*`, 'gi');
    for (const match of text.matchAll(keyPattern)) {
      const absoluteKeyStart =
        (match.index ?? 0) + (match[1]?.length ?? 0) + (match[2]?.length ?? 0);
      const quoteStart = (match.index ?? 0) + match[0].length;
      const quoted = readQuotedString(text, quoteStart);
      if (!quoted) {
        continue;
      }
      if (text.slice(absoluteKeyStart, quoteStart).toLowerCase().includes(' lua')) {
        continue;
      }

      const normalizedKey = normalizeMenuKey(match[3] ?? key);
      const isBlock = settings.menu.blockKeys
        .map((blockKey) => blockKey.toLowerCase())
        .includes(normalizedKey.toLowerCase());
      const isExpression = settings.menu.expressionKeys
        .map((expressionKey) => expressionKey.toLowerCase())
        .includes(normalizedKey.toLowerCase());
      if (!isBlock && !isExpression) {
        continue;
      }

      regions.push({
        id: `menu-quoted-${genericCount}`,
        kind: isBlock ? 'block' : 'expression',
        key: normalizedKey,
        luaText: quoted.content,
        hostRange: { start: absoluteKeyStart, end: quoted.range.end },
        luaContentRange: quoted.contentRange,
        virtualPrefix: isBlock ? '' : 'return ',
        virtualSuffix: '',
      });
      genericCount += 1;
    }
  }

  return dedupeRegions(regions);
}

export function mapVirtualOffsetToHost(region: EmbeddedLuaRegion, virtualOffset: number): number {
  const contentOffset = Math.max(0, virtualOffset - region.virtualPrefix.length);
  return Math.min(region.luaContentRange.end, region.luaContentRange.start + contentOffset);
}

export function getVirtualLuaText(region: EmbeddedLuaRegion): string {
  return `${region.virtualPrefix}${region.luaText}${region.virtualSuffix}`;
}

function readQuotedString(text: string, quoteStart: number): QuotedString | undefined {
  let index = quoteStart;
  while (
    text[index] === ' ' ||
    text[index] === '\t' ||
    text[index] === '\r' ||
    text[index] === '\n'
  ) {
    index += 1;
  }
  if (text[index] !== '"') {
    return undefined;
  }

  const contentStart = index + 1;
  let cursor = contentStart;
  while (cursor < text.length) {
    if (text[cursor] === '"' && !isEscaped(text, cursor)) {
      return {
        content: text.slice(contentStart, cursor),
        range: { start: index, end: cursor + 1 },
        contentRange: { start: contentStart, end: cursor },
      };
    }
    cursor += 1;
  }

  return undefined;
}

function dedupeRegions(regions: EmbeddedLuaRegion[]): EmbeddedLuaRegion[] {
  const seen = new Set<string>();
  return regions.filter((region) => {
    const key = `${region.luaContentRange.start}:${region.luaContentRange.end}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeMenuKey(key: string): string {
  return key.trim().replace(/\s+/g, ' ');
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
