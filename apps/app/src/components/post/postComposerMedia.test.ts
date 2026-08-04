import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createClipboardMediaAsset,
  getClipboardImageFiles,
  releaseComposerMediaPreview,
  takeAvailableComposerMedia,
  uploadComposerMedia,
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

test('releases only Web object URL previews', () => {
  const released: string[] = [];
  const release = (url: string) => released.push(url);

  releaseComposerMediaPreview('blob:https://kosmo.example/preview', release);
  releaseComposerMediaPreview('file:///local/image.jpg', release);
  releaseComposerMediaPreview('data:image/png;base64,preview', release);

  assert.deepEqual(released, ['blob:https://kosmo.example/preview']);
});

test('issues, uploads, and completes a fresh media in order', async () => {
  const calls: string[] = [];
  const mediaId = await uploadComposerMedia({
    complete: async (id) => {
      calls.push(`complete:${id}`);
    },
    isActive: () => true,
    issue: async () => {
      calls.push('issue');
      return { mediaId: 'media-1', uploadUrl: 'https://upload.example/1' };
    },
    put: async (url) => {
      calls.push(`put:${url}`);
    },
  });

  assert.equal(mediaId, 'media-1');
  assert.deepEqual(calls, ['issue', 'put:https://upload.example/1', 'complete:media-1']);
});

test('does not issue an upload when the media is inactive before starting', async () => {
  let issueCalled = false;
  let putCalled = false;
  let completeCalled = false;

  const result = await uploadComposerMedia({
    complete: async () => {
      completeCalled = true;
    },
    isActive: () => false,
    issue: async () => {
      issueCalled = true;
      return { mediaId: 'inactive', uploadUrl: 'https://upload.example/inactive' };
    },
    put: async () => {
      putCalled = true;
    },
  });

  assert.equal(result, null);
  assert.equal(issueCalled, false);
  assert.equal(putCalled, false);
  assert.equal(completeCalled, false);
});

test('stops after removal so a late issue result cannot upload or complete', async () => {
  let active = true;
  let putCalled = false;
  let completeCalled = false;

  const result = await uploadComposerMedia({
    complete: async () => {
      completeCalled = true;
    },
    isActive: () => active,
    issue: async () => {
      active = false;
      return { mediaId: 'removed', uploadUrl: 'https://upload.example/removed' };
    },
    put: async () => {
      putCalled = true;
    },
  });

  assert.equal(result, null);
  assert.equal(putCalled, false);
  assert.equal(completeCalled, false);
});

test('every retry calls issue again and never reuses a failed upload URL', async () => {
  let issued = 0;
  const issue = async () => {
    issued += 1;
    return { mediaId: `media-${issued}`, uploadUrl: `https://upload.example/${issued}` };
  };

  await assert.rejects(
    uploadComposerMedia({
      complete: async () => undefined,
      isActive: () => true,
      issue,
      put: async () => {
        throw new Error('expired');
      },
    }),
  );
  const result = await uploadComposerMedia({
    complete: async () => undefined,
    isActive: () => true,
    issue,
    put: async () => undefined,
  });

  assert.equal(result, 'media-2');
  assert.equal(issued, 2);
});
