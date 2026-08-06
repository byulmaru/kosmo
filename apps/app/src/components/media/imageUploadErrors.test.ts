import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertImageUploadResponse,
  formatImageUploadFailureMessage,
  formatImageUploadRetryLabel,
} from './imageUploadErrors';
import type { ImageUploadFailure } from './imageUploadErrors';

async function classify(response: Response): Promise<ImageUploadFailure> {
  try {
    await assertImageUploadResponse(response);
  } catch (error) {
    assert.ok(error && typeof error === 'object' && 'failure' in error);
    return (error as { failure: ImageUploadFailure }).failure;
  }
  throw new Error('expected an upload failure');
}

test('2xx signed PUT response succeeds without parsing an error body', async () => {
  await assert.doesNotReject(() => assertImageUploadResponse(new Response(null, { status: 204 })));
});

test('allowlisted status and code pairs map to the shared transfer reasons', async () => {
  const cases = [
    [415, 'unsupported_image', 'unsupported-format'],
    [415, 'content_type_mismatch', 'unsupported-format'],
    [413, 'size_limit_exceeded', 'file-too-large'],
    [422, 'pixel_limit_exceeded', 'image-too-large'],
    [422, 'dimension_limit_exceeded', 'image-too-large'],
    [422, 'invalid_image', 'invalid-image'],
  ] as const;

  for (const [status, code, reason] of cases) {
    assert.deepEqual(
      await classify(
        new Response(JSON.stringify({ error: { code, message: 'storage detail' } }), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
      { reason, stage: 'transfer' },
    );
  }
});

test('status and code must both match before a transfer error is specialized', async () => {
  assert.deepEqual(
    await classify(
      new Response(JSON.stringify({ error: { code: 'size_limit_exceeded' } }), { status: 422 }),
    ),
    { reason: 'transient', stage: 'transfer' },
  );
  assert.deepEqual(
    await classify(
      new Response(JSON.stringify({ error: { code: 'unknown', message: 'secret' } }), {
        status: 413,
      }),
    ),
    { reason: 'transient', stage: 'transfer' },
  );
});

test('malformed, empty, 5xx, and network-like transfer failures are transient', async () => {
  for (const response of [
    new Response('', { status: 400 }),
    new Response('{', { status: 422 }),
    new Response(null, { status: 503 }),
  ]) {
    assert.deepEqual(await classify(response), { reason: 'transient', stage: 'transfer' });
  }
});

test('numeric subjects use the canonical Korean particles and safe retry name', () => {
  const subject = '2번째 이미지';

  assert.equal(
    formatImageUploadFailureMessage(subject, {
      reason: 'unsupported-format',
      stage: 'transfer',
    }),
    '2번째 이미지는 지원하지 않는 이미지 형식이에요.',
  );
  assert.equal(
    formatImageUploadFailureMessage(subject, { reason: 'transient', stage: 'transfer' }),
    '2번째 이미지를 업로드하지 못했어요. 잠시 후 다시 시도해 주세요.',
  );
  assert.equal(formatImageUploadRetryLabel(subject), '2번째 이미지 업로드 다시 시도');

  const message = formatImageUploadFailureMessage(subject, {
    reason: 'file-too-large',
    stage: 'transfer',
  });

  assert.equal(message, '2번째 이미지 파일이 너무 커요. 16 MiB 이하의 이미지를 선택해 주세요.');
  assert.doesNotMatch(message, /storage detail|https?:\/\/|token|413|size_limit_exceeded/);
  assert.equal(
    formatImageUploadFailureMessage('아바타 이미지', { reason: 'transient', stage: 'issue' }),
    '아바타 이미지 업로드를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.',
  );
  assert.equal(
    formatImageUploadFailureMessage('헤더 이미지', { reason: 'transient', stage: 'complete' }),
    '헤더 이미지 업로드를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
  );
});
