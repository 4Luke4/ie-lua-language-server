import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const expectedSections = [
  'ee-game-lua-functions',
  'eeex-functions',
  'ee-game-structures-x64',
  'lua52',
  'luajit',
  'ee-utility-functions',
] as const;

const splitSections = new Set([
  'ee-game-lua-functions',
  'eeex-functions',
  'ee-game-structures-x64',
]);

function main(): void {
  const apiIndexPath = path.resolve(repoRoot, 'resources/api/api-index.json');
  if (!fs.existsSync(apiIndexPath)) {
    throw new Error('Missing resources/api/api-index.json. Run npm run ingest:docs first.');
  }
  auditMarketplaceIcon();

  const apiIndex = JSON.parse(fs.readFileSync(apiIndexPath, 'utf8')) as {
    schemaVersion?: number;
    symbols?: unknown[];
    sections?: Array<{
      id?: string;
      files?: Array<{
        title?: string;
        file?: string;
        symbolCount?: number;
        upstreamPath?: string;
      }>;
      symbolCount?: number;
    }>;
  };
  if (apiIndex.schemaVersion !== 3) {
    throw new Error('Generated API manifest must use schema version 3.');
  }
  if (apiIndex.symbols) {
    throw new Error(
      'resources/api/api-index.json must be a manifest and must not contain symbols.',
    );
  }
  if (!apiIndex.sections || apiIndex.sections.length !== expectedSections.length) {
    throw new Error('API manifest must reference exactly the six required source sections.');
  }

  const seenSections = new Set<string>();
  const expectedFiles = new Set<string>();
  const seenSymbolIds = new Set<string>();
  for (const expectedSection of expectedSections) {
    const matchingSections = apiIndex.sections.filter((section) => section.id === expectedSection);
    if (matchingSections.length !== 1) {
      throw new Error(`API manifest must reference section exactly once: ${expectedSection}`);
    }
    if (seenSections.has(expectedSection)) {
      throw new Error(`API manifest has duplicate section reference: ${expectedSection}`);
    }
    seenSections.add(expectedSection);
    const sectionReference = matchingSections[0]!;
    if (!sectionReference.files || sectionReference.files.length === 0) {
      throw new Error(`API manifest is missing shard references: ${expectedSection}`);
    }
    if (splitSections.has(expectedSection) && sectionReference.files.length < 2) {
      throw new Error(
        `API manifest section must be split into category shards: ${expectedSection}`,
      );
    }

    let aggregateCount = 0;
    for (const fileReference of sectionReference.files) {
      if (
        !fileReference.title ||
        !fileReference.file?.endsWith('.json') ||
        !Number.isSafeInteger(fileReference.symbolCount) ||
        fileReference.symbolCount! < 0
      ) {
        throw new Error(`API manifest has an incomplete shard reference: ${expectedSection}`);
      }
      if (expectedFiles.has(fileReference.file)) {
        throw new Error(`API manifest references a shard more than once: ${fileReference.file}`);
      }
      if (splitSections.has(expectedSection) && !fileReference.upstreamPath) {
        throw new Error(`API category shard is missing its upstream path: ${fileReference.file}`);
      }
      expectedFiles.add(fileReference.file);
      aggregateCount += fileReference.symbolCount ?? 0;
      auditSectionFile(
        expectedSection,
        fileReference.title,
        fileReference.file,
        fileReference.upstreamPath,
        fileReference.symbolCount,
        seenSymbolIds,
      );
    }
    if (aggregateCount !== sectionReference.symbolCount) {
      throw new Error(`API manifest aggregate symbol count mismatch: ${expectedSection}`);
    }
  }
  auditNoExtraSectionFiles(expectedFiles);

  assertBundledRuntime(path.resolve(repoRoot, 'dist/client/extension.js'), [
    '@ie-lua/shared',
    'vscode-languageclient',
  ]);
  assertBundledRuntime(path.resolve(repoRoot, 'dist/server/server.js'), [
    '@ie-lua/shared',
    'luaparse',
    'vscode-languageserver',
    'vscode-languageserver-textdocument',
  ]);

  const vsixFiles = fs.readdirSync(repoRoot).filter((entry) => entry.endsWith('.vsix'));
  if (vsixFiles.length > 1) {
    throw new Error('Package audit expected at most one VSIX artifact in the repository root.');
  }
}

