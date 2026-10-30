import assert from 'node:assert/strict';
import test from 'node:test';
import emojiData from 'emoji-datasource-google/emoji.json';
import englishData from 'emojibase-data/en/data.json';
import koreanData from 'emojibase-data/ko/data.json';
import { reactionEmojiPickerOptions } from './reactionEmojiCatalog';

const quickReactions = ['🥹', '❤️', '🎉', '👀', '☘️', '🌈'];
const toEmoji = (unified: string) =>
  String.fromCodePoint(...unified.split('-').map((part) => parseInt(part, 16)));
const lookupKey = (emoji: string) =>
  Array.from(emoji)
    .filter((part) => part !== '\uFE0F' && part !== '\uFE0E')
    .join('');

const baseEmojiEntries = [...emojiData]
  .filter((entry) => entry.category !== 'Component')
  .sort((left, right) => left.sort_order - right.sort_order);

test('generated picker records preserve upstream base order and annotations', () => {
  assert.deepEqual(
    reactionEmojiPickerOptions.map((option) => option.id),
    baseEmojiEntries.map((entry) => toEmoji(entry.unified)),
  );
  assert.equal(reactionEmojiPickerOptions.length, 1906);

  for (const option of reactionEmojiPickerOptions) {
    const key = lookupKey(option.id);
    const source = baseEmojiEntries.find((entry) => toEmoji(entry.unified) === option.id);
    const korean = koreanData.find((entry) => lookupKey(entry.emoji) === key);
    const english = englishData.find((entry) => lookupKey(entry.emoji) === key);
    assert.ok(source && korean && english, `Missing upstream data: ${option.id}`);
    assert.equal(option.label, korean.label);
    assert.deepEqual(option.keywords, [
      korean.label,
      english.label,
      ...(korean.tags ?? []),
      ...(english.tags ?? []),
      ...source.short_names,
    ]);
  }
});

test('picker keeps quick order, category mapping, and excludes skin variants', () => {
  assert.deepEqual(
    reactionEmojiPickerOptions
      .filter((option) => option.quick)
      .sort((left, right) => (left.quickOrder ?? Infinity) - (right.quickOrder ?? Infinity))
      .map(({ emoji, quickOrder }) => [emoji, quickOrder]),
    quickReactions.map((emoji, quickOrder) => [emoji, quickOrder]),
  );
  assert.equal(
    reactionEmojiPickerOptions.some((option) => option.id === '👋🏽'),
    false,
  );

  for (const [id, category, categoryLabel] of [
    ['😀', 'expressions', '표정과 감정'],
    ['👍', 'gestures', '사람과 몸짓'],
    ['🐶', 'nature', '동물과 자연'],
    ['🍎', 'food', '음식과 음료'],
    ['🚗', 'travel', '여행과 장소'],
    ['⚽', 'activities', '활동'],
    ['💡', 'objects', '사물'],
    ['⚠️', 'symbols', '기호'],
    ['🇰🇷', 'flags', '깃발'],
  ] as const) {
    const option = reactionEmojiPickerOptions.find((candidate) => candidate.id === id);
    assert.deepEqual([option?.category, option?.categoryLabel], [category, categoryLabel], id);
  }
});
