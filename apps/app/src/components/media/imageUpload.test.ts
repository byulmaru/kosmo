import assert from 'node:assert/strict';
import test, { before, beforeEach, mock } from 'node:test';
import { ImageUploadError } from './imageUploadErrors';
import type { TestContext } from 'node:test';
import type { ImagePickerAsset } from 'expo-image-picker';
import type {
  releaseImagePreview as ReleaseImagePreview,
  uploadImage as UploadImage,
} from './imageUpload';

type FakeImage = {
  readonly height: number;
  readonly release: () => void;
  readonly saveAsync: (options: unknown) => Promise<{
    readonly height: number;
    readonly uri: string;
    readonly width: number;
  }>;
  readonly uri?: string;
  readonly width: number;
};
type FakeContext = {
  readonly release: () => void;
  readonly renderAsync: () => Promise<FakeImage>;
  readonly resize: (size: { readonly height: number; readonly width: number }) => FakeContext;
};

const manipulationUris: string[] = [];
let createManipulatorContext: (uri: string) => FakeContext;

mock.module('expo-image-manipulator', {
  exports: {
    ImageManipulator: {
      manipulate: (uri: string) => {
        manipulationUris.push(uri);
        return createManipulatorContext(uri);
      },
    },
    SaveFormat: { WEBP: 'webp' },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let releaseImagePreview: typeof ReleaseImagePreview;
let uploadImage: typeof UploadImage;

const createAsset = (overrides: Partial<ImagePickerAsset> = {}): ImagePickerAsset => ({
  height: 100,
  uri: 'file:///local/image.jpg',
  width: 100,
  ...overrides,
});

function installManipulator({
  height,
  imageUris,
  resultUri = 'file:///cache/normalized.webp',
  width,
}: {
  readonly height: number;
  readonly imageUris?: readonly (string | undefined)[];
  readonly resultUri?: string;
  readonly width: number;
}) {
  const resizeCalls: Array<{ readonly height: number; readonly width: number }> = [];
  const saveOptions: unknown[] = [];
  let contextReleased = false;
  let renderCount = 0;
  let renderedWidth = width;
  let renderedHeight = height;

  const context: FakeContext = {
    release: () => {
      contextReleased = true;
    },
    renderAsync: async () => {
      renderCount += 1;
      const image: FakeImage = {
        height: renderedHeight,
        release: () => undefined,
        saveAsync: async (options) => {
          saveOptions.push(options);
          return {
            height: renderedHeight,
            uri: resultUri,
            width: renderedWidth,
          };
        },
        uri: imageUris?.[renderCount - 1],
        width: renderedWidth,
      };
      return image;
    },
    resize: (size) => {
      resizeCalls.push(size);
      renderedWidth = size.width;
      renderedHeight = size.height;
      return context;
    },
  };

  createManipulatorContext = () => context;
  return {
    context,
    contextReleased: () => contextReleased,
    renderCount: () => renderCount,
    resizeCalls,
    saveOptions,
  };
}

function mockSuccessfulFetch(
  t: TestContext,
  body = new Blob(['webp'], { type: 'image/webp' }),
  normalizedUri = 'file:///cache/normalized.webp',
) {
  return t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === normalizedUri) {
        return new Response(body, { status: 200 });
      }
      assert.equal(init?.method, 'PUT');
      return new Response(null, { status: 204 });
    },
  );
}

before(async () => {
  ({ releaseImagePreview, uploadImage } = await import('./imageUpload'));
});

beforeEach(() => {
  manipulationUris.length = 0;
  createManipulatorContext = () => installManipulator({ height: 100, width: 100 }).context;
});

test('releases only Web object URL previews', () => {
  const released: string[] = [];

  releaseImagePreview('blob:https://kosmo.example/preview', (url) => released.push(url));
  releaseImagePreview('file:///local/image.jpg', (url) => released.push(url));
  releaseImagePreview('data:image/png;base64,preview', (url) => released.push(url));

  assert.deepEqual(released, ['blob:https://kosmo.example/preview']);
});

test('issues, uploads normalized WebP bytes, and completes in order', async (t) => {
  const calls: string[] = [];
  const normalizedBlob = new Blob(['normalized-webp'], { type: 'image/webp' });
  const manipulator = installManipulator({ height: 2000, width: 4000 });
  const put = t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === 'file:///cache/normalized.webp') {
        calls.push('read-normalized');
        return new Response(normalizedBlob, { status: 200 });
      }
      calls.push(`${init?.method}:${String(input)}`);
      assert.equal(await (init?.body as Blob).text(), 'normalized-webp');
      assert.deepEqual(init?.headers, { 'content-type': 'image/webp' });
      return new Response(null, { status: 204 });
    },
  );

  const mediaId = await uploadImage({
    asset: createAsset({
      file: new File(['original'], 'image.jpg', { type: 'image/jpeg' }),
      height: 2000,
      mimeType: 'image/jpeg',
      width: 4000,
    }),
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
  assert.deepEqual(calls, [
    'issue',
    'read-normalized',
    'PUT:https://upload.example/1',
    'complete:media-1',
  ]);
  assert.deepEqual(manipulator.resizeCalls, [{ height: 1024, width: 2048 }]);
  assert.equal(manipulator.renderCount(), 1);
  assert.deepEqual(manipulator.saveOptions, [{ compress: 0.8, format: 'webp' }]);
  assert.equal(put.mock.callCount(), 2);
});