function auditMarketplaceIcon(): void {
  const packageJsonPath = path.resolve(repoRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    icon?: string;
  };
  if (!packageJson.icon) {
    throw new Error('package.json must declare a Marketplace icon.');
  }

  const iconPath = path.resolve(repoRoot, packageJson.icon);
  const relativeIconPath = path.relative(repoRoot, iconPath);
  if (relativeIconPath.startsWith('..') || path.isAbsolute(relativeIconPath)) {
    throw new Error(`Marketplace icon must be inside the repository: ${packageJson.icon}`);
  }
  if (!fs.existsSync(iconPath)) {
    throw new Error(`Missing Marketplace icon: ${packageJson.icon}`);
  }

  const icon = fs.readFileSync(iconPath);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!icon.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error(`Marketplace icon must be a PNG file: ${packageJson.icon}`);
  }
  if (icon.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error(`Marketplace icon PNG is missing an IHDR chunk: ${packageJson.icon}`);
  }

  const width = icon.readUInt32BE(16);
  const height = icon.readUInt32BE(20);
  if (width < 256 || height < 256) {
    throw new Error(
      `Marketplace icon must be at least 256x256 pixels: ${packageJson.icon} is ${width}x${height}.`,
    );
  }
}

function auditSectionFile(
  expectedSection: string,
  expectedTitle: string,
  relativeFile: string,
  expectedUpstreamPath: string | undefined,
  expectedSymbolCount: number | undefined,
  seenSymbolIds: Set<string>,
): void {
  const sectionPath = path.resolve(repoRoot, 'resources/api', relativeFile);
  const sectionRoot = path.resolve(repoRoot, 'resources/api/sections');
  const relativeToSectionRoot = path.relative(sectionRoot, sectionPath);
  if (relativeToSectionRoot.startsWith('..') || path.isAbsolute(relativeToSectionRoot)) {
    throw new Error(`API section file must be under resources/api/sections: ${relativeFile}`);
  }
  if (!fs.existsSync(sectionPath)) {
    throw new Error(`Missing API section file: ${relativeFile}`);
  }

  const section = JSON.parse(fs.readFileSync(sectionPath, 'utf8')) as {
    schemaVersion?: number;
    title?: string;
    upstreamPath?: string;
    source?: {
      id?: string;
      licenseStatus?: string;
    };
    symbols?: Array<{
      id?: string;
      name?: string;
      kind?: string;
      instanceName?: string;
      containerName?: string;
      dataType?: string;
      byteOffset?: string;
      byteSize?: number;
      sizeExpression?: string;
      memberCount?: number;
      sourceSection?: string;
      licenseStatus?: string;
      documentationMarkdown?: string;
      documentationState?: string;
      signature?: string;
      parameters?: Array<{
        name?: string;
        type?: string;
        defaultValue?: string;
        description?: string;
      }>;
      returns?: Array<{ type?: string; description?: string }>;
      callableAliases?: Array<{
        name?: string;
        receiverType?: string;
        consumesFirstParameter?: boolean;
      }>;
      upstreamUrl?: string;
      upstreamCommit?: string;
    }>;
  };
  if (section.schemaVersion !== 3) {
    throw new Error(`Generated API section must use schema version 3: ${relativeFile}`);
  }
  if (section.source?.id !== expectedSection) {
    throw new Error(`API section file has wrong source id: ${relativeFile}`);
  }
  if (section.title !== expectedTitle || section.upstreamPath !== expectedUpstreamPath) {
    throw new Error(`API shard metadata does not match its manifest reference: ${relativeFile}`);
  }
  if (!Array.isArray(section.symbols)) {
    throw new Error(`API section file is missing symbols array: ${relativeFile}`);
  }
  if (expectedSymbolCount !== undefined && section.symbols.length !== expectedSymbolCount) {
    throw new Error(`API section symbol count mismatch: ${relativeFile}`);
  }
  for (const symbol of section.symbols) {
    if (!symbol.id) {
      throw new Error(`API section contains a symbol without an id: ${relativeFile}`);
    }
    if (seenSymbolIds.has(symbol.id)) {
      throw new Error(`Generated API data contains duplicate symbol id: ${symbol.id}`);
    }
    seenSymbolIds.add(symbol.id);
  }

  if (expectedSection === 'ee-game-structures-x64') {
    const structures = section.symbols.filter((symbol) => symbol.kind === 'structure');
    const fields = section.symbols.filter((symbol) => symbol.kind === 'field');
    if (section.symbols.length > 0 && (structures.length === 0 || fields.length === 0)) {
      throw new Error(
        `Non-empty structure shard must contain structures and fields: ${relativeFile}`,
      );
    }

    const fieldCounts = new Map<string, number>();
    for (const field of fields) {
      if (
        !field.containerName ||
        !field.instanceName ||
        !field.dataType ||
        !field.byteOffset ||
        (field.byteSize === undefined && !field.sizeExpression) ||
        field.name !== `${field.containerName}.${field.instanceName}`
      ) {
        throw new Error(
          `EE Game Structures (x64) field has incomplete layout metadata: ${field.id ?? '?'}`,
        );
      }
      fieldCounts.set(field.containerName, (fieldCounts.get(field.containerName) ?? 0) + 1);
    }

    for (const structure of structures) {
      if (
        structure.memberCount === undefined ||
        structure.memberCount !== (fieldCounts.get(structure.name ?? '') ?? 0)
      ) {
        throw new Error(`EE Game Structures (x64) member count mismatch: ${structure.id ?? '?'}`);
      }
    }
  }

  if (expectedSection === 'ee-game-lua-functions' || expectedSection === 'eeex-functions') {
    if (section.source?.licenseStatus !== 'allowed') {
      throw new Error(`${expectedSection} must ship distributable function documentation.`);
    }
    for (const symbol of section.symbols) {
      auditFunctionSymbol(symbol, relativeFile);
    }
  }

  for (const symbol of section.symbols) {
    if (symbol.sourceSection !== expectedSection) {
      throw new Error(`API symbol is in the wrong section file: ${symbol.id ?? '?'}`);
    }
    if (
      expectedSection === 'ee-game-structures-x64' &&
      symbol.kind !== 'structure' &&
      symbol.kind !== 'field'
    ) {
      throw new Error(`EE Game Structures (x64) symbol has wrong kind: ${symbol.id ?? '?'}`);
    }
    if (symbol.licenseStatus === 'permission-gated' && symbol.documentationMarkdown) {
      throw new Error('Permission-gated documentation text must not be bundled.');
    }
    if (
      symbol.licenseStatus === 'allowed' &&
      symbol.documentationState === 'documented' &&
      !symbol.documentationMarkdown
    ) {
      throw new Error(`Allowed documented symbol is missing source Markdown: ${symbol.id ?? '?'}`);
    }
  }
}

