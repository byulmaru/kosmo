import assert from 'node:assert/strict';
import test from 'node:test';
import { postBodyTextSchema } from '@kosmo/core/validation';

test('trims outer whitespace and preserves internal line breaks', () => {
  assert.equal(postBodyTextSchema.parse('  첫 줄\n\n둘째 줄  '), '첫 줄\n\n둘째 줄');
});

test('rejects empty and over-500-character bodies', () => {
  assert.equal(postBodyTextSchema.safeParse(' \n ').success, false);
  assert.equal(postBodyTextSchema.safeParse('가'.repeat(500)).success, true);
  assert.equal(postBodyTextSchema.safeParse('가'.repeat(501)).success, false);
});
