import type { ApiSymbol } from '@ie-lua/shared';

const sourceSection = 'ee-game-structures-x64' as const;
const sourceDirectory = 'EE Game Structures (x64)';

export interface EeexStructureParseOptions {
  commit: string;
  indexPath: string;
  text: string;
}

/**
 * Converts one upstream RST index into structure and field symbols.
 *
 * Narrative paragraphs are intentionally excluded. The generated metadata is limited to
 * layout facts: names, types, offsets, sizes, source locations, and pinned provenance.
 */
export function parseEeexStructureSymbols(options: EeexStructureParseOptions): ApiSymbol[] {
  const anchors = [...options.text.matchAll(/^\.\. _(.+):\s*$/gmu)];
  const symbols: ApiSymbol[] = [];

  for (const [index, anchorMatch] of anchors.entries()) {
    const blockStart = anchorMatch.index ?? 0;
    const blockEnd = anchors[index + 1]?.index ?? options.text.length;
    const block = options.text.slice(blockStart, blockEnd);
    const lines = block.split(/\r?\n/u);
    const headerIndex = lines.findIndex(
      (line) => line.includes('**Offset**') && line.includes('**Field**'),
    );
    if (headerIndex === -1) {
      continue;
    }

    const structureName = normalizeRstInline(anchorMatch[1] ?? '');
    const header = lines[headerIndex] ?? '';
    const rawTotalSize = normalizeRstInline(header.match(/Size \(Total:\s*([^)]+)\)/u)?.[1] ?? '');
    const totalSize = /^\d+$/u.test(rawTotalSize) ? Number.parseInt(rawTotalSize, 10) : undefined;
    const anchorLine = lineNumberAt(options.text, blockStart);
    const fields: ApiSymbol[] = [];
    let tableStarted = false;

    for (let lineIndex = headerIndex + 1; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? '';
      if (!line.trim() && tableStarted) {
        break;
      }
      if (!line.startsWith('|')) {
        continue;
      }
      tableStarted = true;

      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => normalizeRstInline(cell));
      if (cells.length !== 4 || cells.some((cell) => cell.includes('**'))) {
        continue;
      }

      const offset = cells[0] ?? '';
      const rawSize = cells[1] ?? '';
      const dataType = cells[2] ?? '';
      const fieldName = cells[3] ?? '';
      if (!fieldName || fieldName === '<padding>') {
        continue;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(fieldName)) {
        throw new Error(
          `Unsupported x64 field name ${structureName}.${fieldName} in ${options.indexPath}`,
        );
      }

      const byteSize = /^\d+$/u.test(rawSize ?? '')
        ? Number.parseInt(rawSize ?? '', 10)
        : undefined;
      const qualifiedName = `${structureName}.${fieldName}`;
      fields.push({
        id: `${sourceSection}:${qualifiedName}`,
        name: qualifiedName,
        kind: 'field',
        sourceSection,
        signature: `${fieldName}: ${dataType}`,
        instanceName: fieldName,
        containerName: structureName,
        dataType,
        byteOffset: offset,
        ...(byteSize === undefined ? { sizeExpression: rawSize } : { byteSize }),
        documentationState: 'permission-gated',
        upstreamUrl: makeSourceUrl(options.commit, options.indexPath, anchorLine + lineIndex),
        upstreamCommit: options.commit,
        licenseStatus: 'permission-gated',
      });
    }

    symbols.push({
      id: `${sourceSection}:${structureName}`,
      name: structureName,
      kind: 'structure',
      sourceSection,
      signature:
        totalSize !== undefined
          ? `struct ${structureName} (${totalSize} bytes)`
          : rawTotalSize
            ? `struct ${structureName} (size ${rawTotalSize})`
            : `struct ${structureName}`,
      ...(totalSize !== undefined
        ? { byteSize: totalSize }
        : rawTotalSize
          ? { sizeExpression: rawTotalSize }
          : {}),
      memberCount: fields.length,
      documentationState: 'permission-gated',
      upstreamUrl: makeSourceUrl(options.commit, options.indexPath, anchorLine),
      upstreamCommit: options.commit,
      licenseStatus: 'permission-gated',
    });
    symbols.push(...fields);
  }

  return symbols;
}

function normalizeRstInline(value: string): string {
  return value
    .replace(/\\([\\:*_<>{}\[\]])/gu, '$1')
    .replace(/:ref:`([^`<]+)<[^`>]+>`/gu, '$1')
    .replace(/:ref:`([^`]+)`/gu, '$1')
    .replace(/``([^`]+)``/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

function makeSourceUrl(commit: string, indexPath: string, line: number): string {
  return `https://github.com/Bubb13/EEex-Docs/blob/${commit}/source/${encodePath(
    sourceDirectory,
  )}/${encodePath(indexPath)}#L${line}`;
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

function lineNumberAt(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}