test('reads the normalized Blob and uses WebP content type for small images', async (t) => {
  const normalizedBlob = new Blob(['normalized-webp'], { type: 'image/webp' });
  const manipulator = installManipulator({ height: 800, width: 1200 });
  const calls: Array<{ readonly body?: BodyInit | null; readonly headers?: HeadersInit }> = [];
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ body: init?.body, headers: init?.headers });
      return String(input) === 'file:///cache/normalized.webp'
        ? new Response(normalizedBlob, { status: 200 })
        : new Response(null, { status: 204 });
    },
  );

  await uploadImage({
    asset: createAsset({ height: 800, width: 1200 }),
    complete: async () => undefined,
    isActive: () => true,
    issue: async () => ({ mediaId: 'media-1', uploadUrl: 'https://upload.example/1' }),
  });

  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(manipulator.resizeCalls.length, 0);
  assert.equal(manipulator.renderCount(), 1);
  assert.deepEqual(manipulator.saveOptions, [{ compress: 0.8, format: 'webp' }]);
  assert.deepEqual(calls[0], { body: undefined, headers: undefined });
  assert.equal(await (calls[1]?.body as Blob).text(), 'normalized-webp');
  assert.equal((calls[1]?.body as Blob).type, 'image/webp');
  assert.deepEqual(calls[1]?.headers, { 'content-type': 'image/webp' });
});

test('uses decoded dimensions for clipboard assets whose metadata is 0x0', async (t) => {
  const manipulator = installManipulator({ height: 3000, width: 6000 });
  mockSuccessfulFetch(t);

  await uploadImage({
    asset: createAsset({ height: 0, uri: 'blob:https://kosmo.example/clipboard', width: 0 }),
    complete: async () => undefined,
    isActive: () => true,
    issue: async () => ({ mediaId: 'media-clipboard', uploadUrl: 'https://upload.example/1' }),
  });

  assert.deepEqual(manipulationUris, ['blob:https://kosmo.example/clipboard']);
  assert.deepEqual(manipulator.resizeCalls, [{ height: 1024, width: 2048 }]);
  assert.equal(manipulator.renderCount(), 2);
});

for (const testCase of [
  {
    fileName: 'image.heic',
    fileType: 'image/heic',
    mimeType: 'image/jpeg',
    name: 'file MIME type',
  },
  {
    fileName: 'image.heic',
    fileType: 'image/jpeg',
    mimeType: 'IMAGE/HEIF',
    name: 'asset MIME type case-insensitively',
  },
  { fileName: 'image.HEIF', fileType: '', mimeType: '', name: 'file extension' },
] as const) {
  test(`rejects Web ${testCase.name} before issuing an upload`, async (t) => {
    let issueCalled = false;
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch must not run');
    });
    createManipulatorContext = () => {
      throw new Error('normalization must not run');
    };

    await assert.rejects(
      uploadImage({
        asset: createAsset({
          file: new File(['image'], testCase.fileName, { type: testCase.fileType }),
          mimeType: testCase.mimeType,
        }),
        complete: async () => undefined,
        isActive: () => true,
        issue: async () => {
          issueCalled = true;
          return { mediaId: 'media-unsupported', uploadUrl: 'https://upload.example/unsupported' };
        },
      }),
      (error: unknown) =>
        error instanceof ImageUploadError &&
        error.failure.stage === 'transfer' &&
        error.failure.reason === 'unsupported-format',
    );
    assert.equal(issueCalled, false);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
}

for (const testCase of [
  {
    dimensions: { height: 2000, width: 3000 },
    expectedResizeCalls: [{ height: 1365, width: 2048 }],
    name: 'keeps decoded landscape ratio when resizing to the maximum dimension',
  },
  {
    dimensions: { height: 3000, width: 2000 },
    expectedResizeCalls: [{ height: 2048, width: 1365 }],
    name: 'keeps decoded portrait ratio when resizing to the maximum dimension',
  },
  {
    dimensions: { height: 4096, width: 4096 },
    expectedResizeCalls: [{ height: 2048, width: 2048 }],
    name: 'resizes an oversized square without changing its ratio',
  },
  {
    dimensions: { height: 1024, width: 2048 },
    expectedResizeCalls: [],
    name: 'does not resize an image at the exact maximum dimension',
  },
] as const) {
  test(testCase.name, async (t) => {
    const manipulator = installManipulator(testCase.dimensions);
    mockSuccessfulFetch(t);

    await uploadImage({
      asset: createAsset(testCase.dimensions),
      complete: async () => undefined,
      isActive: () => true,
      issue: async () => ({ mediaId: 'media-test', uploadUrl: 'https://upload.example/1' }),
    });

    assert.deepEqual(manipulator.resizeCalls, testCase.expectedResizeCalls);
  });
}

