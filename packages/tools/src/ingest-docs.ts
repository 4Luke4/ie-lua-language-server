import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ApiIndexManifest,
  ApiSectionFile,
  ApiSymbol,
  ApiSource,
  SourceSectionId,
} from '@ie-lua/shared';
import { parseEeexStructureSymbols } from './eeex-structures';

const repoRoot = path.resolve(__dirname, '../..');
const outputDirectory = path.resolve(repoRoot, 'resources/api');
const outputPath = path.resolve(outputDirectory, 'api-index.json');
const sectionDirectory = path.resolve(outputDirectory, 'sections');
const lua52ManualUrl = 'https://www.lua.org/manual/5.2/manual.html';
const luaJitExtensionUrls = [
  'https://luajit.org/extensions.html',
  'https://luajit.org/ext_ffi_api.html',
  'https://luajit.org/ext_jit.html',
] as const;
const allowedLua52Sections = new Set(['6.1', '6.4', '6.5', '6.6', '6.7', '6.10']);
const lua52ModuleSections = {
  '6.4': 'string',
  '6.5': 'table',
  '6.6': 'math',
  '6.7': 'bit32',
  '6.10': 'debug',
} satisfies Record<string, string>;

function makeSources(eeexCommit: string | undefined): ApiSource[] {
  const eeexRef = eeexCommit ?? 'dev';
  return [
    {
      id: 'ee-game-lua-functions',
      title: 'EE Game Lua Functions',
      url: `https://github.com/Bubb13/EEex-Docs/tree/${eeexRef}/source/EE%20Game%20Lua%20Functions`,
      ...(eeexCommit ? { commit: eeexCommit } : {}),
      licenseStatus: 'permission-gated',
    },
    {
      id: 'eeex-functions',
      title: 'EEex Functions',
      url: `https://github.com/Bubb13/EEex-Docs/tree/${eeexRef}/source/EEex%20Functions`,
      ...(eeexCommit ? { commit: eeexCommit } : {}),
      licenseStatus: 'permission-gated',
    },
    {
      id: 'ee-game-structures-x64',
      title: 'EE Game Structures (x64)',
      url: `https://github.com/Bubb13/EEex-Docs/tree/${eeexRef}/source/EE%20Game%20Structures%20(x64)`,
      ...(eeexCommit ? { commit: eeexCommit } : {}),
      licenseStatus: 'permission-gated',
    },
    {
      id: 'lua52',
      title: 'Lua 5.2',
      url: 'https://www.lua.org/manual/5.2/',
      licenseStatus: 'allowed',
    },
    {
      id: 'luajit',
      title: 'LuaJIT',
      url: 'https://luajit.org/',
      licenseStatus: 'allowed',
    },
    {
      id: 'ee-utility-functions',
      title: 'EE Utility Functions',
      url: 'local-untracked:samples/util.lua',
      licenseStatus: 'permission-gated',
    },
  ];
}

const sectionFiles = {
  'ee-game-lua-functions': 'sections/ee-game-lua-functions.json',
  'eeex-functions': 'sections/eeex-functions.json',
  'ee-game-structures-x64': 'sections/ee-game-structures-x64.json',
  lua52: 'sections/lua52.json',
  luajit: 'sections/luajit.json',
  'ee-utility-functions': 'sections/ee-utility-functions.json',
} satisfies Record<SourceSectionId, string>;

