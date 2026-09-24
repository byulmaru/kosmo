import catalogData from './reactionEmojiCatalog.data.json';

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
  quick?: boolean;
  recent?: boolean;
}>;

export const reactionEmojiCategoryOrder = [
  'expressions',
  'gestures',
  'nature',
  'food',
  'travel',
  'activities',
  'objects',
  'symbols',
  'flags',
] as const;

function imageName(emoji: string): string {
  return `${Array.from(emoji, (character) => character.codePointAt(0)!.toString(16).padStart(4, '0')).join('-')}.png`;
}

export const reactionEmojiCatalog: readonly ReactionEmojiCatalogOption[] = catalogData.map(
  (option) => ({
    ...option,
    emoji: option.id,
    assetPath: `/reaction-emoji/emoji-16/${imageName(option.id)}`,
    assetFormat: 'png' as const,
  }),
);

const reactionEmojiAssets = new Map<string, ReactionEmojiAsset>(
  reactionEmojiCatalog.map(({ assetFormat, assetPath, id }) => [
    id,
    { format: assetFormat, path: assetPath },
  ]),
);

export function getReactionEmojiAsset(type: string): ReactionEmojiAsset | null {
  return reactionEmojiAssets.get(type) ?? null;
}
