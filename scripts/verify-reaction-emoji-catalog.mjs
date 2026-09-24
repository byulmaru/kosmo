#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const valuesPath = path.join(repoRoot, 'packages/core/validation/reaction-emoji-values.ts');
const catalogPath = path.join(repoRoot, 'apps/app/src/components/reaction/reactionEmojiCatalog.ts');
const assetRoot = path.join(repoRoot, 'apps/app/public/reaction-emoji/v2.051');

function readGeneratedJson(filePath, expression) {
  const source = fs.readFileSync(filePath, 'utf8');
  const match = source.match(expression);
  if (!match) {
    throw new Error(`Generated JSON was not found in ${path.relative(repoRoot, filePath)}`);
  }
  return vm.runInNewContext(`(${match[1]})`, Object.create(null));
}

const values = readGeneratedJson(
  valuesPath,
  /export const reactionEmojiValues = ([\s\S]*?) as const;/,
);
const catalogSource = fs.readFileSync(catalogPath, 'utf8');
const catalog = [
  ...catalogSource.matchAll(
    /const reactionEmojiCatalogChunk\d+: readonly ReactionEmojiCatalogOption\[\] = ([\s\S]*?);/g,
  ),
].flatMap((match) => vm.runInNewContext(`(${match[1]})`, Object.create(null)));

if (values.length !== 3944 || new Set(values).size !== values.length) {
  throw new Error(`Expected 3,944 unique Unicode values; got ${values.length}`);
}
if (catalog.length !== values.length) {
  throw new Error(`Catalog/value count mismatch: ${catalog.length} vs ${values.length}`);
}

const valueSet = new Set(values);
const catalogIds = new Set();
const referencedAssets = new Set();
const formatCounts = { png: 0, svg: 0 };
for (const option of catalog) {
  if (catalogIds.has(option.id)) {
    throw new Error(`Duplicate catalog id: ${option.id}`);
  }
  if (!valueSet.has(option.id) || option.emoji !== option.id) {
    throw new Error(`Catalog id is not a generated Unicode value: ${option.id}`);
  }
  if (!option.assetPath.startsWith('/reaction-emoji/v2.051/')) {
    throw new Error(`Unexpected asset path for ${option.id}: ${option.assetPath}`);
  }
  if (option.assetFormat !== 'png' && option.assetFormat !== 'svg') {
    throw new Error(`Unexpected asset format for ${option.id}: ${option.assetFormat}`);
  }

  const relativeAssetPath = option.assetPath.slice('/reaction-emoji/v2.051/'.length);
  const absoluteAssetPath = path.join(assetRoot, relativeAssetPath);
  if (!fs.statSync(absoluteAssetPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing asset for ${option.id}: ${relativeAssetPath}`);
  }
  if (referencedAssets.has(relativeAssetPath)) {
    throw new Error(`Duplicate asset mapping: ${relativeAssetPath}`);
  }
  catalogIds.add(option.id);
  referencedAssets.add(relativeAssetPath);
  formatCounts[option.assetFormat] += 1;
}

for (const value of values) {
  if (!catalogIds.has(value)) {
    throw new Error(`Missing catalog entry: ${value}`);
  }
}

const actualAssets = new Set(
  fs.readdirSync(assetRoot).filter((fileName) => /\.(png|svg)$/u.test(fileName)),
);
if (actualAssets.size !== referencedAssets.size) {
  throw new Error(`Asset count mismatch: ${actualAssets.size} vs ${referencedAssets.size}`);
}
for (const asset of actualAssets) {
  if (!referencedAssets.has(asset)) {
    throw new Error(`Unreferenced asset: ${asset}`);
  }
}
if (formatCounts.png !== 3682 || formatCounts.svg !== 262) {
  throw new Error(`Unexpected asset format counts: ${JSON.stringify(formatCounts)}`);
}

console.log(
  JSON.stringify(
    {
      catalog: catalog.length,
      uniqueIds: catalogIds.size,
      assets: actualAssets.size,
      png: formatCounts.png,
      svg: formatCounts.svg,
    },
    null,
    2,
  ),
);
