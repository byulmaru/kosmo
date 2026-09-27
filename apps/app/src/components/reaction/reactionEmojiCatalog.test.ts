import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getReactionEmojiAsset,
  reactionEmojiCatalog,
  reactionEmojiPickerOptions,
} from './reactionEmojiCatalog';

test('Emoji 16 catalog keeps all 3,781 assets while the picker offers base emoji', () => {
  assert.equal(reactionEmojiCatalog.length, 3781);
  assert.equal(new Set(reactionEmojiCatalog.map((option) => option.id)).size, 3781);

  const heart = reactionEmojiCatalog.find((option) => option.id === '❤️');
  assert.equal(heart?.label, '빨간색 하트');
  assert.equal(heart?.labelEn, 'red heart');
  assert.equal(heart?.keywords.includes('하트'), true);
  assert.equal(heart?.keywords.includes('red heart'), true);
  assert.equal(getReactionEmojiAsset('❤️')?.path, '/reaction-emoji/emoji-16/2764-fe0f.png');
  assert.equal(getReactionEmojiAsset('custom:party'), null);
  assert.equal(reactionEmojiPickerOptions.length, 1906);
  assert.equal(
    reactionEmojiPickerOptions.some((option) => option.id === '👋🏽'),
    false,
  );
  assert.equal(getReactionEmojiAsset('👋🏽')?.format, 'png');
  assert.deepEqual(
    reactionEmojiCatalog
      .filter((option) => option.quick)
      .sort((left, right) => left.quickOrder! - right.quickOrder!)
      .map((option) => option.emoji),
    ['🥹', '❤️', '🎉', '👀', '☘️', '🌈'],
  );
});
