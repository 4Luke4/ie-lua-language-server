import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ApiIndex, ApiIndexManifest, ApiSectionFile, ApiSymbol } from '@ie-lua/shared';

export function loadApiIndexFromManifest(manifestPath: string): ApiIndex {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ApiIndexManifest | ApiIndex;
  if ('symbols' in manifest) {
    return manifest;
  }

  const manifestDirectory = path.dirname(manifestPath);
  const files =
    manifest.schemaVersion === 3
      ? manifest.sections.flatMap((section) => section.files.map((file) => file.file))
      : manifest.sections.map((section) => section.file);
  const symbols: ApiSymbol[] = [];
  for (const relativeFile of files) {
    const sectionPath = path.resolve(manifestDirectory, relativeFile);
    const relativeToManifest = path.relative(manifestDirectory, sectionPath);
    if (relativeToManifest.startsWith('..') || path.isAbsolute(relativeToManifest)) {
      throw new Error(`API section file escapes the manifest directory: ${relativeFile}`);
    }
    const section = JSON.parse(fs.readFileSync(sectionPath, 'utf8')) as ApiSectionFile;
    symbols.push(...section.symbols);
  }

  return {
    schemaVersion: manifest.schemaVersion,
    generatedAt: manifest.generatedAt,
    sources: manifest.sources,
    symbols,
  };
}
