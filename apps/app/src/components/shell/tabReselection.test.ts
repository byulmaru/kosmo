import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTabReselectionRegistry } from './tabReselection';

test('a mounted nested route temporarily takes precedence and cleanup restores the root handler', () => {
  const registry = createTabReselectionRegistry();
  const calls: string[] = [];
  const unregisterRoot = registry.register('profile', () => calls.push('root'));
  const unregisterDetail = registry.register('profile', () => calls.push('detail'));

  registry.reselect('profile');
  unregisterDetail();
  registry.reselect('profile');
  unregisterRoot();
  registry.reselect('profile');

  assert.deepEqual(calls, ['detail', 'root']);
});
