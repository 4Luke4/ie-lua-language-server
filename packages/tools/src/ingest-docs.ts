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
  githubSourceUrl,
  parseEeexFunctionSymbols,
  parseGameFunctionSymbol,
  parseGameIndexFunctionSymbols,
  parseGameIndexDescriptions,
} from './eeex-functions';

const repoRoot = path.resolve(__dirname, '../..');
const outputDirectory = path.resolve(repoRoot, 'resources/api');
const outputPath = path.resolve(outputDirectory, 'api-index.json');
const sectionDirectory = path.resolve(outputDirectory, 'sections');
const upstreamPinsPath = path.resolve(repoRoot, 'packages/tools/upstream-pins.json');
// Hover links and definitions point at the rendered upstream pages people actually read. The
// immutable identity of the text that was parsed is recorded separately in the source manifest
// (release archive digest or repository commit), because these pages are not versioned URLs.
const lua52ManualUrl = 'https://www.lua.org/manual/5.2/manual.html';
const luaJitSiteUrl = 'https://luajit.org/';
const luaJitExtensionPages = ['extensions.html', 'ext_ffi_api.html', 'ext_jit.html'] as const;
const allowedLua52Sections = new Set(['6.1', '6.4', '6.5', '6.6', '6.7', '6.10']);
const lua52ModuleSections = {
  '6.4': 'string',
  '6.5': 'table',
  '6.6': 'math',
  '6.7': 'bit32',
  '6.10': 'debug',
} satisfies Record<string, string>;

/**
 * Immutable identities of the non-EEex upstream inputs.
 *
 * The same file drives the workflow step that fetches these inputs, so the digest the workflow
 * verifies and the provenance written into the manifest cannot drift apart.
 */
export interface UpstreamPins {
  lua52: { url: string; sha256: string };
  luajit: { repository: string; commit: string };
}

export function readUpstreamPins(file = upstreamPinsPath): UpstreamPins {
  const pins = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<UpstreamPins>;
  const lua52 = pins.lua52;
  const luajit = pins.luajit;
  if (
    !lua52 ||
    !/^https:\/\/www\.lua\.org\/ftp\/lua-5\.2\.\d+\.tar\.gz$/u.test(lua52.url) ||
    !/^[0-9a-f]{64}$/u.test(lua52.sha256) ||
    !luajit ||
    luajit.repository !== 'LuaJIT/LuaJIT' ||
    !/^[0-9a-f]{40}$/u.test(luajit.commit)
  ) {
    throw new Error(`${file}: malformed upstream pins`);
  }
  return { lua52, luajit };
}

