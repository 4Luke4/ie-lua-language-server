import type { Position, SourceLocation } from './types';

function indexLineStarts(text: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }
  return lineStarts;
}

export function createPositionMapper(text: string): (offset: number) => Position {
  const lineStarts = indexLineStarts(text);
  // Build once per analysis; each UTF-16 lookup then searches line starts, not the whole text.
  return (offset) => {
    const bounded = Math.max(0, Math.min(text.length, offset));
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (lineStarts[middle]! <= bounded) low = middle;
      else high = middle;
    }
    return { line: low, character: bounded - lineStarts[low]! };
  };
}

// Parser diagnostics arrive as line/column pairs, so the inverse mapping shares the same index
// rather than rescanning the document. A line beyond the last one resolves to the end of the text,
// and a character beyond the line's end is clamped to the text rather than to the line.
export function createOffsetMapper(text: string): (position: Position) => number {
  const lineStarts = indexLineStarts(text);
  return ({ line, character }) => {
    if (line >= lineStarts.length) return text.length;
    return Math.min(text.length, lineStarts[Math.max(0, line)]! + Math.max(0, character));
  };
}

export function createLocationMapper(text: string): (start: number, end: number) => SourceLocation {
  const position = createPositionMapper(text);
  return (start, end) => ({
    offsetRange: { start, end },
    range: { start: position(start), end: position(end) },
  });
}
