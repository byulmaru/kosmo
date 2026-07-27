import assert from 'node:assert/strict';
import test from 'node:test';
import { issueMediaStorageUpload } from './storage';
import type { TestContext } from 'node:test';

const uploadResponse = {
  id: 'u_123e4567-e89b-42d3-a456-426614174000',
  uploadUrl: 'https://media.example/v1/uploads/signed-token',
  expiresAt: '2026-07-26T15:00:00Z',
};

const configureMediaStorage = (t: TestContext) => {
  const previousOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
  const previousApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
  process.env.MEDIA_STORAGE_SERVICE_ORIGIN = 'https://media.example/base';
  process.env.MEDIA_STORAGE_SERVICE_API_KEY = 'secret';
  t.after(() => {
    if (previousOrigin === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_ORIGIN = previousOrigin;
    }
    if (previousApiKey === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_API_KEY;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_API_KEY = previousApiKey;
    }
  });
};

test('issues a Media Storage Service upload through production configuration', async (t) => {
  configureMediaStorage(t);
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), 'https://media.example/v1/uploads');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init?.headers, {
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
    });
    assert.equal(init?.body, '{}');

    return Response.json(uploadResponse, { status: 201 });
  });

  const result = await issueMediaStorageUpload();

  assert.deepEqual(result, {
    storageReference: uploadResponse.id,
    uploadUrl: uploadResponse.uploadUrl,
    expiresAt: Temporal.Instant.from(uploadResponse.expiresAt),
  });
});

test('rejects unsuccessful Media Storage Service responses', async (t) => {
  configureMediaStorage(t);
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));

  await assert.rejects(issueMediaStorageUpload(), /rejected upload issuance \(503\)/);
});

test('rejects malformed Media Storage Service responses', async (t) => {
  configureMediaStorage(t);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ ...uploadResponse, id: 'not-an-upload-id' }, { status: 201 }),
  );

  await assert.rejects(issueMediaStorageUpload(), /invalid upload response/);

  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ ...uploadResponse, expiresAt: 'never' }, { status: 201 }),
  );

  await assert.rejects(issueMediaStorageUpload(), /invalid upload expiry/);
});
