import type { ApiCallableAlias, ApiParameter, ApiReturn, ApiSymbol } from '@ie-lua/shared';

export interface GameFunctionDocument {
  commit: string;
  indexDescription?: string;
  sourcePath: string;
  text: string;
}

export interface EeexFunctionIndex {
  commit: string;
  sourcePath: string;
  text: string;
}

interface GridTable {
  rows: string[][];
}

export function parseGameFunctionSymbol(document: GameFunctionDocument): ApiSymbol {
  const text = normalize(document.text);
  const lines = text.split('\n');
  const anchorMatches = [...text.matchAll(/^\.\. _(.+):\s*$/gmu)];
  if (anchorMatches.length !== 1) {
    throw new Error(`${document.sourcePath}: expected exactly one RST anchor`);
  }

  const titleIndex = findTitleLine(lines);
  const title = unescapeRst(lines[titleIndex]?.trim() ?? '');
  const signatureBlock = findFirstLiteralBlock(lines, titleIndex + 2);
  const signature = signatureBlock.lines.join('\n').trim();
  const callable = parseCallableSignature(signature, document.sourcePath);
  const legacyTitle = document.sourcePath
    .split('/')
    .at(-1)
    ?.replace(/\.rst$/u, '');
  if (title !== callable.name && title !== legacyTitle) {
    throw new Error(
      `${document.sourcePath}: title ${JSON.stringify(title)} does not match signature ${JSON.stringify(callable.name)}`,
    );
  }

  const placeholder = lines.some((line) => line.trim() === '.. description');
  const bodyLines = lines.slice(titleIndex + 2);
  bodyLines.splice(signatureBlock.end - (titleIndex + 2), 0);
  bodyLines.splice(
    signatureBlock.start - (titleIndex + 2),
    signatureBlock.end - signatureBlock.start,
  );
  const renderedSource = bodyLines
    .map((line) => (line.trim() === '.. description' ? (document.indexDescription ?? '') : line))
    .join('\n');
  const parameters = parseGameParameters(text, callable.parameterNames);
  const returns = parseGameReturns(text);
  const { containerName, instanceName } = splitCallableName(callable.name);
  const sourceLine = lines.findIndex((line) => line.trim() === signature) + 1;
  const documentationMarkdown = renderRstMarkdown(renderedSource, document.sourcePath);

  return {
    id: `ee-game-lua-functions:${callable.name}`,
    name: callable.name,
    kind: containerName ? 'method' : 'function',
    sourceSection: 'ee-game-lua-functions',
    signature,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(returns.length > 0 ? { returns } : {}),
    ...(containerName ? { containerName, instanceName } : {}),
    ...(documentationMarkdown ? { documentationMarkdown } : {}),
    documentationState: placeholder && !document.indexDescription ? 'undocumented' : 'documented',
    upstreamUrl: githubSourceUrl(document.commit, document.sourcePath, sourceLine),
    upstreamCommit: document.commit,
    licenseStatus: 'allowed',
  };
}

export function parseGameIndexDescriptions(text: string, sourcePath: string): Map<string, string> {
  const normalized = normalize(text);
  const result = new Map<string, string>();
  for (const table of findGridTables(normalized, sourcePath)) {
    for (const row of table.rows.slice(1)) {
      if (row.length < 2) {
        continue;
      }
      const reference = row[0]?.match(/:ref:`(?:[^`<]*<)?([^>`]+)>?`/u)?.[1];
      if (!reference) {
        continue;
      }
      if (result.has(reference)) {
        throw new Error(`${sourcePath}: duplicate index description for ${reference}`);
      }
      result.set(reference, renderInline(row[1]?.trim() ?? ''));
    }
  }
  return result;
}

