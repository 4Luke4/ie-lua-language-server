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

function main(): void {
  const apiIndexPath = path.resolve(repoRoot, 'resources/api/api-index.json');
  if (!fs.existsSync(apiIndexPath)) {
    throw new Error('Missing resources/api/api-index.json. Run npm run ingest:docs first.');
  }
  auditMarketplaceIcon();

  const apiIndex = JSON.parse(fs.readFileSync(apiIndexPath, 'utf8')) as {
    symbols?: unknown[];
    sections?: Array<{
      id?: string;
      file?: string;
      symbolCount?: number;
    }>;
  };
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
  for (const expectedSection of expectedSections) {
    const sectionReference = apiIndex.sections.find((section) => section.id === expectedSection);
    if (!sectionReference?.file) {
      throw new Error(`API manifest is missing section file reference: ${expectedSection}`);
    }
    if (seenSections.has(expectedSection)) {
      throw new Error(`API manifest has duplicate section reference: ${expectedSection}`);
    }
    seenSections.add(expectedSection);
    expectedFiles.add(sectionReference.file);
    auditSectionFile(expectedSection, sectionReference.file, sectionReference.symbolCount);
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
  relativeFile: string,
  expectedSymbolCount: number | undefined,
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
    source?: {
      id?: string;
      licenseStatus?: string;
    };
    symbols?: Array<{
      id?: string;
      sourceSection?: string;
      licenseStatus?: string;
      documentationMarkdown?: string;
      documentationState?: string;
    }>;
  };
  if (section.source?.id !== expectedSection) {
    throw new Error(`API section file has wrong source id: ${relativeFile}`);
  }
  if (!Array.isArray(section.symbols)) {
    throw new Error(`API section file is missing symbols array: ${relativeFile}`);
  }
  if (expectedSymbolCount !== undefined && section.symbols.length !== expectedSymbolCount) {
    throw new Error(`API section symbol count mismatch: ${relativeFile}`);
  }

  for (const symbol of section.symbols) {
    if (symbol.sourceSection !== expectedSection) {
      throw new Error(`API symbol is in the wrong section file: ${symbol.id ?? '?'}`);
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

function auditNoExtraSectionFiles(expectedFiles: Set<string>): void {
  const sectionRoot = path.resolve(repoRoot, 'resources/api/sections');
  const actualFiles = fs
    .readdirSync(sectionRoot)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => `sections/${entry}`);
  for (const actualFile of actualFiles) {
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
