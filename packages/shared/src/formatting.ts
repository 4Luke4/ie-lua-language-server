import { luaProtectedRanges } from './bindings';
import type { TextRange } from './types';

export function trailingWhitespaceEdits(text: string): TextRange[] {
  const protectedRanges = luaProtectedRanges(text);
  const edits: TextRange[] = [];
  let protectedIndex = 0;
  let start: number | undefined;
  // A single pass avoids regex backtracking on long whitespace runs before ordinary text.
  for (let end = 0; end <= text.length; end++) {
    const character = text[end];
    if (character === ' ' || character === '\t') {
      start ??= end;
      continue;
    }
    if (start !== undefined && (character === '\r' || character === '\n' || end === text.length)) {
      while (protectedRanges[protectedIndex] && protectedRanges[protectedIndex]!.end <= start) {
        protectedIndex++;
      }
      const protectedRange = protectedRanges[protectedIndex];
      if (!protectedRange || protectedRange.start >= end) edits.push({ start, end });
    }
    start = undefined;
  }
  return edits;
}