export function parseEeexFunctionSymbols(index: EeexFunctionIndex): ApiSymbol[] {
  const text = normalize(index.text);
  const matches = [...text.matchAll(/^\.\. _(EEex_.+):\s*$/gmu)];
  const symbols = matches.map((match, matchIndex) => {
    const rawAnchor = match[1] ?? '';
    const name = rawAnchor.endsWith('()') ? rawAnchor.slice(0, -2) : rawAnchor;
    if (!/^EEex_[A-Za-z0-9_]+(?:[.:][A-Za-z_][A-Za-z0-9_]*)?$/u.test(name)) {
      throw new Error(`${index.sourcePath}: malformed EEex function anchor ${rawAnchor}`);
    }
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[matchIndex + 1]?.index ?? text.length;
    const segment = text.slice(start, end);
    const segmentLines = segment.split('\n');
    const titleIndex = findTitleLine(segmentLines);
    const title = unescapeRst(segmentLines[titleIndex]?.trim() ?? '');
    if (title.replace(/\(\)$/u, '') !== name) {
      throw new Error(`${index.sourcePath}: anchor ${rawAnchor} does not match heading ${title}`);
    }

    const body = segmentLines.slice(titleIndex + 2).join('\n');
    const parameters = parseEeexTable(body, '**Parameters:**', index.sourcePath).map(
      (row): ApiParameter => ({
        name: plainInline(row[0] ?? ''),
        ...(plainInline(row[1] ?? '') ? { type: plainInline(row[1] ?? '') } : {}),
        ...(plainInline(row[2] ?? '') ? { defaultValue: plainInline(row[2] ?? '') } : {}),
        ...(renderInline(row[3] ?? '') ? { description: renderInline(row[3] ?? '') } : {}),
      }),
    );
    const returns = parseEeexTable(body, '**Return Values:**', index.sourcePath).map(
      (row): ApiReturn => ({
        ...(plainInline(row[0] ?? '') ? { type: plainInline(row[0] ?? '') } : {}),
        ...(renderInline(row[1] ?? '') ? { description: renderInline(row[1] ?? '') } : {}),
      }),
    );
    const aliases = parseCallableAliases(body, parameters, index.sourcePath);
    const { containerName, instanceName } = splitCallableName(name);
    const signature = `${name}(${parameters.map((parameter) => parameter.name).join(', ')})`;
    const documentationMarkdown = renderRstMarkdown(body, index.sourcePath);
    const anchorLine = text.slice(0, match.index ?? 0).split('\n').length;

    return {
      id: `eeex-functions:${name}`,
      name,
      kind: containerName ? 'method' : 'function',
      sourceSection: 'eeex-functions',
      signature,
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(returns.length > 0 ? { returns } : {}),
      ...(aliases.length > 0 ? { callableAliases: aliases } : {}),
      ...(containerName ? { containerName, instanceName } : {}),
      ...(documentationMarkdown ? { documentationMarkdown } : {}),
      documentationState: /This function is currently undocumented\./u.test(body)
        ? 'undocumented'
        : 'documented',
      upstreamUrl: githubSourceUrl(index.commit, index.sourcePath, anchorLine),
      upstreamCommit: index.commit,
      licenseStatus: 'allowed',
    } satisfies ApiSymbol;
  });

  const ids = new Set<string>();
  for (const symbol of symbols) {
    if (ids.has(symbol.id)) {
      throw new Error(`${index.sourcePath}: duplicate EEex function ${symbol.name}`);
    }
    ids.add(symbol.id);
  }
  return symbols;
}