function makeSources(eeexCommit: string | undefined, pins: UpstreamPins): ApiSource[] {
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
      licenseStatus: 'allowed',
    },
    {
      id: 'lua52',
      title: 'Lua 5.2',
      // The official release archive, whose manual body is identical to the online manual.
      url: pins.lua52.url,
      sha256: pins.lua52.sha256,
      licenseStatus: 'allowed',
    },
    {
      id: 'luajit',
      title: 'LuaJIT',
      url: `https://github.com/${pins.luajit.repository}/tree/${pins.luajit.commit}/doc`,
      commit: pins.luajit.commit,
      licenseStatus: 'allowed',
    },
    {
      id: 'ee-utility-functions',
      title: 'EE Utility Functions',
      url: 'local-untracked:samples/util.lua',
      licenseStatus: 'unknown',
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
  const pins = readUpstreamPins();
  // Lua 5.2 and LuaJIT are always regenerated from their pinned local inputs, so the pinned
  // regeneration job verifies every documentation section rather than carrying two forward.
  const localSymbols: ApiSymbol[] = [
    ...(process.env.IE_LUA_SCAN_LOCAL_UTIL === '1'
      ? scanUtilityFunctions(path.resolve(repoRoot, 'samples/util.lua'))
      : []),
    ...makeLua52Symbols(readPinnedLua52Manual()),
    ...makeLuaJitSymbols(readPinnedLuaJitPages(pins)),
  ];
  const eeexShards = shouldFetchEeex
    ? await fetchEeexShards(eeexCommit!)
    : loadExistingEeexShards();
  const sources = makeSources(eeexCommit, pins);
  // A supplied timestamp makes a pinned-source regeneration byte-for-byte reproducible.
  const generatedAt = process.env.IE_LUA_GENERATED_AT ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Invalid generation timestamp');
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

/**
 * Reads the Lua 5.2 manual extracted from the pinned release archive.
 *
 * The upstream-docs action verifies the archive digest before extracting this single page; the
 * page is parsed as text and nothing from the archive is executed.
 */
function readPinnedLua52Manual(): string {
  const manual = process.env.IE_LUA_LUA52_MANUAL?.trim();
  if (!manual) {
    throw new Error(
      'IE_LUA_LUA52_MANUAL must point at doc/manual.html from the pinned Lua 5.2 release archive.',
    );
  }
  return fs.readFileSync(path.resolve(manual), 'utf8');
}

export interface LuaJitPage {
  /** Rendered page on luajit.org; used for source links and to resolve relative links. */
  url: string;
  html: string;
}

/** Reads the LuaJIT extension pages from a checkout proven to be at the pinned commit. */
function readPinnedLuaJitPages(pins: UpstreamPins): LuaJitPage[] {
  const root = process.env.IE_LUA_LUAJIT_DOCS_ROOT?.trim();
  if (!root) {
    throw new Error('IE_LUA_LUAJIT_DOCS_ROOT must point at a LuaJIT checkout at the pinned commit.');
  }
  verifyLocalCommit(root, pins.luajit.commit);
  return luaJitExtensionPages.map((page) => ({
    url: new URL(page, luaJitSiteUrl).href,
    html: fs.readFileSync(path.resolve(root, 'doc', page), 'utf8'),
  }));
}

export function makeLua52Symbols(html: string): ApiSymbol[] {
  return [
    ...makeLua52KeywordSymbols(html),
    ...makeLua52ModuleSymbols(html),
    ...makeLua52ManualEntrySymbols(html),
  ];
}

function makeLua52KeywordSymbols(html: string): ApiSymbol[] {
  const blockMatch = html.match(
    /(The following[\s\S]{0,200}?are reserved\s+and cannot be used as names:)\s*<pre>([\s\S]*?)<\/pre>/u,
  );
  if (!blockMatch?.[1] || blockMatch[2] === undefined) {
    throw new Error('Unable to locate Lua 5.2 keyword block in official manual.');
  }

  const keywordBlock = normalizePreText(blockMatch[2]);
  const keywords = keywordBlock.split(/\s+/u).filter(Boolean);
  // The introduction is rendered from the manual's own markup instead of being restated, so its
  // wording and emphasis ("The following *keywords* are reserved") stay exactly as published.
  const documentationMarkdown = htmlToMarkdown(
    `<p>${blockMatch[1]}<pre>${blockMatch[2]}</pre>`,
    lua52ManualUrl,
  );

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
      documentationMarkdown: htmlToMarkdown(firstParagraph(section.html), lua52ManualUrl),
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
    const documentationMarkdown = htmlToMarkdown(html.slice(start, end), lua52ManualUrl);
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

export function makeLuaJitSymbols(pages: LuaJitPage[]): ApiSymbol[] {
  return pages.flatMap(({ url, html }) => makeLuaJitPageSymbols(url, html));
}

function makeLuaJitPageSymbols(url: string, html: string): ApiSymbol[] {
  const headingPattern = /<h3([^>]*)>\s*<tt>([\s\S]*?)<\/tt>[\s\S]*?<\/h3>/giu;
  const matches = [...html.matchAll(headingPattern)];
  const symbols: ApiSymbol[] = [];

  for (const [index, match] of matches.entries()) {
    const start = (match.index ?? 0) + match[0].length;
    const nextEntryStart = index + 1 < matches.length ? matches[index + 1]?.index : undefined;
    const end = Math.min(nextEntryStart ?? html.length, findNextMajorHeading(html, start));
    const signature = htmlInlineToText(match[2] ?? '');
    const names = extractLuaJitSymbolNames(signature);
    if (names.length === 0) {
      continue;
    }
    const documentationMarkdown = htmlToMarkdown(html.slice(start, end), url);
    const upstreamUrl = luaJitHeadingUrl(url, match[1] ?? '', signature);

    for (const name of names) {
      symbols.push({
        id: `luajit:${name}`,
        name,
        kind: signature.includes('(') ? 'function' : 'variable',
        sourceSection: 'luajit',
        signature,
        documentationMarkdown,
        documentationState: documentationMarkdown ? 'documented' : 'undocumented',
        upstreamUrl,
        licenseStatus: 'allowed',
      });
    }
  }

  symbols.push(...makeLuaJitModuleSymbols(html, url));
  return symbols;
}

function makeLuaJitModuleSymbols(html: string, url: string): ApiSymbol[] {
  const moduleSymbols: ApiSymbol[] = [];
  const moduleHeadingPattern = /<h3([^>]*)>\s*<tt>((?:bit|ffi|jit)\.\*)<\/tt>[\s\S]*?<\/h3>/giu;
  const matches = [...html.matchAll(moduleHeadingPattern)];

  for (const [index, match] of matches.entries()) {
    const moduleName = (match[2] ?? '').split('.')[0] ?? '';
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
      documentationMarkdown: htmlToMarkdown(html.slice(start, end), url),
      documentationState: 'documented',
      upstreamUrl: luaJitHeadingUrl(url, match[1] ?? '', match[2] ?? ''),
      licenseStatus: 'allowed',
    });
  }

  return moduleSymbols;
}