async function main(): Promise<void> {
  const shouldFetchEeex = process.env.IE_LUA_FETCH_EEEX === '1';
  const eeexCommit = shouldFetchEeex ? await resolveEeexCommit() : readExistingEeexCommit();
  const symbols: ApiSymbol[] = [
    ...(process.env.IE_LUA_SCAN_LOCAL_UTIL === '1'
      ? scanUtilityFunctions(path.resolve(repoRoot, 'samples/util.lua'))
      : []),
    ...(await makeLua52Symbols()),
    ...(await makeLuaJitSymbols()),
    ...(!shouldFetchEeex ? loadExistingEeexSymbols() : []),
  ];

  if (shouldFetchEeex && eeexCommit) {
    symbols.push(...(await fetchEeexSymbols(eeexCommit)));
  }

  const sources = makeSources(eeexCommit);
  const generatedAt = new Date().toISOString();
  const dedupedSymbols = dedupeSymbols(symbols);
  const symbolsBySection = groupSymbolsBySection(dedupedSymbols, sources);
  const index: ApiIndexManifest = {
    schemaVersion: 1,
    generatedAt,
    sources,
    sections: sources.map((source) => ({
      id: source.id,
      title: source.title,
      file: sectionFiles[source.id],
      symbolCount: symbolsBySection.get(source.id)?.length ?? 0,
      licenseStatus: source.licenseStatus,
    })),
  };

  fs.mkdirSync(sectionDirectory, { recursive: true });
  for (const source of sources) {
    const section: ApiSectionFile = {
      schemaVersion: 1,
      generatedAt,
      source,
      symbols: symbolsBySection.get(source.id) ?? [],
    };
    fs.writeFileSync(
      path.resolve(outputDirectory, sectionFiles[source.id]),
      `${JSON.stringify(section, null, 2)}\n`,
      'utf8',
    );
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

async function makeLua52Symbols(): Promise<ApiSymbol[]> {
  const html = await fetchText(lua52ManualUrl);
  return [
    ...makeLua52KeywordSymbols(html),
    ...makeLua52ModuleSymbols(html),
    ...makeLua52ManualEntrySymbols(html),
  ];
}

function makeLua52KeywordSymbols(html: string): ApiSymbol[] {
  const blockMatch = html.match(
    /The following[\s\S]{0,200}?are reserved\s+and cannot be used as names:\s*<pre>([\s\S]*?)<\/pre>/u,
  );
  if (!blockMatch?.[1]) {
    throw new Error('Unable to locate Lua 5.2 keyword block in official manual.');
  }

  const keywordBlock = normalizePreText(blockMatch[1]);
  const keywords = keywordBlock.split(/\s+/u).filter(Boolean);
  const documentationMarkdown = [
    'The following keywords are reserved and cannot be used as names:',
    '',
    '```lua',
    keywordBlock,
    '```',
  ].join('\n');

  return keywords.map((name) => ({
    id: `lua52:keyword:${name}`,
    name,
    kind: 'keyword',
    sourceSection: 'lua52',
    signature: name,
    documentationMarkdown,
    documentationState: 'documented',
    upstreamUrl: `${lua52ManualUrl}#3.1`,
    licenseStatus: 'allowed',
  }));
}

function makeLua52ModuleSymbols(html: string): ApiSymbol[] {
  const sections = collectLua52Sections(html);
  return Object.entries(lua52ModuleSections).map(([sectionNumber, moduleName]) => {
    const section = sections.find((candidate) => candidate.number === sectionNumber);
    if (!section) {
      throw new Error(`Unable to locate Lua 5.2 manual section ${sectionNumber}.`);
    }

    return {
      id: `lua52:${moduleName}`,
      name: moduleName,
      kind: 'module',
      sourceSection: 'lua52',
      signature: moduleName,
      documentationMarkdown: htmlToMarkdown(firstParagraph(section.html)),
      documentationState: 'documented',
      upstreamUrl: `${lua52ManualUrl}#${sectionNumber}`,
      licenseStatus: 'allowed',
    } satisfies ApiSymbol;
  });
}

function makeLua52ManualEntrySymbols(html: string): ApiSymbol[] {
  const sections = collectLua52Sections(html);
  const headingPattern = /<hr><h3><a name="pdf-([^"]+)"><code>([\s\S]*?)<\/code><\/a><\/h3>/giu;
  const matches = [...html.matchAll(headingPattern)];
  const symbols: ApiSymbol[] = [];

  for (const [index, match] of matches.entries()) {
    const name = decodeHtml(match[1] ?? '');
    const start = (match.index ?? 0) + match[0].length;
    const nextEntryStart = index + 1 < matches.length ? matches[index + 1]?.index : undefined;
    const end = Math.min(nextEntryStart ?? html.length, findNextMajorHeading(html, start));
    const section = findSectionAt(sections, match.index ?? 0);
    if (!section || !allowedLua52Sections.has(section.number)) {
      continue;
    }

    const signature = htmlInlineToText(match[2] ?? '');
    const documentationMarkdown = htmlToMarkdown(html.slice(start, end));
    symbols.push({
      id: `lua52:${name}`,
      name,
      kind: signature.includes('(') ? 'function' : 'variable',
      sourceSection: 'lua52',
      signature,
      documentationMarkdown,
      documentationState: documentationMarkdown ? 'documented' : 'undocumented',
      upstreamUrl: `${lua52ManualUrl}#pdf-${encodeURIComponent(name)}`,
      licenseStatus: 'allowed',
    });
  }

  return symbols;
}

