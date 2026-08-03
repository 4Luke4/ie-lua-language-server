import assert from 'node:assert/strict';
import test from 'node:test';
import { DebouncedValidationScheduler, shouldValidate } from './validationScheduler';

void test('validation mode trigger matrix matches the public contract', () => {
  assert.equal(shouldValidate('manual', 'manual'), true);
  assert.equal(shouldValidate('manual', 'save'), false);
  assert.equal(shouldValidate('manual', 'type'), false);

  assert.equal(shouldValidate('save', 'save'), true);
  assert.equal(shouldValidate('save', 'type'), false);

  assert.equal(shouldValidate('type', 'save'), false);
  assert.equal(shouldValidate('type', 'type'), true);

  assert.equal(shouldValidate('saveAndType', 'save'), true);
  assert.equal(shouldValidate('saveAndType', 'type'), true);
});

void test('type validation scheduler debounces repeated edits', async () => {
  const scheduler = new DebouncedValidationScheduler();
  let count = 0;
  scheduler.schedule(
    'file',
    () => {
      count += 1;
    },
    30,
  );
  scheduler.schedule(
    'file',
    () => {
      count += 1;
    },
    30,
  );
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(count, 1);
});

void test('type validation scheduler accepts a per-validation delay', async () => {
  const scheduler = new DebouncedValidationScheduler();
  let called = false;
  scheduler.schedule(
    'file',
    () => {
      called = true;
    },
    20,
  );

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(called, true);
});