test('releases a WebP object URL after reading its upload Blob', async (t) => {
  const normalizedUri = 'blob:https://kosmo.example/normalized';
  const manipulator = installManipulator({
    height: 800,
    imageUris: [normalizedUri],
    resultUri: normalizedUri,
    width: 1200,
  });
  const revokeObjectUrl = t.mock.method(URL, 'revokeObjectURL', () => undefined);
  const normalizedBlob = new Blob(['webp'], { type: 'image/webp' });
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === normalizedUri) {
      return new Response(normalizedBlob, { status: 200 });
    }
    assert.equal(init?.method, 'PUT');
    return new Response(null, { status: 204 });
  });

  await uploadImage({
    asset: createAsset(),
    complete: async () => undefined,
    isActive: () => true,
    issue: async () => ({ mediaId: 'media-web', uploadUrl: 'https://upload.example/1' }),
  });

  assert.equal(revokeObjectUrl.mock.callCount(), 1);
  assert.equal(revokeObjectUrl.mock.calls[0]?.arguments[0], normalizedUri);
  assert.equal(manipulator.contextReleased(), true);
});

test('releases decoded Web image URLs without revoking the saved URL twice', async (t) => {
  const sourceUri = 'blob:https://kosmo.example/source';
  const normalizedUri = 'blob:https://kosmo.example/normalized';
  const manipulator = installManipulator({
    height: 3000,
    imageUris: [sourceUri, normalizedUri],
    resultUri: normalizedUri,
    width: 6000,
  });
  const revokeObjectUrl = t.mock.method(URL, 'revokeObjectURL', () => undefined);
  mockSuccessfulFetch(t, undefined, normalizedUri);

  await uploadImage({
    asset: createAsset({ height: 0, uri: sourceUri, width: 0 }),
    complete: async () => undefined,
    isActive: () => true,
    issue: async () => ({ mediaId: 'media-web-decoded', uploadUrl: 'https://upload.example/1' }),
  });

  assert.deepEqual(
    revokeObjectUrl.mock.calls.map((call) => call.arguments[0]),
    [normalizedUri, sourceUri],
  );
  assert.equal(manipulator.contextReleased(), true);
});

test('turns image conversion failures into transfer failures', async (t) => {
  createManipulatorContext = () => {
    throw new Error('private conversion detail');
  };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch must not run');
  });

  await assert.rejects(
    uploadImage({
      asset: createAsset(),
      complete: async () => undefined,
      isActive: () => true,
      issue: async () => ({ mediaId: 'media-invalid', uploadUrl: 'https://upload.example/1' }),
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'transfer' &&
      error.failure.reason === 'transient' &&
      !error.message.includes('private conversion detail'),
  );
  assert.equal(fetchMock.mock.callCount(), 0);
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
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === 'file:///cache/normalized.webp') {
      return new Response(new Blob(['webp']), { status: 200 });
    }
    return url.endsWith('/1')
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
  assert.deepEqual(requestedUrls, [
    'file:///cache/normalized.webp',
    'https://upload.example/1',
    'file:///cache/normalized.webp',
    'https://upload.example/2',
  ]);
});

test('preserves safe issue, transfer, and complete failure classification', async (t) => {
  const asset = createAsset({ file: new File(['image'], 'image.jpg') });
  const normalizedBlob = new Blob(['webp'], { type: 'image/webp' });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) =>
    String(input) === 'file:///cache/normalized.webp'
      ? new Response(normalizedBlob, { status: 200 })
      : new Response(null, { status: 204 }),
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

  fetchMock.mock.mockImplementation(async (input: RequestInfo | URL) =>
    String(input) === 'file:///cache/normalized.webp'
      ? new Response(normalizedBlob, { status: 200 })
      : new Response(
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

  fetchMock.mock.mockImplementation(async () => new Response(normalizedBlob, { status: 200 }));

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

test('normalizes a generic PUT rejection as a safe transient transfer failure', async (t) => {
  const rawDetail = 'private network detail';
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error(rawDetail);
  });

  await assert.rejects(
    uploadImage({
      asset: createAsset({ file: new File(['image'], 'image.jpg') }),
      complete: async () => undefined,
      isActive: () => true,
      issue: async () => ({ mediaId: 'media-1', uploadUrl: 'https://upload.example/1' }),
    }),
    (error: unknown) =>
      error instanceof ImageUploadError &&
      error.failure.stage === 'transfer' &&
      error.failure.reason === 'transient' &&
      error.message === 'Image upload failed' &&
      !String(error).includes(rawDetail),
  );
});