async function makeLuaJitSymbols(): Promise<ApiSymbol[]> {
  const pages = await Promise.all(
    luaJitExtensionUrls.map(async (url) => ({
      url,
      html: await fetchText(url),
    })),
  );

  return pages.flatMap(({ url, html }) => makeLuaJitPageSymbols(url, html));
}

function makeLuaJitPageSymbols(url: string, html: string): ApiSymbol[] {
  const headingPattern = /<h3[^>]*>\s*<tt>([\s\S]*?)<\/tt>[\s\S]*?<\/h3>/giu;
  const matches = [...html.matchAll(headingPattern)];
  const symbols: ApiSymbol[] = [];

  for (const [index, match] of matches.entries()) {
    const start = (match.index ?? 0) + match[0].length;
    const nextEntryStart = index + 1 < matches.length ? matches[index + 1]?.index : undefined;
    const end = Math.min(nextEntryStart ?? html.length, findNextMajorHeading(html, start));
    const signature = htmlInlineToText(match[1] ?? '');
    const documentationMarkdown = htmlToMarkdown(html.slice(start, end));
    const names = extractLuaJitSymbolNames(signature);

    for (const name of names) {
      symbols.push({
        id: `luajit:${name}`,
        name,
        kind: signature.includes('(') ? 'function' : 'variable',
        sourceSection: 'luajit',
        signature,
        documentationMarkdown,
        documentationState: documentationMarkdown ? 'documented' : 'undocumented',
        upstreamUrl: url,
        licenseStatus: 'allowed',
      });
    }
  }

  symbols.push(...makeLuaJitModuleSymbols(html, url));
  return symbols;
}

function makeLuaJitModuleSymbols(html: string, url: string): ApiSymbol[] {
  const moduleSymbols: ApiSymbol[] = [];
  const moduleHeadingPattern = /<h3[^>]*>\s*<tt>((?:bit|ffi|jit)\.\*)<\/tt>[\s\S]*?<\/h3>/giu;
  const matches = [...html.matchAll(moduleHeadingPattern)];

  for (const [index, match] of matches.entries()) {
    const moduleName = (match[1] ?? '').split('.')[0] ?? '';
    const start = (match.index ?? 0) + match[0].length;
    const nextEntryStart = index + 1 < matches.length ? matches[index + 1]?.index : undefined;
    const end = Math.min(nextEntryStart ?? html.length, findNextMajorHeading(html, start));
    if (!moduleName) {
      continue;
    }

    moduleSymbols.push({
      id: `luajit:${moduleName}`,
      name: moduleName,
      kind: 'module',
      sourceSection: 'luajit',
      signature: `${moduleName}.*`,
      documentationMarkdown: htmlToMarkdown(html.slice(start, end)),
      documentationState: 'documented',
      upstreamUrl: url,
      licenseStatus: 'allowed',
    });
  }

  return moduleSymbols;
}