function auditFunctionSymbol(
  symbol: {
    id?: string;
    name?: string;
    kind?: string;
    signature?: string;
    parameters?: Array<{
      name?: string;
      type?: string;
      defaultValue?: string;
      description?: string;
    }>;
    returns?: Array<{ type?: string; description?: string }>;
    callableAliases?: Array<{
      name?: string;
      receiverType?: string;
      consumesFirstParameter?: boolean;
    }>;
    containerName?: string;
    instanceName?: string;
    documentationMarkdown?: string;
    upstreamUrl?: string;
    upstreamCommit?: string;
  },
  relativeFile: string,
): void {
  const label = symbol.id ?? '?';
  if (
    !symbol.name ||
    !/^[A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)?$/u.test(symbol.name) ||
    (symbol.kind !== 'function' && symbol.kind !== 'method')
  ) {
    throw new Error(`Function section has an invalid canonical callable: ${label}`);
  }
  const separator = Math.max(symbol.name.lastIndexOf('.'), symbol.name.lastIndexOf(':'));
  if (
    (separator === -1 && (symbol.containerName || symbol.instanceName)) ||
    (separator !== -1 &&
      (symbol.containerName !== symbol.name.slice(0, separator) ||
        symbol.instanceName !== symbol.name.slice(separator + 1)))
  ) {
    throw new Error(`Function section has inconsistent container/member metadata: ${label}`);
  }
  if (!symbol.signature?.startsWith(`${symbol.name}(`) || !symbol.signature.endsWith(')')) {
    throw new Error(`Function section has an invalid signature: ${label}`);
  }
  const signatureNames = symbol.signature
    .slice(symbol.name.length + 1, -1)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const parameterNames = (symbol.parameters ?? []).map((parameter) => parameter.name);
  if (
    parameterNames.some((name) => !name || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) ||
    signatureNames.join('\0') !== parameterNames.join('\0')
  ) {
    throw new Error(`Function section has inconsistent parameters: ${label}`);
  }
  if (symbol.returns?.some((value) => !value.type && !value.description)) {
    throw new Error(`Function section has an empty return record: ${label}`);
  }
  const aliasNames = new Set<string>();
  for (const alias of symbol.callableAliases ?? []) {
    if (
      !alias.name ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(alias.name) ||
      typeof alias.consumesFirstParameter !== 'boolean' ||
      aliasNames.has(alias.name)
    ) {
      throw new Error(`Function section has an invalid callable alias: ${label}`);
    }
    aliasNames.add(alias.name);
    if (
      alias.consumesFirstParameter &&
      (!alias.receiverType || alias.receiverType !== symbol.parameters?.[0]?.type)
    ) {
      throw new Error(`Function section alias has an inconsistent receiver: ${label}`);
    }
  }
  if (
    !symbol.documentationMarkdown ||
    !symbol.upstreamCommit ||
    !/^[0-9a-f]{40}$/u.test(symbol.upstreamCommit) ||
    !symbol.upstreamUrl?.includes(symbol.upstreamCommit) ||
    !/#L\d+$/u.test(symbol.upstreamUrl)
  ) {
    throw new Error(
      `Function section is missing documentation or pinned provenance: ${label} in ${relativeFile}`,
    );
  }
}

