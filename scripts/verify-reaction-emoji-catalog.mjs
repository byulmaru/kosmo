#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const valuesPath = path.join(repoRoot, 'packages/core/validation/reaction-emoji-values.ts');
const catalogPath = path.join(
  repoRoot,
  'apps/app/src/components/reaction/reactionEmojiCatalog.data.json',
);
const assetRoot = path.join(repoRoot, 'apps/app/public/reaction-emoji/emoji-16');
const require = createRequire(path.join(repoRoot, 'apps/app/package.json'));
const source = require('emoji-datasource-google/emoji.json');

const entries = source.flatMap((entry) => [entry, ...Object.values(entry.skin_variations ?? {})]);
const toEmoji = (unified) =>
  String.fromCodePoint(...unified.split('-').map((part) => parseInt(part, 16)));
const imageByEmoji = new Map(
  entries
    .filter((entry) => !/^1F3F[B-F]$/u.test(entry.unified))
    .map((entry) => [toEmoji(entry.unified), entry.image]),
);

const valuesSource = fs.readFileSync(valuesPath, 'utf8');
const valuesMatch = valuesSource.match(/export const reactionEmojiValues = ([\s\S]*?) as const;/u);
if (!valuesMatch) {
  throw new Error('Reaction values were not found');
}
const values = vm.runInNewContext(`(${valuesMatch[1]})`, Object.create(null));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const valueSet = new Set(values);
const catalogIds = new Set();

if (values.length !== 3781 || valueSet.size !== 3781 || imageByEmoji.size !== 3781) {
  throw new Error('Expected 3,781 unique Emoji 16 values and images');
}
if (catalog.length !== 3781) {
  throw new Error(`Expected 3,781 catalog entries; got ${catalog.length}`);
}

for (const option of catalog) {
  if (catalogIds.has(option.id) || !valueSet.has(option.id)) {
    throw new Error(`Unexpected catalog id: ${option.id}`);
  }
  const image = imageByEmoji.get(option.id);
  if (!image || !fs.statSync(path.join(assetRoot, image), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing package image for ${option.id}: ${image}`);
  }
  catalogIds.add(option.id);
}
for (const value of values) {
  if (!catalogIds.has(value)) {
    throw new Error(`Missing catalog entry: ${value}`);
  }
}

console.log(JSON.stringify({ catalog: catalog.length, assets: imageByEmoji.size }, null, 2));