function extractLuaJitSymbolNames(signature: string): string[] {
  const names = new Set<string>();
  const symbolPattern =
    /\b(?:ffi|jit|table|tonumber|tostring|pairs|ipairs)\.[A-Za-z_][A-Za-z0-9_]*\b|\b(?:ffi|jit)\.[A-Z]\b|\b(?:tonumber|tostring|pairs|ipairs)\b/gu;
  for (const match of signature.matchAll(symbolPattern)) {
    names.add(match[0] ?? '');
  }
  return [...names];
}

async function fetchEeexSymbols(eeexCommit: string): Promise<ApiSymbol[]> {
  const gitCommit = await fetchJson<GitCommit>(
    `https://api.github.com/repos/Bubb13/EEex-Docs/git/commits/${eeexCommit}`,
  );
  const rootTree = await fetchJson<GitTree>(
    `https://api.github.com/repos/Bubb13/EEex-Docs/git/trees/${gitCommit.tree.sha}?recursive=1`,
  );
  if (rootTree.truncated) {
    throw new Error('EEex repository tree response was truncated.');
  }

  const [gameLua, eeexFunctions, structures] = await Promise.all([
    fetchTreeSymbols({
      sourceSection: 'ee-game-lua-functions',
      tree: treeForSection(rootTree, 'ee-game-lua-functions'),
      commit: eeexCommit,
      kind: 'function',
      symbolFromPath: (entryPath) => path.basename(entryPath, '.rst'),
      includePath: (entryPath) =>
        entryPath.endsWith('.rst') && path.basename(entryPath) !== 'index.rst',
    }),
    fetchRstAnchorSymbols({
      sourceSection: 'eeex-functions',
      tree: treeForSection(rootTree, 'eeex-functions'),
      commit: eeexCommit,
      kind: 'function',
      includeAnchor: (anchor) => anchor.startsWith('EEex_'),
    }),
    fetchEeexStructureSymbols(treeForSection(rootTree, 'ee-game-structures-x64'), eeexCommit),
  ]);

  return [...gameLua, ...eeexFunctions, ...structures];
}

async function resolveEeexCommit(): Promise<string> {
  const configuredCommit = process.env.IE_LUA_EEEX_COMMIT?.trim();
  if (configuredCommit) {
    return validateEeexCommit(configuredCommit);
  }

  const latest = await fetchJson<{ sha: string }>(
    'https://api.github.com/repos/Bubb13/EEex-Docs/commits/dev',
  );
  return validateEeexCommit(latest.sha);
}

function validateEeexCommit(commit: string): string {
  if (!/^[0-9a-f]{40}$/iu.test(commit)) {
    throw new Error(`Invalid EEex commit SHA: ${commit}`);
  }
  return commit.toLowerCase();
}

function readExistingEeexCommit(): string | undefined {
  if (!fs.existsSync(outputPath)) {
    return undefined;
  }
  const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as ApiIndexManifest;
  return existing.sources.find((source) => source.id === 'ee-game-structures-x64')?.commit;
}

function loadExistingEeexSymbols(): ApiSymbol[] {
  const eeexSections: SourceSectionId[] = [
    'ee-game-lua-functions',
    'eeex-functions',
    'ee-game-structures-x64',
  ];
  return eeexSections.flatMap((sourceSection) => {
    const filePath = path.resolve(outputDirectory, sectionFiles[sourceSection]);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const section = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ApiSectionFile;
    return section.symbols;
  });
}

function treeForSection(rootTree: GitTree, sourceSection: SourceSectionId): GitTree {
  const prefix = `source/${sectionPath(sourceSection)}/`;
  return {
    tree: rootTree.tree
      .filter((entry) => entry.path.startsWith(prefix))
      .map((entry) => ({
        ...entry,
        path: entry.path.slice(prefix.length),
      })),
  };
}

