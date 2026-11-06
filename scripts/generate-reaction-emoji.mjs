import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const require = createRequire(new URL('../apps/app/package.json', import.meta.url));
const emojiData = require('emoji-datasource-google/emoji.json');
const englishData = require('emojibase-data/en/data.json');
const koreanData = require('emojibase-data/ko/data.json');

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const appPickerPath = resolve(
  repositoryRoot,
  'apps/app/src/components/reaction/reactionEmojiPickerOptions.json',
);
const coreValuesPath = resolve(
  repositoryRoot,
  'packages/core/validation/reaction-emoji-values.json',
);

const quickReactionOrder = new Map(
  ['🥹', '❤️', '🎉', '👀', '☘️', '🌈'].map((emoji, index) => [emoji, index]),
);

const categories = {
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

const toEmoji = (unified) =>
  String.fromCodePoint(...unified.split('-').map((part) => parseInt(part, 16)));
const lookupKey = (emoji) =>
  Array.from(emoji)
    .filter((part) => part !== '\uFE0F' && part !== '\uFE0E')
    .join('');

const annotations = (data) =>
  new Map(
    data.flatMap((entry) =>
      [entry, ...(entry.skins ?? [])].map((variant) => [
        lookupKey(variant.emoji),
        { label: variant.label, tags: entry.tags ?? [] },
      ]),
    ),
  );

const korean = annotations(koreanData);
const english = annotations(englishData);

const pickerOptions = [...emojiData]
  .filter((entry) => entry.category !== 'Component')
  .sort((left, right) => left.sort_order - right.sort_order)
  .flatMap((entry) => {
    const category = categories[entry.category];
    if (!category) {
      return [];
    }

    const emoji = toEmoji(entry.unified);
    const ko = korean.get(lookupKey(emoji));
    const en = english.get(lookupKey(emoji));
    if (!ko || !en) {
      throw new Error(`Missing emoji annotations: ${entry.unified}`);
    }

    const quickOrder = quickReactionOrder.get(emoji);
    const option = {
      id: emoji,
      emoji,
      category: category[0],
      categoryLabel: category[1],
      label: ko.label,
      quick: quickOrder !== undefined,
      keywords: [ko.label, en.label, ...ko.tags, ...en.tags, ...entry.short_names],
    };
    return quickOrder === undefined ? option : { ...option, quickOrder };
  });

const reactionEmojiValues = emojiData.flatMap((entry) =>
  entry.category === 'Component'
    ? []
    : [
        entry.unified,
        ...Object.values(entry.skin_variations ?? {}).map((skin) => skin.unified),
      ].map(toEmoji),
);

const writeJson = async (path, value) => {
  const options = await prettier.resolveConfig(path);
  writeFileSync(path, await prettier.format(JSON.stringify(value), { ...options, parser: 'json' }));
};

await writeJson(appPickerPath, pickerOptions);
await writeJson(coreValuesPath, reactionEmojiValues);
