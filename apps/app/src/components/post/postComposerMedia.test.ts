import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertImageUploadResponse,
  ImageUploadError,
} from '../media/imageUploadErrors';
import { releaseComposerMediaPreview, uploadComposerMedia } from './postComposerMedia';

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

test('attributes issue, transfer, and complete failures without exposing callback details', async () => {
  await assert.rejects(
    uploadComposerMedia({
      complete: async () => undefined,
      isActive: () => true,
      issue: async () => {
        throw new Error('private issue detail');
      },
      put: async () => undefined,
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'issue' &&
      error.failure.reason === 'transient' &&
      !error.message.includes('private issue detail'),
  );

  await assert.rejects(
    uploadComposerMedia({
      complete: async () => undefined,
      isActive: () => true,
      issue: async () => ({ mediaId: 'media-1', uploadUrl: 'https://upload.example/1' }),
      put: async () => {
        throw new ImageUploadError({ reason: 'invalid-image', stage: 'transfer' });
      },
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'transfer' &&
      error.failure.reason === 'invalid-image',
  );

  await assert.rejects(
    uploadComposerMedia({
      complete: async () => {
        throw new Error('private complete detail');
      },
      isActive: () => true,
      issue: async () => ({ mediaId: 'media-1', uploadUrl: 'https://upload.example/1' }),
      put: async () => undefined,
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'complete' &&
      error.failure.reason === 'transient' &&
      !error.message.includes('private complete detail'),
  );
});

test('production PUT response keeps the allowlisted transfer reason through the Composer sequence', async () => {
  let completed = false;

  await assert.rejects(
    uploadComposerMedia({
      complete: async () => {
        completed = true;
      },
      isActive: () => true,
      issue: async () => ({ mediaId: 'media-1', uploadUrl: 'https://upload.example/1' }),
      put: async () => {
        await assertImageUploadResponse(
          new Response(
            JSON.stringify({
              error: { code: 'size_limit_exceeded', message: 'storage secret' },
            }),
            { status: 413, headers: { 'content-type': 'application/json' } },
          ),
        );
      },
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'transfer' &&
      error.failure.reason === 'file-too-large' &&
      !error.message.includes('storage secret'),
  );

  assert.equal(completed, false);
});
