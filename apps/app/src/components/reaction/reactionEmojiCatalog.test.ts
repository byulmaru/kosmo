import assert from 'node:assert/strict';
import test from 'node:test';
import { getReactionEmojiAsset, reactionEmojiCatalog } from './reactionEmojiCatalog';

test('Noto catalog provides the same 3,781 selectable values with localized search', () => {
  assert.equal(reactionEmojiCatalog.length, 3781);
  assert.equal(new Set(reactionEmojiCatalog.map((option) => option.id)).size, 3781);

  const heart = reactionEmojiCatalog.find((option) => option.id === '❤️');
  assert.equal(heart?.label, '빨간색 하트');
  assert.equal(heart?.labelEn, 'red heart');
  assert.equal(heart?.keywords.includes('하트'), true);
  assert.equal(heart?.keywords.includes('red heart'), true);
  assert.equal(getReactionEmojiAsset('❤️')?.path, '/reaction-emoji/emoji-16/2764-fe0f.png');
  assert.equal(getReactionEmojiAsset('custom:party'), null);
});
