import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMobileReactionGridLayout } from './reactionGridLayout';

test('mobile reaction grid fits touch targets across phone widths and text sizes', () => {
  assert.deepEqual(getMobileReactionGridLayout(368, 1), { columns: 7, targetSize: 48 });
  assert.deepEqual(getMobileReactionGridLayout(396, 1), { columns: 8, targetSize: 48 });
  assert.deepEqual(getMobileReactionGridLayout(286, 1), { columns: 5, targetSize: 48 });
  assert.deepEqual(getMobileReactionGridLayout(368, 1.5), { columns: 5, targetSize: 72 });
  assert.deepEqual(getMobileReactionGridLayout(368, 2), { columns: 3, targetSize: 96 });
});
