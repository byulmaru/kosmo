import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { feedbackAttachmentLimit, feedbackAttachmentMaxBytes } from '@kosmo/core/validation';
import { getFeedbackAssetContentType, prepareFeedbackAttachments } from './feedbackAttachments';

const item = (file: File, extra: Record<string, unknown> = {}) => ({
  asset: { file, fileName: file.name, mimeType: file.type, uri: `blob:${file.name}`, ...extra },
});

const pngBytes = (size = 45, animated = false) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  bytes.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 16);
  if (animated) {
    bytes.set([0, 0, 0, 0, 0x61, 0x63, 0x54, 0x4c, 0, 0, 0, 0], 33);
    bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0], 45);
    return bytes;
  }
  if (size === 45) {
    bytes.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 29);
    bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0], 33);
    return bytes;
  }
  const fillerLength = size - 57;
  bytes.set(
    [
      (fillerLength >>> 24) & 0xff,
      (fillerLength >>> 16) & 0xff,
      (fillerLength >>> 8) & 0xff,
      fillerLength & 0xff,
      0x49,
      0x44,
      0x41,
      0x54,
    ],
    33,
  );
  bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0], size - 12);
  return bytes;
};

const animatedWebpBytes = () => {
  const bytes = new Uint8Array(20);
  bytes.set([0x52, 0x49, 0x46, 0x46, 12, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  bytes.set([0, 0, 0, 0, 0x41, 0x4e, 0x49, 0x4d], 12);
  return bytes;
};

test('지원 확장자를 MIME으로 추론하고 Sentry 첨부 바이트와 고정 파일명을 준비한다', async () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])], 'photo.JPG', {
    type: '',
  });
  const prepared = await prepareFeedbackAttachments([
    item(file, { mimeType: null }),
    item(new File([pngBytes()], 'screen.png', { type: '' }), { mimeType: null }),
  ]);

  assert.equal(
    getFeedbackAssetContentType({ file, fileName: file.name, mimeType: null, uri: file.name }),
    'image/jpeg',
  );
  assert.deepEqual(
    prepared.map(({ contentType, filename }) => [contentType, filename]),
    [
      ['image/jpeg', 'feedback-1.jpg'],
      ['image/png', 'feedback-2.png'],
    ],
  );
  assert.deepEqual([...prepared[0]!.data], [0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
});

test('Native URI 바이트도 읽되 실패 응답은 로컬 준비 오류로 처리한다', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(pngBytes()));
  try {
    const prepared = await prepareFeedbackAttachments([
      {
        asset: {
          file: undefined,
          fileName: 'photo.png',
          mimeType: 'image/png',
          uri: 'content://photo',
        },
      },
    ]);
    assert.deepEqual([...prepared[0]!.data], [...pngBytes()]);
    assert.equal(fetchMock.mock.calls[0]?.arguments[0], 'content://photo');
  } finally {
    fetchMock.mock.restore();
  }

  const failedFetch = mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 404 }),
  );
  try {
    await assert.rejects(
      prepareFeedbackAttachments([
        {
          asset: {
            file: undefined,
            fileName: 'photo.png',
            mimeType: 'image/png',
            uri: 'content://missing',
          },
        },
      ]),
      /이미지 파일을 읽을 수 없어요/u,
    );
  } finally {
    failedFetch.mock.restore();
  }
});

test('알 수 없는 형식과 빈 첨부 바이트를 거부한다', async () => {
  assert.equal(
    getFeedbackAssetContentType({
      file: undefined,
      fileName: 'photo.heic',
      mimeType: null,
      uri: 'file:///photo.heic',
    }),
    null,
  );
  await assert.rejects(
    prepareFeedbackAttachments([
      {
        asset: {
          file: undefined,
          fileName: 'photo.heic',
          mimeType: null,
          uri: 'file:///photo.heic',
        },
      },
    ]),
    /정적 JPEG, PNG, WebP 이미지만 첨부할 수 있어요/u,
  );
  await assert.rejects(
    prepareFeedbackAttachments([item(new File([], 'empty.png', { type: 'image/png' }))]),
    /이미지 파일을 읽을 수 없어요/u,
  );
});

test('정적 이미지가 아닌 APNG와 Animated WebP를 거부한다', async () => {
  await assert.rejects(
    prepareFeedbackAttachments([
      item(new File([pngBytes(57, true)], 'animated.png', { type: 'image/png' })),
    ]),
    /이미지 파일 형식을 확인해주세요/u,
  );
  await assert.rejects(
    prepareFeedbackAttachments([
      item(new File([animatedWebpBytes()], 'animated.webp', { type: 'image/webp' })),
    ]),
    /이미지 파일 형식을 확인해주세요/u,
  );
});

test('첨부 개수·개별 크기·전체 크기 제한을 로컬에서 검증한다', async () => {
  const small = () => item(new File(['x'], 'small.png', { type: 'image/png' }));
  await assert.rejects(
    prepareFeedbackAttachments(Array.from({ length: feedbackAttachmentLimit + 1 }, small)),
    /이미지는 최대 3장까지 첨부할 수 있어요/u,
  );
  await assert.rejects(
    prepareFeedbackAttachments([
      item(
        new File([new Uint8Array(feedbackAttachmentMaxBytes + 1)], 'large.png', {
          type: 'image/png',
        }),
      ),
    ]),
    /이미지는 한 장당 5MB 이하로 첨부해주세요/u,
  );
});
