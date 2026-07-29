import assert from 'node:assert/strict';
import test from 'node:test';
import {
  postComposerMediaLimit,
  takeComposerMediaSelection,
  uploadComposerMedia,
} from './postComposerMedia';

test('takes only the remaining media slots while preserving picker order', () => {
  assert.deepEqual(takeComposerMediaSelection(2, ['third', 'fourth', 'fifth']), [
    'third',
    'fourth',
  ]);
  assert.deepEqual(takeComposerMediaSelection(postComposerMediaLimit, ['ignored']), []);
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
