import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getReactionSummaryLayout } from './reactionSummaryLayout';

test('ReactionSummary reserves the trailing control and recomputes its +N width', () => {
  const layout = getReactionSummaryLayout({
    availableWidth: 140,
    entryWidths: [48, 48, 48],
    ellipsisWidth: 32,
    gap: 4,
    overflowWidths: { 1: 44, 2: 52, 3: 60 },
  });

  assert.deepEqual(layout, { hiddenCount: 2, visibleCount: 1 });
});

test('ReactionSummary keeps the server prefix when only the people control fits', () => {
  const layout = getReactionSummaryLayout({
    availableWidth: 52,
    entryWidths: [48, 48],
    ellipsisWidth: 32,
    gap: 4,
    overflowWidths: { 1: 44, 2: 52 },
  });

  assert.deepEqual(layout, { hiddenCount: 2, visibleCount: 0 });
});

test('ReactionSummary shows every type and ellipsis when they fit exactly', () => {
  assert.deepEqual(
    getReactionSummaryLayout({
      availableWidth: 188,
      entryWidths: [48, 48, 48],
      ellipsisWidth: 32,
      gap: 4,
      overflowWidths: { 1: 44, 2: 52, 3: 60 },
    }),
    { hiddenCount: 0, visibleCount: 3 },
  );
});
