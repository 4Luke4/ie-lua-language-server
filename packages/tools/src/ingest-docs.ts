import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ApiIndexManifest,
  ApiIndexManifestV3,
  ApiSectionFile,
  ApiShardReference,
  ApiSymbol,
  ApiSource,
  SourceSectionId,
} from '@ie-lua/shared';
import { parseEeexStructureSymbols } from './eeex-structures';
import {
  parseEeexFunctionSymbols,
  parseGameFunctionSymbol,
  parseGameIndexFunctionSymbols,
  parseGameIndexDescriptions,
} from './eeex-functions';

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
      licenseStatus: 'allowed',
    },
    {
      id: 'eeex-functions',
      title: 'EEex Functions',
      url: `https://github.com/Bubb13/EEex-Docs/tree/${eeexRef}/source/EEex%20Functions`,
      ...(eeexCommit ? { commit: eeexCommit } : {}),
      licenseStatus: 'allowed',
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

const singletonSectionFiles: Partial<Record<SourceSectionId, string>> = {
  lua52: 'sections/lua52.json',
  luajit: 'sections/luajit.json',
  'ee-utility-functions': 'sections/ee-utility-functions.json',
};

const eeexSourceSections = new Set<SourceSectionId>([
  'ee-game-lua-functions',
  'eeex-functions',
  'ee-game-structures-x64',
]);

interface GeneratedShard {
  sourceSection: SourceSectionId;
  title: string;
  symbols: ApiSymbol[];
  file?: string;
  upstreamPath?: string;
}

async function main(): Promise<void> {
  const shouldFetchEeex = process.env.IE_LUA_FETCH_EEEX === '1';
  const eeexCommit = shouldFetchEeex ? await resolveEeexCommit() : readExistingEeexCommit();
  const localSymbols: ApiSymbol[] = [
    ...(process.env.IE_LUA_SCAN_LOCAL_UTIL === '1'
      ? scanUtilityFunctions(path.resolve(repoRoot, 'samples/util.lua'))
      : []),
    ...(await makeLua52Symbols()),
    ...(await makeLuaJitSymbols()),
  ];
  const eeexShards = shouldFetchEeex
    ? await fetchEeexShards(eeexCommit!)
    : loadExistingEeexShards();
  const sources = makeSources(eeexCommit);
  const generatedAt = new Date().toISOString();
  const initialShards: GeneratedShard[] = [
    ...eeexShards,
    ...sources
      .filter((source) => !eeexSourceSections.has(source.id))
      .map((source) => {
        const file = singletonSectionFiles[source.id];
        if (!file) throw new Error(`Missing singleton file mapping: ${source.id}`);
        return {
          sourceSection: source.id,
          title: source.title,
          file,
          symbols: localSymbols.filter((symbol) => symbol.sourceSection === source.id),
        };
      }),
  ];
  const dedupedSymbols = validateAndSortSymbols(initialShards.flatMap((shard) => shard.symbols));
  const selectedSymbols = new Map(dedupedSymbols.map((symbol) => [symbol.id, symbol]));
  const shards = initialShards.map((shard) => ({
    ...shard,
    symbols: shard.symbols
      .filter((symbol) => selectedSymbols.get(symbol.id) === symbol)
      .sort((left, right) => left.id.localeCompare(right.id)),
  }));
  const shardFiles = new Map<GeneratedShard, string>();
  for (const shard of shards) {
    shardFiles.set(shard, shard.file ?? makeCategoryShardFile(shard.sourceSection, shard.title));
  }

  const index: ApiIndexManifestV3 = {
    schemaVersion: 3,
    generatedAt,
    sources,
    sections: sources.map((source) => {
      const sourceShards = shards.filter((shard) => shard.sourceSection === source.id);
      const files: ApiShardReference[] = sourceShards.map((shard) => ({
        title: shard.title,
        file: shardFiles.get(shard)!,
        symbolCount: shard.symbols.length,
        ...(shard.upstreamPath ? { upstreamPath: shard.upstreamPath } : {}),
      }));
      return {
        id: source.id,
        title: source.title,
        files,
        symbolCount: files.reduce((total, file) => total + file.symbolCount, 0),
        licenseStatus: source.licenseStatus,
      };
    }),
  };

  fs.mkdirSync(sectionDirectory, { recursive: true });
  const expectedFiles = new Set<string>();
  for (const shard of shards) {
    const relativeFile = shardFiles.get(shard)!;
    expectedFiles.add(relativeFile);
    const source = sources.find((candidate) => candidate.id === shard.sourceSection);
    if (!source) throw new Error(`Generated shard has unknown source: ${shard.sourceSection}`);
    const section: ApiSectionFile = {
      schemaVersion: 3,
      generatedAt,
      source,
      title: shard.title,
      ...(shard.upstreamPath ? { upstreamPath: shard.upstreamPath } : {}),
      symbols: shard.symbols,
    };
    const filePath = path.resolve(outputDirectory, relativeFile);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(section, null, 2)}\n`, 'utf8');
  }
  removeStaleSectionFiles(expectedFiles);

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function makeCategoryShardFile(sourceSection: SourceSectionId, title: string): string {
  const safeTitle = encodeURIComponent(title).replace(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)!.toString(16).toUpperCase()}`,
  );
  return `sections/${sourceSection}/${safeTitle}.json`;
}