async function fetchTreeSymbols(options: {
  sourceSection: SourceSectionId;
  tree: GitTree;
  commit: string;
  kind: ApiSymbol['kind'];
  includePath: (entryPath: string) => boolean;
  symbolFromPath: (entryPath: string) => string;
}): Promise<ApiSymbol[]> {
  return options.tree.tree
    .filter((entry) => entry.type === 'blob' && options.includePath(entry.path))
    .map((entry) => {
      const name = options.symbolFromPath(entry.path);
      return {
        id: `${options.sourceSection}:${name}`,
        name,
        kind: options.kind,
        sourceSection: options.sourceSection,
        documentationState: 'permission-gated',
        upstreamUrl: `https://github.com/Bubb13/EEex-Docs/blob/${options.commit}/source/${encodePath(
          sectionPath(options.sourceSection),
        )}/${encodePath(entry.path)}`,
        upstreamCommit: options.commit,
        licenseStatus: 'permission-gated',
      } satisfies ApiSymbol;
    });
}

async function fetchRstAnchorSymbols(options: {
  sourceSection: SourceSectionId;
  tree: GitTree;
  commit: string;
  kind: ApiSymbol['kind'];
  includeAnchor: (anchor: string) => boolean;
}): Promise<ApiSymbol[]> {
  const indexPaths = options.tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.endsWith('index.rst'))
    .map((entry) => entry.path);
  const symbols: ApiSymbol[] = [];

  for (const indexPath of indexPaths) {
    const rawUrl = `https://raw.githubusercontent.com/Bubb13/EEex-Docs/${options.commit}/source/${encodePath(
      sectionPath(options.sourceSection),
    )}/${encodePath(indexPath)}`;
    const text = await fetchText(rawUrl);
    const anchors = [...text.matchAll(/^\.\. _([^:\n]+):/gmu)]
      .map((match) => match[1] ?? '')
      .filter(options.includeAnchor);
    for (const anchor of anchors) {
      symbols.push({
        id: `${options.sourceSection}:${anchor}`,
        name: anchor,
        kind: options.kind,
        sourceSection: options.sourceSection,
        documentationState: 'permission-gated',
        upstreamUrl: rawUrl.replace(
          `https://raw.githubusercontent.com/Bubb13/EEex-Docs/${options.commit}/`,
          `https://github.com/Bubb13/EEex-Docs/blob/${options.commit}/`,
        ),
        upstreamCommit: options.commit,
        licenseStatus: 'permission-gated',
      });
    }
  }

  return symbols;
}

async function fetchEeexStructureSymbols(tree: GitTree, commit: string): Promise<ApiSymbol[]> {
  const indexPaths = tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.endsWith('index.rst'))
    .map((entry) => entry.path);
  const symbols = await Promise.all(
    indexPaths.map(async (indexPath) => {
      const rawUrl = `https://raw.githubusercontent.com/Bubb13/EEex-Docs/${commit}/source/${encodePath(
        sectionPath('ee-game-structures-x64'),
      )}/${encodePath(indexPath)}`;
      return parseEeexStructureSymbols({
        commit,
        indexPath,
        text: await fetchText(rawUrl),
      });
    }),
  );
  return symbols.flat();
}

interface GitCommit {
  tree: {
    sha: string;
  };
}