function auditNoExtraSectionFiles(expectedFiles: Set<string>): void {
  const sectionRoot = path.resolve(repoRoot, 'resources/api/sections');
  const visit = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.resolve(directory, entry.name);
      if (entry.isDirectory()) return visit(entryPath);
      if (!entry.isFile() || !entry.name.endsWith('.json')) return [];
      return [
        path.relative(path.resolve(repoRoot, 'resources/api'), entryPath).split(path.sep).join('/'),
      ];
    });
  for (const actualFile of visit(sectionRoot)) {
    if (!expectedFiles.has(actualFile)) {
      throw new Error(`Unexpected API section file: ${actualFile}`);
    }
  }
}

function assertBundledRuntime(bundlePath: string, moduleNames: string[]): void {
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Missing runtime bundle: ${path.relative(repoRoot, bundlePath)}`);
  }

  const text = fs.readFileSync(bundlePath, 'utf8');
  for (const moduleName of moduleNames) {
    const escapedModuleName = escapeRegex(moduleName);
    const externalRequire = new RegExp(
      `require\\((["'])${escapedModuleName}(?:/[^"']*)?\\1\\)`,
      'u',
    );
    if (externalRequire.test(text)) {
      throw new Error(
        `Runtime dependency ${moduleName} is not bundled in ${path.relative(repoRoot, bundlePath)}.`,
      );
    }
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
