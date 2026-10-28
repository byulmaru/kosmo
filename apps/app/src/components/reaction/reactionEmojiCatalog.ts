import generatedPickerOptions from './reactionEmojiPickerOptions.json';

export type ReactionEmojiCatalogOption = Readonly<{
  category: string;
  categoryLabel: string;
  emoji: string;
  id: string;
  keywords: ReadonlyArray<string>;
  label: string;
  quick: boolean;
  quickOrder?: number;
}>;

export const reactionEmojiPickerOptions: readonly ReactionEmojiCatalogOption[] =
  generatedPickerOptions;
