import assert from 'node:assert/strict';
import test from 'node:test';
import emojiData from 'emoji-datasource-google/emoji.json';
import { reactionTypeSchema } from './reaction';
import { reactionEmojiValues } from './reaction-emoji-values';

const toEmoji = (unified: string) =>
  String.fromCodePoint(...unified.split('-').map((part) => parseInt(part, 16)));

const expectedReactionEmojiValues = emojiData.flatMap((entry) =>
  entry.category === 'Component'
    ? []
    : [
        entry.unified,
        ...Object.values(entry.skin_variations ?? {}).map((skin) => skin.unified),
      ].map(toEmoji),
);

test('generated allowlist preserves upstream values and their order', () => {
  assert.deepEqual(reactionEmojiValues, expectedReactionEmojiValues);
  assert.equal(reactionEmojiValues.length, 3781);
  assert.equal(new Set(reactionEmojiValues).size, reactionEmojiValues.length);

  for (const value of ['👩‍❤️‍💋‍👨', '❤️', '🇰🇷', '🏳️‍⚧️']) {
    assert.equal(reactionEmojiValues.includes(value), true, value);
  }
});

test('catalog membership rejects invalid and non-fully-qualified values', () => {
  for (const value of ['custom:party', '👩‍❤‍💋‍👨', '🫪', 'not-an-emoji']) {
    assert.equal(reactionEmojiValues.includes(value), false, value);
    assert.equal(reactionTypeSchema.safeParse(value).success, false, value);
  }
});

test('reaction type validation accepts every server allowlist value', () => {
  for (const value of reactionEmojiValues) {
    assert.equal(reactionTypeSchema.safeParse(value).success, true, value);
  }
});