// Every documented LuaJIT heading carries an id, so a symbol's source link can land on its own
// entry. A heading without one is reported instead of silently linking to the top of the page.
function luaJitHeadingUrl(pageUrl: string, attributes: string, heading: string): string {
  const id = attributes.match(/\bid="([^"]+)"/u)?.[1];
  if (!id) throw new Error(`${pageUrl}: heading ${heading} has no id to link to`);
  return `${pageUrl}#${id}`;
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

type SourceReader = (sourceSection: SourceSectionId, relativePath: string) => Promise<string>;

async function fetchEeexShards(eeexCommit: string): Promise<GeneratedShard[]> {
  const rootTree = await readEeexTree(eeexCommit);
  // Every file read is scanned for Sphinx labels, so :ref: links can be resolved once all pages
  // are known, whichever section or page defines the label.
  const anchors = new AnchorRegistry();
  // Links also point into documentation sections that are not ingested, such as "EE Game Classes
  // (x86)". A pinned local checkout makes reading every page cheap, so all of them are scanned.
  const localRoot = process.env.IE_LUA_EEEX_DOCS_ROOT?.trim();
  if (localRoot) {
    for (const entry of rootTree.tree) {
      if (entry.type === 'blob' && entry.path.startsWith('source/') && entry.path.endsWith('.rst')) {
        anchors.record(entry.path, fs.readFileSync(path.resolve(localRoot, entry.path), 'utf8'));
      }
    }
  }
  const read: SourceReader = async (sourceSection, relativePath) => {
    const text = await fetchEeexSourceText(sourceSection, relativePath, eeexCommit);
    anchors.record(`source/${sectionPath(sourceSection)}/${relativePath}`, text);
    return text;
  };

  const [gameShards, eeexShards, structureShards] = await Promise.all([
    fetchGameFunctionShards(treeForSection(rootTree, 'ee-game-lua-functions'), eeexCommit, read),
    fetchEeexFunctionShards(treeForSection(rootTree, 'eeex-functions'), eeexCommit, read),
    fetchEeexStructureShards(treeForSection(rootTree, 'ee-game-structures-x64'), eeexCommit, read),
  ]);
  const shards = [...gameShards, ...eeexShards, ...structureShards];
  const unresolved = resolveReferenceLinks(
    shards.flatMap((shard) => shard.symbols),
    (label) => {
      const target = anchors.resolve(label);
      return target ? githubSourceUrl(eeexCommit, target.sourcePath, target.line) : undefined;
    },
  );
  const countSymbols = (group: GeneratedShard[]): number =>
    group.reduce((total, shard) => total + shard.symbols.length, 0);

  console.log(
    `EEex-Docs ${eeexCommit}: generated ${countSymbols(gameShards)} EE Game functions in ${gameShards.length} shards, ${countSymbols(eeexShards)} EEex functions in ${eeexShards.length} shards, and ${countSymbols(structureShards)} structure symbols in ${structureShards.length} shards.`,
  );
  if (unresolved.size > 0) {
    console.log(
      `Rendered ${unresolved.size} unresolved or ambiguous :ref: targets as plain text: ${[...unresolved].sort().join(', ')}`,
    );
  }

  return shards;
}

