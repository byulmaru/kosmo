import emojiData from 'emoji-datasource-google/emoji.json';

const toEmoji = (unified: string) =>
  String.fromCodePoint(...unified.split('-').map((part) => parseInt(part, 16)));

export const reactionEmojiValues: readonly string[] = emojiData.flatMap((entry) =>
  entry.category === 'Component'
    ? []
    : [
        entry.unified,
        ...Object.values(entry.skin_variations ?? {}).map((skin) => skin.unified),
      ].map(toEmoji),
);