export function renderRstMarkdown(source: string, sourcePath = '<rst>'): string {
  const lines = normalize(source).split('\n');
  const output: string[] = [];
  let index = 0;
  const pushBlank = (): void => {
    if (output.length > 0 && output.at(-1) !== '') output.push('');
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      pushBlank();
      index += 1;
      continue;
    }

    if (/^\.\. _.*:\s*$/u.test(line)) {
      index += 1;
      continue;
    }
    if (/^\.\. \|rarr\| unicode:: U\+2192\s*$/u.test(line)) {
      index += 1;
      continue;
    }
    if (/^\.\. role:: (?:raw-html\(raw\)|underline|bold-italic)\s*$/u.test(line)) {
      index += 1;
      while (index < lines.length && (/^\s+:/u.test(lines[index] ?? '') || !lines[index]?.trim())) {
        index += 1;
      }
      continue;
    }
    if (line.trim() === '.. description') {
      index += 1;
      continue;
    }

    const directive = line.match(/^\.\. (admonition|note|Note|warning)::(?:\s*(.*))?$/u);
    if (directive) {
      const kind = directive[1]?.toLowerCase() ?? 'note';
      const argument = directive[2]?.trim();
      const title = kind === 'admonition' ? argument || 'Note' : capitalize(kind);
      const block = readIndentedBlock(lines, index + 1);
      const bodyLines =
        kind !== 'admonition' && argument ? [argument, ...block.lines] : block.lines;
      pushBlank();
      output.push(`> **${renderInline(title)}**`);
      for (const bodyLine of renderRstMarkdown(bodyLines.join('\n'), sourcePath).split('\n')) {
        output.push(bodyLine ? `> ${bodyLine}` : '>');
      }
      pushBlank();
      index = block.end;
      continue;
    }

    const codeBlock = line.match(/^\.\. code-block::\s*([A-Za-z0-9_-]*)\s*$/u);
    if (codeBlock) {
      const block = readIndentedBlock(lines, index + 1);
      pushBlank();
      output.push(`\`\`\`${codeBlock[1] || 'text'}`, ...block.lines, '\`\`\`', '');
      index = block.end;
      continue;
    }

    if (/^\.\. [A-Za-z][A-Za-z0-9_-]*::/u.test(line)) {
      throw new Error(`${sourcePath}:${index + 1}: unsupported RST directive ${line.trim()}`);
    }

    if (line.trim() === '::') {
      const block = readIndentedBlock(lines, index + 1);
      if (block.lines.length === 0) {
        throw new Error(`${sourcePath}:${index + 1}: empty literal block`);
      }
      pushBlank();
      output.push('```lua', ...block.lines, '```', '');
      index = block.end;
      continue;
    }

    if (/^\+[+=-]+\+.*\+\s*$/u.test(line)) {
      const parsed = parseGridTable(lines, index, sourcePath);
      pushBlank();
      output.push(...gridTableToMarkdown(parsed.table), '');
      index = parsed.end;
      continue;
    }

    const decoration = /^[=*^~-]{3,}\s*$/u;
    if (
      decoration.test(line) &&
      lines[index + 1]?.trim() &&
      decoration.test(lines[index + 2] ?? '')
    ) {
      pushBlank();
      output.push(`#### ${renderInline(lines[index + 1]?.trim() ?? '')}`, '');
      index += 3;
      continue;
    }

    if (decoration.test(line)) {
      pushBlank();
      output.push('---', '');
      index += 1;
      continue;
    }

    const nextLine = lines[index + 1] ?? '';
    if (/^[=*^~-]{3,}\s*$/u.test(nextLine) && nextLine.trim().length >= line.trim().length) {
      const level = nextLine.trim().startsWith('=') ? '##' : '####';
      pushBlank();
      output.push(`${level} ${renderInline(line.trim())}`, '');
      index += 2;
      continue;
    }

    if (/^\s*[*-]\s+/u.test(line)) {
      output.push(
        line
          .replace(/^(\s*)[*-]\s+/u, '$1- ')
          .replace(
            /^(\s*-\s+)(.*)$/u,
            (_m, prefix: string, content: string) => `${prefix}${renderInline(content)}`,
          ),
      );
      index += 1;
      continue;
    }

    if (/^\s+\S/u.test(line)) {
      throw new Error(`${sourcePath}:${index + 1}: unsupported non-empty indented construct`);
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index]?.trim() && !isBlockStart(lines, index)) {
      if (/^\s+\S/u.test(lines[index] ?? '')) {
        throw new Error(`${sourcePath}:${index + 1}: unsupported paragraph indentation`);
      }
      paragraph.push(lines[index]?.trim() ?? '');
      index += 1;
    }
    output.push(renderInline(paragraph.join(' ')));
  }

  return output
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function parseCallableAliases(
  body: string,
  parameters: ApiParameter[],
  sourcePath: string,
): ApiCallableAlias[] {
  const aliases: ApiCallableAlias[] = [];
  const instanceMatch = body.match(/^\*\*Instance Name:\*\*\s+``([^`]+)``\s*$/mu);
  if (instanceMatch?.[1]) {
    const receiverType = parameters[0]?.type;
    if (!receiverType) {
      throw new Error(`${sourcePath}: instance alias ${instanceMatch[1]} has no typed receiver`);
    }
    aliases.push({
      name: instanceMatch[1],
      receiverType,
      consumesFirstParameter: true,
    });
  }
  const globalMatch = body.match(/^\*\*Aliases:\*\*\s+(.+)$/mu);
  if (globalMatch?.[1]) {
    const names = [...globalMatch[1].matchAll(/``([^`]+)``/gu)].map((match) => match[1] ?? '');
    if (names.length === 0) {
      throw new Error(`${sourcePath}: malformed global aliases declaration`);
    }
    aliases.push(...names.map((name) => ({ name, consumesFirstParameter: false })));
  }
  return aliases;
}

function parseEeexTable(body: string, heading: string, sourcePath: string): string[][] {
  const headingIndex = body.indexOf(heading);
  if (headingIndex === -1) return [];
  const afterHeading = body.slice(headingIndex + heading.length);
  const lines = afterHeading.split('\n');
  const tableIndex = lines.findIndex((line) => /^\+[+=-]+\+.*\+\s*$/u.test(line));
  if (tableIndex === -1) {
    throw new Error(`${sourcePath}: ${heading} is missing its grid table`);
  }
  const parsed = parseGridTable(lines, tableIndex, sourcePath).table;
  return parsed.rows.slice(1);
}