// A pinned local checkout (IE_LUA_EEEX_DOCS_ROOT) replaces both GitHub API calls. The anonymous REST
// API allows 60 requests per hour per address, which shared CI runners exhaust at random.
async function readEeexTree(eeexCommit: string): Promise<GitTree> {
  const localRoot = process.env.IE_LUA_EEEX_DOCS_ROOT?.trim();
  if (localRoot) {
    verifyLocalCommit(localRoot, eeexCommit);
    return readLocalTree(localRoot);
  }
  const gitCommit = await fetchJson<GitCommit>(
    `https://api.github.com/repos/Bubb13/EEex-Docs/git/commits/${eeexCommit}`,
  );
  const rootTree = await fetchJson<GitTree>(
    `https://api.github.com/repos/Bubb13/EEex-Docs/git/trees/${gitCommit.tree.sha}?recursive=1`,
  );
  if (rootTree.truncated) {
    throw new Error('EEex repository tree response was truncated.');
  }
  return rootTree;
}

/**
 * Lists a local checkout the way the Git tree API does: repository-relative POSIX paths of every
 * file and directory, without the .git directory.
 *
 * Symbolic links are rejected rather than followed, so a listing can never reach outside the
 * pinned checkout it describes.
 */
export function readLocalTree(root: string): GitTree {
  const entries: GitTree['tree'] = [];
  const visit = (directory: string, prefix: string): void => {
    const children = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of children) {
      if (!prefix && entry.name === '.git') continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error(`${relative}: symbolic links are not read from upstream checkouts`);
      }
      if (entry.isDirectory()) {
        entries.push({ path: relative, type: 'tree' });
        visit(path.join(directory, entry.name), relative);
      } else if (entry.isFile()) {
        entries.push({ path: relative, type: 'blob' });
      }
    }
  };
  visit(path.resolve(root), '');
  return { tree: entries };
}

/**
 * Confirms that a checkout is at the expected commit by reading its detached HEAD, which is what
 * actions/checkout leaves for a SHA ref. Git itself is never executed.
 */
export function verifyLocalCommit(root: string, commit: string): void {
  const headFile = path.resolve(root, '.git', 'HEAD');
  const head = fs.existsSync(headFile) ? fs.readFileSync(headFile, 'utf8').trim() : '<missing>';
  if (head !== commit) {
    throw new Error(`${root} is at ${head}, expected the pinned commit ${commit}`);
  }
}

export interface AnchorTarget {
  sourcePath: string;
  line: number;
}

/**
 * Sphinx cross-reference targets (".. _label:") in the upstream sources that were read.
 *
 * Labels match the way Sphinx matches them: case-insensitively with whitespace collapsed. A label
 * defined in more than one place is ambiguous and deliberately resolves to nothing rather than to
 * a guess.
 */
export class AnchorRegistry {
  private readonly targets = new Map<string, AnchorTarget[]>();

  record(sourcePath: string, text: string): void {
    const lines = text.replace(/\r\n?/gu, '\n').split('\n');
    for (const [index, line] of lines.entries()) {
      const label = line.match(/^\.\. _(.+):\s*$/u)?.[1];
      if (!label) continue;
      // Labels escape their colons and leading underscores (".. _CAOEEntry\:\:AOEType:",
      // ".. _\_iobuf:"); docutils removes the backslashes, and :ref: targets are written without them.
      const key = normalizeLabel(label.replace(/\\(.)/gu, '$1'));
      const known = this.targets.get(key) ?? [];
      if (!known.some((target) => target.sourcePath === sourcePath && target.line === index + 1)) {
        known.push({ sourcePath, line: index + 1 });
      }
      this.targets.set(key, known);
    }
  }

  resolve(label: string): AnchorTarget | undefined {
    const known = this.targets.get(normalizeLabel(label));
    return known?.length === 1 ? known[0] : undefined;
  }
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/gu, ' ').toLowerCase();
}

/**
 * Rewrites the "[label](#target)" placeholders that RST :ref: roles render to, everywhere a symbol
 * carries Markdown. A resolved target becomes the pinned upstream line that defines it; anything
 * else keeps only its label, because an in-page fragment leads nowhere inside an editor hover.
 *
 * @returns the targets that could not be resolved, for the generation log.
 */
