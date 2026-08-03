import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_VALIDATION_DEBOUNCE_MS,
  MAX_VALIDATION_DEBOUNCE_MS,
  mergeSettings,
  normalizeSettings,
} from './settings';

void test('settings merge preserves nested initialization defaults and client overrides', () => {
  const settings = normalizeSettings(
    mergeSettings(
      {
        validation: {
          mode: 'type',
          debounceMs: 175,
        },
        menu: {
          blockKeys: ['action'],
        },
      },
      {
        diagnostics: {
          unknownGlobals: 'warning',
        },
        menu: {
          expressionKeys: ['enabled'],
        },
      },
    ),
  );

  assert.equal(settings.validation.mode, 'type');
  assert.equal(settings.validation.debounceMs, 175);
  assert.equal(settings.diagnostics.unknownGlobals, 'warning');
  assert.deepEqual(settings.menu.blockKeys, ['action']);
  assert.deepEqual(settings.menu.expressionKeys, ['enabled']);
  assert.equal(settings.dialect, 'lua52');
});

void test('validation debounce defaults to 300 ms and rejects invalid delays', () => {
  assert.equal(DEFAULT_VALIDATION_DEBOUNCE_MS, 300);
  assert.equal(normalizeSettings(undefined).validation.debounceMs, DEFAULT_VALIDATION_DEBOUNCE_MS);
  assert.equal(
    normalizeSettings({ validation: { debounceMs: 0 } }).validation.debounceMs,
    DEFAULT_VALIDATION_DEBOUNCE_MS,
  );
  assert.equal(
    normalizeSettings({ validation: { debounceMs: MAX_VALIDATION_DEBOUNCE_MS + 1 } }).validation
      .debounceMs,
    DEFAULT_VALIDATION_DEBOUNCE_MS,
  );
});
