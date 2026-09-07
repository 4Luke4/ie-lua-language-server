import * as fs from 'node:fs';
import * as path from 'node:path';
import { allSourceSections, type ApiIndex, type ApiSymbol } from '@ie-lua/shared';

type RecordValue = Record<string, unknown>;
function record(value: unknown): asserts value is RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected API object');
}
function array(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected API array');
}
function strings(value: RecordValue, required: string[], optional: string[] = []): void {
  for (const key of required) {
    if (typeof value[key] !== 'string') throw new Error(`Expected API string: ${key}`);
  }
  for (const key of optional) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`Expected API string: ${key}`);
  }
}
function choice(value: unknown, allowed: readonly unknown[]): void {
  if (!allowed.includes(value)) throw new Error('Unsupported API metadata value');
}
function metadata(value: RecordValue): void {
  choice(value.schemaVersion, [1, 2, 3]);
  strings(value, ['generatedAt']);
}
function validateSymbols(value: unknown): asserts value is ApiSymbol[] {
  array(value);
  for (const symbol of value) {
    record(symbol);
    strings(symbol, ['id', 'name', 'upstreamUrl'], [
      'signature', 'instanceName', 'containerName', 'dataType', 'byteOffset', 'sizeExpression',
      'documentationMarkdown', 'upstreamCommit',
    ]);
    choice(symbol.kind, ['function', 'method', 'module', 'structure', 'field', 'variable', 'keyword', 'annotation']);
    choice(symbol.sourceSection, allSourceSections);
    choice(symbol.documentationState, ['documented', 'undocumented']);
    choice(symbol.licenseStatus, ['allowed', 'unknown']);
    for (const key of ['byteSize', 'memberCount']) {
      if (symbol[key] !== undefined && (!Number.isSafeInteger(symbol[key]) || (symbol[key] as number) < 0)) {
        throw new Error(`Expected API nonnegative integer: ${key}`);
      }
    }
    for (const key of ['parameters', 'returns', 'callableAliases']) {
      const entries = symbol[key];
      if (entries === undefined) continue;
      array(entries);
      for (const entry of entries) {
        record(entry);
        if (key === 'parameters') strings(entry, ['name'], ['type', 'defaultValue', 'description']);
        if (key === 'returns') strings(entry, [], ['type', 'description']);
        if (key === 'callableAliases') {
          strings(entry, ['name'], ['receiverType']);
          if (typeof entry.consumesFirstParameter !== 'boolean') throw new Error('Expected API alias boolean');
        }
      }
    }
  }
}

export function loadApiIndexFromManifest(manifestPath: string): ApiIndex {
  const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  record(manifest);
  metadata(manifest);
  array(manifest.sources);
  for (const source of manifest.sources) {
    record(source);
    strings(source, ['title', 'url'], ['commit']);
    choice(source.id, allSourceSections);
    choice(source.licenseStatus, ['allowed', 'unknown']);
  }
  if ('symbols' in manifest) {
    validateSymbols(manifest.symbols);
    return manifest as unknown as ApiIndex;
  }

  array(manifest.sections);
  const files: string[] = [];
  for (const section of manifest.sections) {
    record(section);
    choice(section.id, allSourceSections);
    const references = manifest.schemaVersion === 3 ? section.files : [section];
    array(references);
    for (const reference of references) {
      record(reference);
      strings(reference, ['file']);
      files.push(reference.file as string);
    }
  }
  const manifestDirectory = path.dirname(manifestPath);
  const symbols: ApiSymbol[] = [];
  for (const relativeFile of files) {
    const sectionPath = path.resolve(manifestDirectory, relativeFile);
    const relativeToManifest = path.relative(manifestDirectory, sectionPath);
    // Lexical containment is not a sandbox against symlinks or a malicious local owner.
    if (relativeToManifest.startsWith('..') || path.isAbsolute(relativeToManifest)) {
      throw new Error(`API section file escapes the manifest directory: ${relativeFile}`);
    }
    const section: unknown = JSON.parse(fs.readFileSync(sectionPath, 'utf8'));
    record(section);
    metadata(section);
    validateSymbols(section.symbols);
    symbols.push(...section.symbols);
  }

  return {
    schemaVersion: manifest.schemaVersion as ApiIndex['schemaVersion'],
    generatedAt: manifest.generatedAt as string,
    sources: manifest.sources as ApiIndex['sources'],
    symbols,
  };
}