export function resolveReferenceLinks(
  symbols: ApiSymbol[],
  resolve: (label: string) => string | undefined,
): Set<string> {
  const unresolved = new Set<string>();
  const fragmentLink = /\[([^\]\n]*)\]\(#([^)\n]+)\)/gu;
  const replaceLink = (_match: string, label: string, target: string): string => {
    const url = resolve(target);
    if (url) return `[${label}](${url})`;
    unresolved.add(target);
    return label;
  };
  // Code blocks are copied verbatim; only prose can contain rendered :ref: links.
  const rewrite = (markdown: string): string =>
    markdown
      .split(/(```[\s\S]*?```)/u)
      .map((part) => (part.startsWith('```') ? part : part.replace(fragmentLink, replaceLink)))
      .join('');
  for (const symbol of symbols) {
    if (symbol.documentationMarkdown) {
      symbol.documentationMarkdown = rewrite(symbol.documentationMarkdown);
    }
    for (const parameter of symbol.parameters ?? []) {
      if (parameter.description) parameter.description = rewrite(parameter.description);
    }
    for (const value of symbol.returns ?? []) {
      if (value.description) value.description = rewrite(value.description);
    }
  }
  return unresolved;
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
  read: SourceReader,
): Promise<UpstreamCategory[]> {
  if (!tree.tree.some((entry) => entry.type === 'blob' && entry.path === 'index.rst')) {
    throw new Error(`${sectionPath(sourceSection)} tree is missing its root index.rst.`);
  }
  const text = await read(sourceSection, 'index.rst');
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

async function fetchGameFunctionShards(
  tree: GitTree,
  commit: string,
  read: SourceReader,
): Promise<GeneratedShard[]> {
  const categories = await fetchUpstreamCategories(tree, 'ee-game-lua-functions', read);
  return Promise.all(
    categories.map(async (category) => {
      const indexText = await read('ee-game-lua-functions', category.indexPath);
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
            text: await read('ee-game-lua-functions', pagePath),
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

async function fetchEeexFunctionShards(
  tree: GitTree,
  commit: string,
  read: SourceReader,
): Promise<GeneratedShard[]> {
  const categories = await fetchUpstreamCategories(tree, 'eeex-functions', read);
  return Promise.all(
    categories.map(async (category) => {
      const text = await read('eeex-functions', category.indexPath);
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

async function fetchEeexStructureShards(
  tree: GitTree,
  commit: string,
  read: SourceReader,
): Promise<GeneratedShard[]> {
  const categories = await fetchUpstreamCategories(tree, 'ee-game-structures-x64', read);
  return Promise.all(
    categories.map(async (category) => ({
      sourceSection: 'ee-game-structures-x64' as const,
      title: category.title,
      upstreamPath: category.upstreamPath,
      symbols: parseEeexStructureSymbols({
        commit,
        indexPath: category.indexPath,
        text: await read('ee-game-structures-x64', category.indexPath),
      }),
    })),
  );
}

interface GitCommit {
  tree: {
    sha: string;
  };
}

export interface GitTree {
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

/**
 * Holds Markdown that is already final (code, links, and the few HTML tags a hover renders) while
 * the surrounding prose is still stripped of tags and entity-decoded.
 *
 * Without this, decoded text would be decoded a second time and inline HTML such as <sup> would be
 * stripped with the page markup. Placeholders use private-use code points, which the upstream
 * pages never contain.
 */
class ProtectedMarkdown {
  private readonly values: string[] = [];

  add(markdown: string): string {
    this.values.push(markdown);
    return `\uE000${this.values.length - 1}\uE001`;
  }

  restore(text: string): string {
    let result = text;
    // A protected value may itself contain placeholders, such as a code span inside a table cell.
    for (let depth = 0; depth < 4 && /\uE000\d+\uE001/u.test(result); depth += 1) {
      result = result.replace(
        /\uE000(\d+)\uE001/gu,
        (_match, index: string) => this.values[Number(index)] ?? '',
      );
    }
    return result;
  }
}

/**
 * Converts one upstream Lua 5.2 or LuaJIT HTML fragment to hover Markdown.
 *
 * Everything the page shows is kept: wording and typographic characters exactly as published,
 * emphasis, code, lists, tables, headings, superscripts, line breaks, and links. Relative links
 * are resolved against the page they came from, so they still work inside an editor.
 */
export function htmlToMarkdown(html: string, baseUrl: string): string {
  const kept = new ProtectedMarkdown();
  // A checkout with Windows line endings must not leak carriage returns into hover text.
  const markdown = stripHtmlComments(html.replace(/\r\n?/gu, '\n'))
    // LuaJIT's repository pages prefix external links with a "»" glyph for the site stylesheet.
    // It is navigation decoration, not documentation text, and luajit.org does not render it.
    .replace(/<span class="ext">&raquo;<\/span>(?:&nbsp;)?/gu, '')
    .replace(
      /<pre(?:\s+[^>]*)?>([\s\S]*?)<\/pre>/giu,
      (_match, code: string) => `\n\n${kept.add(`\`\`\`lua\n${normalizePreText(code)}\n\`\`\``)}\n\n`,
    )
    .replace(
      /<table(?:\s+[^>]*)?>([\s\S]*?)<\/table>/giu,
      (_match, table: string) => `\n\n${kept.add(htmlTableToMarkdown(table, baseUrl, kept))}\n\n`,
    )
    .replace(/<ul(?:\s+[^>]*)?>([\s\S]*?)<\/ul>/giu, (_match, listHtml: string) => {
      const items = [...listHtml.matchAll(/<li(?:\s+[^>]*)?>([\s\S]*?)<\/li>/giu)].map((item) =>
        htmlListItem(item[1] ?? '', baseUrl, kept),
      );
      // Protected like tables, so item text is not decoded a second time with the page.
      return `\n\n${kept.add(items.join('\n'))}\n\n`;
    })
    .replace(
      /<h[4-6](?:\s+[^>]*)?>([\s\S]*?)<\/h[4-6]>/giu,
      (_match, heading: string) =>
        `\n\n${kept.add(`#### ${collapseSpace(inlineMarkdown(heading, baseUrl, kept))}`)}\n\n`,
    )
    .replace(/<p(?:\s+[^>]*)?>/giu, '\n\n')
    .replace(/<br\s*\/?>/giu, () => kept.add('<br/>'))
    .replace(/<\/?(?:h[1-6]|div|span|small|tr|td|th|tbody|thead)(?:\s+[^>]*)?>/giu, '\n\n');

  return kept.restore(normalizeMarkdown(inlineMarkdown(markdown, baseUrl, kept)));
}

// A list item can hold several paragraphs and a code block, as collectgarbage's "count" option
// does. Its blocks are rendered like any fragment and indented under the bullet, which is how
// Markdown keeps them inside the item instead of running a code fence into the bullet's line.
function htmlListItem(html: string, baseUrl: string, kept: ProtectedMarkdown): string {
  const blocks = kept.restore(
    normalizeMarkdown(inlineMarkdown(html.replace(/<p(?:\s+[^>]*)?>/giu, '\n\n'), baseUrl, kept)),
  );
  return blocks
    .split('\n')
    .map((line, index) => (index === 0 ? `- ${line}` : line ? `  ${line}` : ''))
    .join('\n');
}

// CommonMark only opens and closes emphasis next to non-space text, so "<b>opt: </b>" must become
// "**opt:** " rather than "**opt: **", which renders its asterisks literally.
function emphasize(marker: string, text: string): string {
  const [, before = '', inner = '', after = ''] = text.match(/^([ \t\r\n]*)([\s\S]*?)([ \t\r\n]*)$/u) ?? [];
  return inner ? `${before}${marker}${inner}${marker}${after}` : text;
}

// Upstream tables use their first row as the header, as ffi.abi's parameter table does.
function htmlTableToMarkdown(html: string, baseUrl: string, kept: ProtectedMarkdown): string {
  const rows = [...html.matchAll(/<tr(?:\s+[^>]*)?>([\s\S]*?)<\/tr>/giu)].map((row) =>
    // GFM splits cells on every unescaped "|", code spans included, so the escape is applied to the
    // cell's final text rather than to the prose around protected spans.
    [...(row[1] ?? '').matchAll(/<t[dh](?:\s+[^>]*)?>([\s\S]*?)<\/t[dh]>/giu)].map((cell) =>
      kept.restore(collapseSpace(inlineMarkdown(cell[1] ?? '', baseUrl, kept))).replace(/\|/gu, '\\|'),
    ),
  );
  const width = rows[0]?.length ?? 0;
  if (width === 0 || rows.some((row) => row.length !== width)) {
    throw new Error(`Unsupported upstream HTML table in ${baseUrl}`);
  }
  const line = (cells: string[]): string => `| ${cells.join(' | ')} |`;
  return [
    line(rows[0] ?? []),
    line(Array.from({ length: width }, () => '---')),
    ...rows.slice(1).map(line),
  ].join('\n');
}

function inlineMarkdown(html: string, baseUrl: string, kept: ProtectedMarkdown): string {
  const link = (attributes: string, label: string): string => {
    const href = attributes.match(/\bhref="([^"]*)"/u)?.[1];
    if (!label) return '';
    // The label is final Markdown already; protecting it keeps it from being decoded again.
    if (!href) return kept.add(label);
    return kept.add(`[${label}](${new URL(decodeHtml(href), baseUrl).href})`);
  };
  const result = html
    .replace(
      /<a\s+([^>]*)>\s*<(code|tt)>([\s\S]*?)<\/\2>\s*<\/a>/giu,
      (_match, attributes: string, _tag: string, code: string) => link(attributes, codeSpan(code)),
    )
    .replace(/<(code|tt)>([\s\S]*?)<\/\1>/giu, (_match, _tag: string, code: string) =>
      kept.add(codeSpan(code)),
    )
    // Superscripts carry meaning ("m2<sup>e</sup>" is m·2^e) and render in VS Code hovers, so they
    // are kept as HTML. They are protected before emphasis, which strips the tags it encloses.
    .replace(/<sup>/giu, () => kept.add('<sup>'))
    .replace(/<\/sup>/giu, () => kept.add('</sup>'))
    .replace(/<em>([\s\S]*?)<\/em>/giu, (_match, value: string) => emphasize('*', stripTags(value)))
    .replace(/<b>([\s\S]*?)<\/b>/giu, (_match, value: string) => emphasize('**', stripTags(value)))
    .replace(/<a\s+([^>]*)>([\s\S]*?)<\/a>/giu, (_match, attributes: string, value: string) =>
      link(attributes, collapseSpace(decodeHtml(stripTags(value)))),
    );
  // A decoded "&lt;" is text. Left bare, Markdown would read it as the start of an HTML tag, which
  // editors strip; the tags a hover should render are all still placeholders at this point.
  return decodeHtml(stripTags(result)).replace(/</gu, '\\<');
}

// Signatures are shown in a code block, so a heading's <br> (LuaJIT lists alternative call forms
// that way) becomes a real line break instead of running the forms together.
function htmlInlineToText(html: string): string {
  return decodeHtml(stripTags(html.replace(/<br\s*\/?>/giu, '\n')))
    .split('\n')
    .map(collapseSpace)
    .filter(Boolean)
    .join('\n');
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
  const text = collapseSpace(decodeHtml(stripTags(html)));
  return text ? `\`${text}\`` : '';
}

// Only source-formatting whitespace collapses. A published no-break space (U+00A0, "ISO C") is
// content and is kept, which the Unicode-aware \s class would not do.
function collapseSpace(value: string): string {
  return value.replace(/[ \t\r\n]+/gu, ' ').trim();
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

// Entities decode to the exact characters the page displays ("···", "§", "–", "≤"); an ASCII
// stand-in would change the published text, e.g. turn the vararg "···" into Lua's "...". HTML entity
// names are case-sensitive, and a name missing here fails generation instead of leaking "&name;".
const namedEntities: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  copy: '\u00A9',
  ge: '\u2265',
  gt: '>',
  hellip: '\u2026',
  laquo: '\u00AB',
  ldquo: '\u201C',
  le: '\u2264',
  lsquo: '\u2018',
  lt: '<',
  mdash: '\u2014',
  middot: '\u00B7',
  nbsp: '\u00A0',
  ndash: '\u2013',
  pi: '\u03C0',
  plusmn: '\u00B1',
  quot: '"',
  raquo: '\u00BB',
  rarr: '\u2192',
  rdquo: '\u201D',
  rsquo: '\u2019',
  sect: '\u00A7',
  times: '\u00D7',
};

export function decodeHtml(value: string): string {
  return value.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z]+);/gu, (entity, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    }
    const decoded = namedEntities[name];
    if (decoded === undefined) throw new Error(`Unsupported HTML entity ${entity}`);
    return decoded;
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
      licenseStatus: 'unknown',
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