interface GitTree {
  truncated?: boolean;
  tree: Array<{
    path: string;
    type: 'blob' | 'tree';
  }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ie-lua-language-server-doc-ingest',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ie-lua-language-server-doc-ingest',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function sectionPath(sourceSection: SourceSectionId): string {
  switch (sourceSection) {
    case 'ee-game-lua-functions':
      return 'EE Game Lua Functions';
    case 'eeex-functions':
      return 'EEex Functions';
    case 'ee-game-structures-x64':
      return 'EE Game Structures (x64)';
    default:
      throw new Error(`Unsupported EEex source section: ${sourceSection}`);
  }
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

interface HtmlSection {
  number: string;
  start: number;
  html: string;
}

function collectLua52Sections(html: string): HtmlSection[] {
  const headingPattern = /<h2>(\d+\.\d+)\s*&ndash;\s*<a name="[^"]+">[\s\S]*?<\/a><\/h2>/giu;
  const matches = [...html.matchAll(headingPattern)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const bodyStart = start + match[0].length;
    const end =
      index + 1 < matches.length ? (matches[index + 1]?.index ?? html.length) : html.length;
    return {
      number: match[1] ?? '',
      start,
      html: html.slice(bodyStart, end),
    };
  });
}

function findSectionAt(sections: HtmlSection[], offset: number): HtmlSection | undefined {
  let current: HtmlSection | undefined;
  for (const section of sections) {
    if (section.start > offset) {
      break;
    }
    current = section;
  }
  return current;
}

function findNextMajorHeading(html: string, offset: number): number {
  const match = html.slice(offset).match(/<h[1-3]\b/iu);
  return match?.index === undefined ? html.length : offset + match.index;
}

function firstParagraph(html: string): string {
  const match = html.match(/<p>([\s\S]*?)(?=<p>|<hr>|<h[1-6]|$)/iu);
  return match?.[0] ?? html;
}

function stripHtmlComments(input: string): string {
  let previous: string;
  do {
    previous = input;
    input = input.replace(/<!--[\s\S]*?-->/gu, '');
  } while (input !== previous);
  return input;
}

function htmlToMarkdown(html: string): string {
  const codeBlocks: string[] = [];
  let markdown = stripHtmlComments(html)
    .replace(/<pre(?:\s+[^>]*)?>([\s\S]*?)<\/pre>/giu, (_match, code: string) => {
      const index = codeBlocks.length;
      codeBlocks.push(`\n\n\`\`\`lua\n${normalizePreText(code)}\n\`\`\`\n\n`);
      return `\n\n@@CODE_BLOCK_${index}@@\n\n`;
    })
    .replace(/<ul>([\s\S]*?)<\/ul>/giu, (_match, listHtml: string) => {
      const items = [...listHtml.matchAll(/<li>([\s\S]*?)<\/li>/giu)].map((item) =>
        inlineMarkdown(item[1] ?? '')
          .replace(/\s+/gu, ' ')
          .trim(),
      );
      return `\n\n${items.map((item) => `- ${item}`).join('\n')}\n\n`;
    })
    .replace(/<p>/giu, '\n\n')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/?(?:h[1-6]|div|span|small|table|tr|td|th|tbody|thead)[^>]*>/giu, '\n\n');

  markdown = inlineMarkdown(markdown);
  markdown = markdown.replace(/@@CODE_BLOCK_(\d+)@@/gu, (_match, rawIndex: string) => {
    const index = Number(rawIndex);
    return codeBlocks[index] ?? '';
  });

  return normalizeMarkdown(markdown);
}

function inlineMarkdown(html: string): string {
  let result = html
    .replace(/<a\s+[^>]*>\s*<code>([\s\S]*?)<\/code>\s*<\/a>/giu, (_match, code: string) =>
      codeSpan(code),
    )
    .replace(/<a\s+[^>]*>\s*<tt>([\s\S]*?)<\/tt>\s*<\/a>/giu, (_match, code: string) =>
      codeSpan(code),
    )
    .replace(/<code>([\s\S]*?)<\/code>/giu, (_match, code: string) => codeSpan(code))
    .replace(/<tt>([\s\S]*?)<\/tt>/giu, (_match, code: string) => codeSpan(code))
    .replace(/<em>([\s\S]*?)<\/em>/giu, (_match, value: string) => `*${stripTags(value)}*`)
    .replace(/<b>([\s\S]*?)<\/b>/giu, (_match, value: string) => `**${stripTags(value)}**`)
    .replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/giu, (_match, value: string) => stripTags(value));
  result = stripTags(result);
  return decodeHtml(result);
}

