import emojiData from 'emoji-datasource-google/emoji.json';
import englishData from 'emojibase-data/en/data.json';
import koreanData from 'emojibase-data/ko/data.json';

export type ReactionEmojiAsset = Readonly<{
  format: 'png';
  path: string;
}>;

export type ReactionEmojiCatalogOption = Readonly<{
  assetFormat: ReactionEmojiAsset['format'];
  assetPath: string;
  category: string;
  categoryLabel: string;
  emoji: string;
  id: string;
  keywords: ReadonlyArray<string>;
  label: string;
  labelEn: string;
}>;

const categories: Record<string, readonly [string, string]> = {
  'Smileys & Emotion': ['expressions', '표정과 감정'],
  'People & Body': ['gestures', '사람과 몸짓'],
  'Animals & Nature': ['nature', '동물과 자연'],
  'Food & Drink': ['food', '음식과 음료'],
  'Travel & Places': ['travel', '여행과 장소'],
  Activities: ['activities', '활동'],
  Objects: ['objects', '사물'],
  Symbols: ['symbols', '기호'],
  Flags: ['flags', '깃발'],
};

const toEmoji = (unified: string) =>
  String.fromCodePoint(...unified.split('-').map((part) => parseInt(part, 16)));
const lookupKey = (emoji: string) =>
  Array.from(emoji)
    .filter((part) => part !== '\uFE0F' && part !== '\uFE0E')
    .join('');

function annotations(data: typeof koreanData) {
  return new Map(
    data.flatMap((entry) =>
      [entry, ...(entry.skins ?? [])].map(
        (variant) =>
          [lookupKey(variant.emoji), { label: variant.label, tags: entry.tags ?? [] }] as const,
      ),
    ),
  );
}

const korean = annotations(koreanData);
const english = annotations(englishData);

export const reactionEmojiCatalog: readonly ReactionEmojiCatalogOption[] = emojiData
  .filter((entry) => entry.category !== 'Component')
  .sort((left, right) => left.sort_order - right.sort_order)
  .flatMap((entry) => {
    const category = categories[entry.category];
    if (!category) {
      return [];
    }
    return [entry, ...Object.values(entry.skin_variations ?? {})].map((variant) => {
      const emoji = toEmoji(variant.unified);
      const ko = korean.get(lookupKey(emoji));
      const en = english.get(lookupKey(emoji));
      if (!ko || !en) {
        throw new Error(`Missing emoji annotations: ${variant.unified}`);
      }
      return {
        id: emoji,
        emoji,
        category: category[0],
        categoryLabel: category[1],
        label: ko.label,
        labelEn: en.label,
        keywords: [ko.label, en.label, ...ko.tags, ...en.tags, ...entry.short_names],
        assetPath: `/reaction-emoji/emoji-16/${variant.image}`,
        assetFormat: 'png' as const,
      };
    });
  });

const reactionEmojiAssets = new Map<string, ReactionEmojiAsset>(
  reactionEmojiCatalog.map(({ assetFormat, assetPath, id }) => [
    id,
    { format: assetFormat, path: assetPath },
  ]),
);

export function getReactionEmojiAsset(type: string): ReactionEmojiAsset | null {
  return reactionEmojiAssets.get(type) ?? null;
}