function parseGameParameters(text: string, signatureNames: string[]): ApiParameter[] {
  const section = extractBoldSection(text, 'Parameters');
  if (!section || /^\s*None\s*$/u.test(section)) return [];
  const parameters: ApiParameter[] = [];
  for (const match of section.matchAll(/^\*\s+``([^`]+)``\s+\*([^*]+)\*\s+-\s+(.+)$/gmu)) {
    parameters.push({
      ...(match[1]?.trim() ? { type: match[1].trim() } : {}),
      name: match[2]?.trim() ?? '',
      description: renderInline(match[3]?.trim() ?? ''),
    });
  }
  // A small number of upstream pages retain legacy parameter prose even though
  // their documented callable signature takes no arguments. Keep that prose in
  // the rendered documentation, while treating the signature as authoritative
  // for callable metadata.
  if (signatureNames.length === 0) return [];
  if (parameters.length !== signatureNames.length) {
    throw new Error(`parameter metadata does not match signature (${signatureNames.join(', ')})`);
  }
  for (const [index, name] of signatureNames.entries()) {
    if (parameters[index]?.name !== name) {
      throw new Error(`parameter metadata order does not match signature: ${name}`);
    }
  }
  return parameters;
}

function parseGameReturns(text: string): ApiReturn[] {
  const section = extractBoldSection(text, 'Returns');
  if (!section || /^\s*None\s*$/u.test(section)) return [];
  return [{ description: renderRstMarkdown(section) }];
}

function extractBoldSection(text: string, name: string): string | undefined {
  const match = text.match(
    new RegExp(
      `^\\*\\*${name}\\*\\*\\s*$([\\s\\S]*?)(?=^\\*\\*[^*]+\\*\\*\\s*$|(?![\\s\\S]))`,
      'mu',
    ),
  );
  return match?.[1]?.trim();
}

function parseCallableSignature(
  signature: string,
  sourcePath: string,
): { name: string; parameterNames: string[] } {
  const match = signature.match(
    /^([A-Za-z_][A-Za-z0-9_]*(?:(?:[.:])[A-Za-z_][A-Za-z0-9_]*)*)\s*\(([^)]*)\)$/u,
  );
  if (!match?.[1]) throw new Error(`${sourcePath}: malformed callable signature ${signature}`);
  const parameterNames = (match[2] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return { name: match[1], parameterNames };
}

function splitCallableName(name: string): { containerName?: string; instanceName?: string } {
  const separator = Math.max(name.lastIndexOf('.'), name.lastIndexOf(':'));
  return separator === -1
    ? {}
    : { containerName: name.slice(0, separator), instanceName: name.slice(separator + 1) };
}

function findTitleLine(lines: string[]): number {
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    const underline = lines[index + 1]?.trim() ?? '';
    if (line && /^[=^~-]{3,}$/u.test(underline) && underline.length >= line.length) return index;
  }
  throw new Error('missing RST title');
}

function findFirstLiteralBlock(
  lines: string[],
  start: number,
): { start: number; end: number; lines: string[] } {
  const marker = lines.findIndex((line, index) => index >= start && line.trim() === '::');
  if (marker === -1) throw new Error('missing signature literal block');
  const block = readIndentedBlock(lines, marker + 1);
  return { start: marker, end: block.end, lines: block.lines };
}

function readIndentedBlock(lines: string[], start: number): { end: number; lines: string[] } {
  let index = start;
  while (index < lines.length && !lines[index]?.trim()) index += 1;
  const blockStart = index;
  while (index < lines.length && (!lines[index]?.trim() || /^\s/u.test(lines[index] ?? '')))
    index += 1;
  const raw = lines.slice(blockStart, index);
  while (raw.length > 0 && !raw.at(-1)?.trim()) raw.pop();
  const nonEmpty = raw.filter((line) => line.trim());
  if (nonEmpty.length === 0) return { end: index, lines: [] };
  const indent = Math.min(...nonEmpty.map((line) => line.match(/^\s*/u)?.[0].length ?? 0));
  return { end: index, lines: raw.map((line) => line.slice(Math.min(indent, line.length))) };
}

function findGridTables(text: string, sourcePath: string): GridTable[] {
  const lines = text.split('\n');
  const tables: GridTable[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\+[+=-]+\+.*\+\s*$/u.test(lines[index] ?? '')) continue;
    const parsed = parseGridTable(lines, index, sourcePath);
    tables.push(parsed.table);
    index = parsed.end - 1;
  }
  return tables;
}

function parseGridTable(
  lines: string[],
  start: number,
  sourcePath: string,
): { table: GridTable; end: number } {
  const border = lines[start] ?? '';
  const boundaries = [...border.matchAll(/\+/gu)].map((match) => match.index ?? 0);
  if (boundaries.length < 3 || boundaries.at(-1) !== border.trimEnd().length - 1) {
    throw new Error(`${sourcePath}:${start + 1}: malformed grid table border`);
  }
  const rows: string[][] = [];
  let index = start + 1;
  let rowLines: string[] = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\+[+=-]+\+.*\+\s*$/u.test(line)) {
      if (rowLines.length > 0) {
        rows.push(
          boundaries.slice(0, -1).map((boundary, column) =>
            rowLines
              .map((rowLine) => rowLine.slice(boundary + 1, boundaries[column + 1]).trim())
              .filter(Boolean)
              .join(' '),
          ),
        );
        rowLines = [];
      }
      const next = lines[index + 1] ?? '';
      if (!next.startsWith('|')) return { table: { rows }, end: index + 1 };
      continue;
    }
    if (!line.startsWith('|') || line.length < boundaries.at(-1)!) {
      throw new Error(`${sourcePath}:${index + 1}: malformed grid table row`);
    }
    rowLines.push(line);
  }
  throw new Error(`${sourcePath}:${start + 1}: unterminated grid table`);
}

function gridTableToMarkdown(table: GridTable): string[] {
  if (table.rows.length === 0) return [];
  const width = table.rows[0]?.length ?? 0;
  if (width === 0 || table.rows.some((row) => row.length !== width))
    throw new Error('inconsistent grid table');
  const renderRow = (row: string[]): string =>
    `| ${row.map((cell) => escapeTableCell(renderInline(cell))).join(' | ')} |`;
  return [
    renderRow(table.rows[0] ?? []),
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...table.rows.slice(1).map(renderRow),
  ];
}

function renderInline(value: string): string {
  const rendered = unescapeRst(value)
    .replace(/:raw-html:`(<\/?pre>|<br\s*\/?>)`/giu, (_match, html: string) =>
      html.toLowerCase().startsWith('<br') ? '<br/>' : html.toLowerCase(),
    )
    .replace(/:bold-italic:`([^`]+)`/gu, '***$1***')
    .replace(/:underline:`([^`]+)`/gu, '<u>$1</u>')
    .replace(
      /:ref:`([^`<]*)<([^`>]+)>`/gu,
      (_match, label: string, target: string) => `[${label}](#${target})`,
    )
    .replace(/:ref:`([^`]+)`/gu, (_match, label: string) => `[${label}](#${label})`)
    .replace(/:ref:``/gu, '')
    .replace(/`([^`<]+) <(https?:\/\/[^>]+)>`_/gu, '[$1]($2)')
    .replace(/``([^`]+)``/gu, '`$1`')
    .replace(/\|rarr\|/gu, '→');
  const unsupportedRole = rendered.match(/:[A-Za-z][A-Za-z0-9_-]*:`/u)?.[0];
  if (unsupportedRole) throw new Error(`unsupported inline RST role ${unsupportedRole}`);
  const unsupportedSubstitution = rendered.match(/\|[A-Za-z][A-Za-z0-9_-]*\|/u)?.[0];
  if (unsupportedSubstitution) {
    throw new Error(`unsupported RST substitution ${unsupportedSubstitution}`);
  }
  return rendered;
}

function plainInline(value: string): string {
  return unescapeRst(value)
    .replace(/``([^`]+)``/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeTableCell(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|').replace(/\n/gu, '<br/>');
}

function unescapeRst(value: string): string {
  return value.replace(/\\(.)/gu, '$1');
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';
  const next = lines[index + 1] ?? '';
  return (
    /^\.\./u.test(line) ||
    line.trim() === '::' ||
    /^\+[+=-]+\+.*\+\s*$/u.test(line) ||
    /^\s*[*-]\s+/u.test(line) ||
    (/^[=*^~-]{3,}\s*$/u.test(next) && next.trim().length >= line.trim().length) ||
    /^[=*^~-]{3,}\s*$/u.test(line)
  );
}

function normalize(value: string): string {
  return value.replace(/\r\n?/gu, '\n');
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function githubSourceUrl(commit: string, sourcePath: string, line: number): string {
  return `https://github.com/Bubb13/EEex-Docs/blob/${commit}/${sourcePath.split('/').map(encodeURIComponent).join('/')}#L${line}`;
}
