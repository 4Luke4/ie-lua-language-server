import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSettings, normalizeSettings } from './settings';

void test('settings merge preserves nested initialization defaults and client overrides', () => {
  const settings = normalizeSettings(
    mergeSettings(
      {
        validation: {
          mode: 'type',
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
  assert.equal(settings.diagnostics.unknownGlobals, 'warning');
  assert.deepEqual(settings.menu.blockKeys, ['action']);
  assert.deepEqual(settings.menu.expressionKeys, ['enabled']);
  assert.equal(settings.dialect, 'lua52');
});
