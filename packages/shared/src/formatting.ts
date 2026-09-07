import { luaProtectedRanges } from './bindings';
import type { TextRange } from './types';

export function trailingWhitespaceEdits(text: string): TextRange[] {
  const protectedRanges = luaProtectedRanges(text);
  const edits: TextRange[] = [];
  let protectedIndex = 0;
  for (const match of text.matchAll(/[ \t]+(?=\r\n|\r|\n|$)/gu)) {
    const start = match.index;
    const end = start + match[0].length;
    while (protectedRanges[protectedIndex] && protectedRanges[protectedIndex]!.end <= start) {
      protectedIndex++;
    }
    const protectedRange = protectedRanges[protectedIndex];
    if (!protectedRange || protectedRange.start >= end) edits.push({ start, end });
  }
  return edits;
}
