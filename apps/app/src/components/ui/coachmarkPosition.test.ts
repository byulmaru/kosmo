import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCoachmarkPosition } from './coachmarkPosition';

test('positions a coachmark below its anchor when the lower space fits', () => {
  assert.deepEqual(
    getCoachmarkPosition({
      anchor: { x: 100, y: 120, width: 80, height: 40 },
      bubble: { width: 240, height: 120 },
      viewport: { width: 400, height: 800, topInset: 16, bottomInset: 16 },
    }),
    {
      arrowLeft: 120,
      height: 120,
      left: 20,
      maxHeight: 596,
      placement: 'bottom',
      top: 172,
      width: 240,
    },
  );
});

test('flips above the anchor and clamps horizontally near the viewport edge', () => {
  assert.deepEqual(
    getCoachmarkPosition({
      anchor: { x: 350, y: 680, width: 40, height: 40 },
      bubble: { width: 240, height: 120 },
      viewport: { width: 400, height: 800, topInset: 24, bottomInset: 32 },
    }),
    {
      arrowLeft: 224,
      height: 120,
      left: 144,
      maxHeight: 628,
      placement: 'top',
      top: 548,
      width: 240,
    },
  );
});

test('limits long content to the safe viewport while keeping the bubble in bounds', () => {
  assert.deepEqual(
    getCoachmarkPosition({
      anchor: { x: 160, y: 300, width: 80, height: 40 },
      bubble: { width: 360, height: 900 },
      viewport: { width: 360, height: 320, topInset: 12, bottomInset: 20 },
    }),
    {
      arrowLeft: 184,
      height: 260,
      left: 16,
      maxHeight: 260,
      placement: 'top',
      top: 28,
      width: 328,
    },
  );
});

test('keeps the bubble inside horizontal safe-area insets', () => {
  assert.deepEqual(
    getCoachmarkPosition({
      anchor: { x: 80, y: 120, width: 40, height: 40 },
      bubble: { width: 240, height: 120 },
      viewport: {
        height: 800,
        leftInset: 40,
        rightInset: 20,
        topInset: 16,
        bottomInset: 16,
        width: 400,
      },
    }),
    {
      arrowLeft: 44,
      height: 120,
      left: 56,
      maxHeight: 596,
      placement: 'bottom',
      top: 172,
      width: 240,
    },
  );
});
