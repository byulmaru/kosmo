import assert from 'node:assert/strict';
import test from 'node:test';
import { reactionEmojiValues } from './reaction-emoji-values';

test('Unicode 17 catalog preserves fully-qualified values and their order source', () => {
  assert.equal(reactionEmojiValues.length, 3944);
  assert.equal(new Set(reactionEmojiValues).size, reactionEmojiValues.length);

  for (const value of ['👩‍❤️‍💋‍👨', '❤️', '🇰🇷', '🏳️‍⚧️']) {
    assert.equal(reactionEmojiValues.includes(value), true, value);
  }
});

test('catalog membership rejects invalid and non-fully-qualified values', () => {
  for (const value of ['custom:party', '👩‍❤‍💋‍👨', 'not-an-emoji']) {
    assert.equal(reactionEmojiValues.includes(value), false, value);
  }
});
