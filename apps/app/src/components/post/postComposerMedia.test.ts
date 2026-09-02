import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createClipboardMediaAsset,
  getClipboardImageFiles,
  takeAvailableComposerMedia,
} from './postComposerMedia';

test('keeps only image files from clipboard items in their original order', () => {
  const imageOne = new File(['one'], 'one.png', { type: 'image/png' });
  const imageTwo = new File(['two'], 'two.webp', { type: 'image/webp' });

  const files = getClipboardImageFiles([
    { getAsFile: () => imageOne, kind: 'file', type: 'image/png' },
    { getAsFile: () => null, kind: 'file', type: 'image/png' },
    {
      getAsFile: () => new File(['text'], 'text.txt', { type: 'text/plain' }),
      kind: 'file',
      type: 'text/plain',
    },
    { getAsFile: () => imageTwo, kind: 'file', type: 'image/webp' },
    { getAsFile: () => imageOne, kind: 'string', type: 'image/png' },
    {
      getAsFile: () => new File(['unknown'], 'unknown', { type: '' }),
      kind: 'file',
      type: 'image/png',
    },
  ]);

  assert.deepEqual(files, [imageOne, imageTwo]);
});

test('takes only the remaining Composer Media slots', () => {
  assert.deepEqual(takeAvailableComposerMedia(['third', 'fourth', 'fifth'], 2), [
    'third',
    'fourth',
  ]);
  assert.deepEqual(takeAvailableComposerMedia(['overflow'], 4), []);
});

test('normalizes a clipboard File into the existing upload asset shape', () => {
  const file = new File(['image'], 'paste.png', { type: 'image/png' });
  const asset = createClipboardMediaAsset(file, (value) => `blob:${value.name}`);

  assert.deepEqual(asset, {
    file,
    height: 0,
    mimeType: 'image/png',
    uri: 'blob:paste.png',
    width: 0,
  });
});
