import type { EmbeddedLuaRegion, IeLuaSettings, TextRange } from './types';

interface QuotedString { content: string; range: TextRange; contentRange: TextRange }
export function extractEmbeddedLua(text: string, settings: IeLuaSettings): EmbeddedLuaRegion[] {
  const regions: EmbeddedLuaRegion[] = [];
  const blocks = new Set(settings.menu.blockKeys.map(key => key.toLowerCase().replace(/\s+/gu, ' ')));
  const expressions = new Set(settings.menu.expressionKeys.map(key => key.toLowerCase()));
  let i = 0;
  const add = (quoted: QuotedString, kind: EmbeddedLuaRegion['kind'], start: number, key?: string) => {
    if (!quoted.content.trim()) return;
    regions.push({ id: `menu-${regions.length}`, kind, ...(key ? { key } : {}), luaText: quoted.content,
      hostRange: { start, end: quoted.range.end }, luaContentRange: quoted.contentRange,
      virtualPrefix: kind === 'expression' ? 'return ' : '', virtualSuffix: '' });
  };
  while (i < text.length) {
    if (text.startsWith('//', i)) { const end = text.indexOf('\n', i); i = end < 0 ? text.length : end; continue; }
    if (text.startsWith('/*', i)) { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
    if (text[i] === '`') {
      const quoted = readQuotedString(text, i, '`')!;
      add(quoted, 'chunk', i); i = quoted.range.end; continue;
    }
    // Skip ordinary DSL strings, so words inside labels cannot start embedded regions.
    if (text[i] === '"') { i = readQuotedString(text, i)!.range.end; continue; }
    if (!/[A-Za-z_]/u.test(text[i] ?? '')) { i++; continue; }
    const start = i;
    while (/[A-Za-z0-9_]/u.test(text[i] ?? '')) i++;
    let key = text.slice(start, i).toLowerCase();
    if (key === 'on') {
      const escape = text.slice(i).match(/^\s+escape\b/iu);
      if (escape) { key = 'on escape'; i += escape[0].length; }
    }
    while (/\s/u.test(text[i] ?? '')) i++;
    const explicit = text.slice(i).match(/^lua\b\s*/iu);
    if (explicit) i += explicit[0].length;
    const quoted = readQuotedString(text, i);
    if (!quoted) continue;
    if (explicit || blocks.has(key) || expressions.has(key)) add(quoted, explicit || expressions.has(key) ? 'expression' : 'block', start, key);
    i = quoted.range.end;
  }
  return regions;
}

export function mapVirtualOffsetToHost(region: EmbeddedLuaRegion, virtualOffset: number): number {
  const contentOffset = Math.max(0, virtualOffset - region.virtualPrefix.length);
  return Math.min(region.luaContentRange.end, region.luaContentRange.start + contentOffset);
}
export function getVirtualLuaText(region: EmbeddedLuaRegion): string {
  return `${region.virtualPrefix}${region.luaText}${region.virtualSuffix}`;
}
function readQuotedString(text: string, start: number, delimiter = '"'): QuotedString | undefined {
  if (text[start] !== delimiter) return undefined;
  let cursor = start + 1;
  while (cursor < text.length) {
    if (text[cursor] === '\\') { cursor += 2; continue; }
    if (text[cursor] === delimiter) break;
    cursor++;
  }
  const end = Math.min(cursor, text.length);
  // An unclosed region still supplies useful completion while a user is typing.
  return { content: text.slice(start + 1, end), range: { start, end: Math.min(end + 1, text.length) }, contentRange: { start: start + 1, end } };
}
