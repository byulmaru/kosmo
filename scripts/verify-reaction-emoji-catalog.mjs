#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(repoRoot, 'apps/app/package.json'));
const source = require('emoji-datasource-google/emoji.json');

const assetRoot = path.join(repoRoot, 'apps/app/public/reaction-emoji/emoji-16');
const entries = source.flatMap((entry) =>
  entry.category === 'Component' ? [] : [entry, ...Object.values(entry.skin_variations ?? {})],
);

if (entries.length !== 3781 || new Set(entries.map((entry) => entry.unified)).size !== 3781) {
  throw new Error('Expected 3,781 unique Emoji 16 values');
}
for (const entry of entries) {
  if (!fs.statSync(path.join(assetRoot, entry.image), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing package image: ${entry.image}`);
  }
}

console.log(JSON.stringify({ catalog: entries.length, assets: entries.length }, null, 2));
