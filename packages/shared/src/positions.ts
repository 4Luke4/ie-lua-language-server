import type { Position, SourceLocation } from './types';

export function createPositionMapper(text: string): (offset: number) => Position {
  const lineStarts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }
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

export function createLocationMapper(text: string): (start: number, end: number) => SourceLocation {
  const position = createPositionMapper(text);
  return (start, end) => ({
    offsetRange: { start, end },
    range: { start: position(start), end: position(end) },
  });
}