function htmlInlineToText(html: string): string {
  return decodeHtml(stripTags(html)).replace(/\s+/gu, ' ').trim();
}

function stripTags(html: string): string {
  let result = html;
  let previous: string;
  do {
    previous = result;
    result = result.replace(/<[^>]+>/gu, '');
  } while (result !== previous);
  return result;
}

function normalizePreText(html: string): string {
  const lines = decodeHtml(stripTags(html)).replace(/\r/gu, '').split('\n');
  while (lines.length > 0 && !lines[0]?.trim()) {
    lines.shift();
  }
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) {
    lines.pop();
  }
  if (lines.length === 0) {
    return '';
  }

  const indentation = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/u)?.[0].length ?? 0),
  );
  return lines.map((line) => line.slice(indentation)).join('\n');
}

function codeSpan(html: string): string {
  const text = decodeHtml(stripTags(html)).replace(/\s+/gu, ' ').trim();
  return text ? `\`${text}\`` : '';
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/gu)
    .map((part) => {
      if (part.startsWith('```')) {
        return part.trim();
      }
      return part
        .split(/\n{2,}/u)
        .map((paragraph) => {
          if (paragraph.trimStart().startsWith('- ')) {
            return paragraph
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .join('\n');
          }
          return paragraph
            .replace(/[ \t]*\n[ \t]*/gu, ' ')
            .replace(/[ \t]+/gu, ' ')
            .trim();
        })
        .filter(Boolean)
        .join('\n\n');
    })
    .filter((part) => part.trim())
    .join('\n\n')
    .trim();
}

function decodeHtml(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    copy: '(C)',
    gt: '>',
    hellip: '...',
    le: '<=',
    lsquo: "'",
    lt: '<',
    mdash: '-',
    middot: '.',
    nbsp: ' ',
    ndash: '-',
    plusmn: '+/-',
    quot: '"',
    rarr: '->',
    rsquo: "'",
    sect: 'section',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, rawName: string) => {
    const name = rawName.toLowerCase();
    if (name.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    }
    return namedEntities[name] ?? entity;
  });
}

function dedupeSymbols(symbols: ApiSymbol[]): ApiSymbol[] {
  const byId = new Map<string, ApiSymbol>();
  for (const symbol of symbols) {
    const existing = byId.get(symbol.id);
    if (!existing || existing.documentationState !== 'documented') {
      byId.set(symbol.id, symbol);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function groupSymbolsBySection(
  symbols: ApiSymbol[],
  sources: ApiSource[],
): Map<SourceSectionId, ApiSymbol[]> {
  const grouped = new Map<SourceSectionId, ApiSymbol[]>();
  for (const source of sources) {
    grouped.set(source.id, []);
  }

  for (const symbol of symbols) {
    const section = grouped.get(symbol.sourceSection);
    if (!section) {
      throw new Error(`Generated symbol has unknown source section: ${symbol.id}`);
    }
    section.push(symbol);
  }

  return grouped;
}

function scanUtilityFunctions(filePath: string): ApiSymbol[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const symbols: ApiSymbol[] = [];
  const functionPattern = /^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm;

  for (const match of text.matchAll(functionPattern)) {
    const name = match[1] ?? '';
    const parameters = (match[2] ?? '')
      .split(',')
      .map((parameter) => parameter.trim())
      .filter(Boolean)
      .map((parameter) => ({ name: parameter }));
    symbols.push({
      id: `ee-utility-functions:${name}`,
      name,
      kind: 'function',
      sourceSection: 'ee-utility-functions',
      signature: `${name}(${parameters.map((parameter) => parameter.name).join(', ')})`,
      parameters,
      documentationState: 'undocumented',
      upstreamUrl: 'local-untracked:samples/util.lua',
      licenseStatus: 'permission-gated',
    });
  }

  return symbols;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