function removeStaleSectionFiles(expectedFiles: Set<string>): void {
  if (!fs.existsSync(sectionDirectory)) return;
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const relativeFile = path.relative(outputDirectory, filePath).split(path.sep).join('/');
        if (!expectedFiles.has(relativeFile)) fs.unlinkSync(filePath);
      }
    }
  };
  visit(sectionDirectory);
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

async function fetchEeexShards(eeexCommit: string): Promise<GeneratedShard[]> {
  const gitCommit = await fetchJson<GitCommit>(
    `https://api.github.com/repos/Bubb13/EEex-Docs/git/commits/${eeexCommit}`,
  );
  const rootTree = await fetchJson<GitTree>(
    `https://api.github.com/repos/Bubb13/EEex-Docs/git/trees/${gitCommit.tree.sha}?recursive=1`,
  );
  if (rootTree.truncated) {
    throw new Error('EEex repository tree response was truncated.');
  }

  const [gameShards, eeexShards, structureShards] = await Promise.all([
    fetchGameFunctionShards(treeForSection(rootTree, 'ee-game-lua-functions'), eeexCommit),
    fetchEeexFunctionShards(treeForSection(rootTree, 'eeex-functions'), eeexCommit),
    fetchEeexStructureShards(treeForSection(rootTree, 'ee-game-structures-x64'), eeexCommit),
  ]);
  const countSymbols = (shards: GeneratedShard[]): number =>
    shards.reduce((total, shard) => total + shard.symbols.length, 0);

  console.log(
    `EEex-Docs ${eeexCommit}: generated ${countSymbols(gameShards)} EE Game functions in ${gameShards.length} shards, ${countSymbols(eeexShards)} EEex functions in ${eeexShards.length} shards, and ${countSymbols(structureShards)} structure symbols in ${structureShards.length} shards.`,
  );

  return [...gameShards, ...eeexShards, ...structureShards];
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

function loadExistingEeexShards(): GeneratedShard[] {
  if (!fs.existsSync(outputPath)) return [];
  const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as ApiIndexManifest;
  if (existing.schemaVersion !== 3) {
    throw new Error(
      'Existing EEex data predates category shards. Set IE_LUA_FETCH_EEEX=1 to migrate it.',
    );
  }
  return [...eeexSourceSections].flatMap((sourceSection) => {
    const section = existing.sections.find((candidate) => candidate.id === sourceSection);
    return (section?.files ?? []).map((reference) =>
      loadExistingShard(sourceSection, reference.title, reference.file, reference.upstreamPath),
    );
  });
}

function loadExistingShard(
  sourceSection: SourceSectionId,
  title: string,
  relativeFile: string,
  upstreamPath: string | undefined,
): GeneratedShard {
  const filePath = path.resolve(outputDirectory, relativeFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing existing API shard: ${relativeFile}`);
  }
  const section = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ApiSectionFile;
  const resolvedUpstreamPath = section.upstreamPath ?? upstreamPath;
  return {
    sourceSection,
    title: section.title ?? title,
    file: relativeFile,
    symbols: section.symbols,
    ...(resolvedUpstreamPath ? { upstreamPath: resolvedUpstreamPath } : {}),
  };
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

interface UpstreamCategory {
  title: string;
  indexPath: string;
  upstreamPath: string;
}

async function fetchUpstreamCategories(
  tree: GitTree,
  sourceSection: SourceSectionId,
  commit: string,
): Promise<UpstreamCategory[]> {
  if (!tree.tree.some((entry) => entry.type === 'blob' && entry.path === 'index.rst')) {
    throw new Error(`${sectionPath(sourceSection)} tree is missing its root index.rst.`);
  }
  const text = await fetchEeexSourceText(sourceSection, 'index.rst', commit);
  return parseRootToctreeCategories(text, sourceSection).map((title) => {
    const indexPath = `${title}/index.rst`;
    if (!tree.tree.some((entry) => entry.type === 'blob' && entry.path === indexPath)) {
      throw new Error(`${sectionPath(sourceSection)} category is missing ${indexPath}.`);
    }
    return {
      title,
      indexPath,
      upstreamPath: `source/${sectionPath(sourceSection)}/${indexPath}`,
    };
  });
}

export function parseRootToctreeCategories(text: string, sourceSection: SourceSectionId): string[] {
  const lines = text.replace(/\r/gu, '').split('\n');
  const start = lines.findIndex((line) => line.trim() === '.. toctree::');
  if (start === -1) {
    throw new Error(`${sectionPath(sourceSection)} root index has no toctree.`);
  }
  const categories: string[] = [];
  const seen = new Set<string>();
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() && !/^\s/u.test(line)) break;
    const value = line.trim();
    if (!value || value.startsWith(':')) continue;
    const match = value.match(/^([^/\\]+)\/index$/u);
    if (!match?.[1] || match[1] === '.' || match[1] === '..') {
      throw new Error(
        `${sectionPath(sourceSection)} root index has unsupported toctree entry: ${value}`,
      );
    }
    if (seen.has(match[1])) {
      throw new Error(`${sectionPath(sourceSection)} root index repeats category: ${match[1]}`);
    }
    seen.add(match[1]);
    categories.push(match[1]);
  }
  if (categories.length === 0) {
    throw new Error(`${sectionPath(sourceSection)} root index has no categories.`);
  }
  return categories;
}

async function fetchGameFunctionShards(tree: GitTree, commit: string): Promise<GeneratedShard[]> {
  const categories = await fetchUpstreamCategories(tree, 'ee-game-lua-functions', commit);
  return Promise.all(
    categories.map(async (category) => {
      const indexText = await fetchEeexSourceText(
        'ee-game-lua-functions',
        category.indexPath,
        commit,
      );
      const descriptions = parseGameIndexDescriptions(indexText, category.upstreamPath);
      const pagePaths = tree.tree
        .filter(
          (entry) =>
            entry.type === 'blob' &&
            entry.path.startsWith(`${category.title}/`) &&
            entry.path.endsWith('.rst') &&
            entry.path !== category.indexPath,
        )
        .map((entry) => entry.path)
        .sort();
      const pageSymbols = await Promise.all(
        pagePaths.map(async (pagePath) => {
          const sourcePath = `source/${sectionPath('ee-game-lua-functions')}/${pagePath}`;
          const anchor = path.basename(pagePath, '.rst');
          const indexDescription = descriptions.get(anchor);
          return parseGameFunctionSymbol({
            commit,
            sourcePath,
            text: await fetchEeexSourceText('ee-game-lua-functions', pagePath, commit),
            ...(indexDescription !== undefined ? { indexDescription } : {}),
          });
        }),
      );
      const indexSymbols = parseGameIndexFunctionSymbols({
        commit,
        sourcePath: category.upstreamPath,
        text: indexText,
      });
      const definedIndexAnchors = [...indexText.matchAll(/^\.\. _(.+):\s*$/gmu)].filter((match) =>
        descriptions.has(match[1] ?? ''),
      ).length;
      if (indexSymbols.length !== definedIndexAnchors) {
        throw new Error(
          `${category.upstreamPath}: expected ${definedIndexAnchors} indexed functions, generated ${indexSymbols.length}.`,
        );
      }
      return {
        sourceSection: 'ee-game-lua-functions' as const,
        title: category.title,
        upstreamPath: category.upstreamPath,
        symbols: [...pageSymbols, ...indexSymbols],
      };
    }),
  );
}

async function fetchEeexFunctionShards(tree: GitTree, commit: string): Promise<GeneratedShard[]> {
  const categories = await fetchUpstreamCategories(tree, 'eeex-functions', commit);
  return Promise.all(
    categories.map(async (category) => {
      const text = await fetchEeexSourceText('eeex-functions', category.indexPath, commit);
      const symbols = parseEeexFunctionSymbols({
        commit,
        sourcePath: category.upstreamPath,
        text,
      });
      const expectedAnchors = [...text.matchAll(/^\.\. _EEex_.+:\s*$/gmu)].length;
      if (symbols.length !== expectedAnchors) {
        throw new Error(
          `${category.upstreamPath}: expected ${expectedAnchors} EEex functions, generated ${symbols.length}.`,
        );
      }
      return {
        sourceSection: 'eeex-functions' as const,
        title: category.title,
        upstreamPath: category.upstreamPath,
        symbols,
      };
    }),
  );
}

async function fetchEeexSourceText(
  sourceSection: SourceSectionId,
  relativePath: string,
  commit: string,
): Promise<string> {
  const localRoot = process.env.IE_LUA_EEEX_DOCS_ROOT?.trim();
  if (localRoot) {
    const sourcePath = path.resolve(localRoot, 'source', sectionPath(sourceSection), relativePath);
    return fs.readFileSync(sourcePath, 'utf8');
  }
  return fetchText(
    `https://raw.githubusercontent.com/Bubb13/EEex-Docs/${commit}/source/${encodePath(
      sectionPath(sourceSection),
    )}/${encodePath(relativePath)}`,
  );
}

async function fetchEeexStructureShards(tree: GitTree, commit: string): Promise<GeneratedShard[]> {
  const categories = await fetchUpstreamCategories(tree, 'ee-game-structures-x64', commit);
  return Promise.all(
    categories.map(async (category) => ({
      sourceSection: 'ee-game-structures-x64' as const,
      title: category.title,
      upstreamPath: category.upstreamPath,
      symbols: parseEeexStructureSymbols({
        commit,
        indexPath: category.indexPath,
        text: await fetchEeexSourceText('ee-game-structures-x64', category.indexPath, commit),
      }),
    })),
  );
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

function validateAndSortSymbols(symbols: ApiSymbol[]): ApiSymbol[] {
  const byId = new Map<string, ApiSymbol>();
  for (const symbol of symbols) {
    const existing = byId.get(symbol.id);
    if (
      existing &&
      (symbol.sourceSection === 'ee-game-lua-functions' ||
        symbol.sourceSection === 'eeex-functions')
    ) {
      throw new Error(`Generated duplicate API symbol id: ${symbol.id}`);
    }
    if (!existing || existing.documentationState !== 'documented') {
      byId.set(symbol.id, symbol);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
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

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
