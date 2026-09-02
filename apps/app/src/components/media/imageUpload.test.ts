import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseImagePreview, uploadImage } from './imageUpload';
import { ImageUploadError } from './imageUploadErrors';
import type { ImagePickerAsset } from 'expo-image-picker';

const createAsset = (overrides: Partial<ImagePickerAsset> = {}): ImagePickerAsset => ({
  height: 100,
  uri: 'file:///local/image.jpg',
  width: 100,
  ...overrides,
});

test('releases only Web object URL previews', () => {
  const released: string[] = [];

  releaseImagePreview('blob:https://kosmo.example/preview', (url) => released.push(url));
  releaseImagePreview('file:///local/image.jpg', (url) => released.push(url));
  releaseImagePreview('data:image/png;base64,preview', (url) => released.push(url));

  assert.deepEqual(released, ['blob:https://kosmo.example/preview']);
});

test('issues, uploads the File with its content type, and completes in order', async (t) => {
  const calls: string[] = [];
  const file = new File(['image'], 'image.jpg', { type: 'image/jpeg' });
  const put = t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method}:${String(input)}`);
      assert.equal(init?.body, file);
      assert.deepEqual(init?.headers, { 'content-type': 'image/jpeg' });
      return new Response(null, { status: 204 });
    },
  );

  const mediaId = await uploadImage({
    asset: createAsset({ file, mimeType: 'image/jpeg' }),
    complete: async (id) => {
      calls.push(`complete:${id}`);
    },
    isActive: () => true,
    issue: async () => {
      calls.push('issue');
      return { mediaId: 'media-1', uploadUrl: 'https://upload.example/1' };
    },
  });

  assert.equal(mediaId, 'media-1');
  assert.deepEqual(calls, ['issue', 'PUT:https://upload.example/1', 'complete:media-1']);
  assert.equal(put.mock.callCount(), 1);
});

test('fetches the asset URI as a Blob and omits an absent content type', async (t) => {
  const fallbackBlob = new Blob(['fallback'], { type: 'image/png' });
  const calls: Array<{ readonly body?: BodyInit | null; readonly headers?: HeadersInit }> = [];
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ body: init?.body, headers: init?.headers });
      return String(input) === 'file:///local/image.jpg'
        ? new Response(fallbackBlob, { status: 200 })
        : new Response(null, { status: 204 });
    },
  );

  await uploadImage({
    asset: createAsset(),
    complete: async () => undefined,
    isActive: () => true,
    issue: async () => ({ mediaId: 'media-1', uploadUrl: 'https://upload.example/1' }),
  });

  assert.equal(fetchMock.mock.callCount(), 2);
  assert.deepEqual(calls, [
    { body: undefined, headers: undefined },
    { body: fallbackBlob, headers: undefined },
  ]);
});

test('does not issue an upload when inactive before starting', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
    Promise.reject(new Error('fetch must not run')),
  );
  let issueCalled = false;
  let completeCalled = false;

  const result = await uploadImage({
    asset: createAsset(),
    complete: async () => {
      completeCalled = true;
    },
    isActive: () => false,
    issue: async () => {
      issueCalled = true;
      return { mediaId: 'inactive', uploadUrl: 'https://upload.example/inactive' };
    },
  });

  assert.equal(result, null);
  assert.equal(issueCalled, false);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(completeCalled, false);
});

test('stops after a late issue result becomes inactive', async (t) => {
  let active = true;
  let completeCalled = false;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
    Promise.reject(new Error('fetch must not run')),
  );

  const result = await uploadImage({
    asset: createAsset(),
    complete: async () => {
      completeCalled = true;
    },
    isActive: () => active,
    issue: async () => {
      active = false;
      return { mediaId: 'removed', uploadUrl: 'https://upload.example/removed' };
    },
  });

  assert.equal(result, null);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(completeCalled, false);
});

test('stops after PUT when the upload becomes inactive', async (t) => {
  let active = true;
  let completeCalled = false;
  t.mock.method(globalThis, 'fetch', async () => {
    active = false;
    return new Response(null, { status: 204 });
  });

  const result = await uploadImage({
    asset: createAsset({ file: new File(['image'], 'image.jpg') }),
    complete: async () => {
      completeCalled = true;
    },
    isActive: () => active,
    issue: async () => ({ mediaId: 'removed', uploadUrl: 'https://upload.example/removed' }),
  });

  assert.equal(result, null);
  assert.equal(completeCalled, false);
});

test('discards a late completion result when the upload becomes inactive', async (t) => {
  let active = true;
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));

  const result = await uploadImage({
    asset: createAsset({ file: new File(['image'], 'image.jpg') }),
    complete: async () => {
      active = false;
    },
    isActive: () => active,
    issue: async () => ({ mediaId: 'replaced', uploadUrl: 'https://upload.example/replaced' }),
  });

  assert.equal(result, null);
});

test('every retry issues a fresh Media and upload URL', async (t) => {
  let issued = 0;
  const requestedUrls: string[] = [];
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return requestedUrls.length === 1
      ? new Response(null, { status: 503 })
      : new Response(null, { status: 204 });
  });
  const issue = async () => {
    issued += 1;
    return { mediaId: `media-${issued}`, uploadUrl: `https://upload.example/${issued}` };
  };
  const asset = createAsset({ file: new File(['image'], 'image.jpg') });

  await assert.rejects(
    uploadImage({ asset, complete: async () => undefined, isActive: () => true, issue }),
  );
  const result = await uploadImage({
    asset,
    complete: async () => undefined,
    isActive: () => true,
    issue,
  });

  assert.equal(result, 'media-2');
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.deepEqual(requestedUrls, ['https://upload.example/1', 'https://upload.example/2']);
});

test('preserves safe issue, transfer, and complete failure classification', async (t) => {
  const asset = createAsset({ file: new File(['image'], 'image.jpg') });
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 204 }),
  );

  await assert.rejects(
    uploadImage({
      asset,
      complete: async () => undefined,
      isActive: () => true,
      issue: async () => {
        throw new Error('private issue detail');
      },
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'issue' &&
      error.failure.reason === 'transient' &&
      !error.message.includes('private issue detail'),
  );

  fetchMock.mock.mockImplementationOnce(
    async () =>
      new Response(
        JSON.stringify({ error: { code: 'size_limit_exceeded', message: 'storage secret' } }),
        { status: 413, headers: { 'content-type': 'application/json' } },
      ),
  );
  await assert.rejects(
    uploadImage({
      asset,
      complete: async () => undefined,
      isActive: () => true,
      issue: async () => ({ mediaId: 'media-1', uploadUrl: 'https://upload.example/1' }),
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'transfer' &&
      error.failure.reason === 'file-too-large' &&
      !error.message.includes('storage secret'),
  );

  await assert.rejects(
    uploadImage({
      asset,
      complete: async () => {
        throw new Error('private complete detail');
      },
      isActive: () => true,
      issue: async () => ({ mediaId: 'media-2', uploadUrl: 'https://upload.example/2' }),
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'complete' &&
      error.failure.reason === 'transient' &&
      !error.message.includes('private complete detail'),
  );
});
