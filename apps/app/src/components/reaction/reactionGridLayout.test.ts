import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMobileReactionGridLayout } from './reactionGridLayout';

test('mobile reaction grid fits touch targets across phone widths and text sizes', () => {
  assert.deepEqual(getMobileReactionGridLayout(368, 1), {
    columns: 7,
    columnGap: 32 / 6,
    targetSize: 48,
  });
  assert.deepEqual(getMobileReactionGridLayout(396, 1), {
    columns: 8,
    columnGap: 12 / 7,
    targetSize: 48,
  });
  assert.deepEqual(getMobileReactionGridLayout(286, 1), {
    columns: 5,
    columnGap: 46 / 4,
    targetSize: 48,
  });
  assert.deepEqual(getMobileReactionGridLayout(368, 1.5), {
    columns: 5,
    columnGap: 8 / 4,
    targetSize: 72,
  });
  assert.deepEqual(getMobileReactionGridLayout(368, 2), {
    columns: 3,
    columnGap: 80 / 2,
    targetSize: 96,
  });
});
