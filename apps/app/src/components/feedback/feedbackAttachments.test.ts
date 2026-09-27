import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  createFeedbackAttachmentFormData,
  getFeedbackAssetContentType,
  submitFeedbackWithAttachments,
} from './feedbackAttachments';

test('지원 확장자를 MIME으로 추론하고 multipart 첨부를 반복 필드로 보낸다', async () => {
  const items = [
    {
      asset: {
        file: new File(['jpeg'], 'photo.JPG', { type: '' }),
        fileName: 'photo.JPG',
        mimeType: null,
        uri: 'blob:jpeg',
      },
    },
    {
      asset: {
        file: new File(['png'], 'screen.png', { type: '' }),
        fileName: 'screen.png',
        mimeType: null,
        uri: 'blob:png',
      },
    },
  ];

  assert.equal(getFeedbackAssetContentType(items[0].asset), 'image/jpeg');
  const formData = createFeedbackAttachmentFormData({ body: 'body', items, kind: 'POSITIVE' });
  assert.equal(formData.get('body'), 'body');
  assert.equal(formData.get('kind'), 'POSITIVE');
  assert.equal(formData.getAll('attachments').length, 2);
  assert.deepEqual(
    (formData.getAll('attachments') as File[]).map((file) => [file.name, file.type]),
    [
      ['photo.JPG', 'image/jpeg'],
      ['screen.png', 'image/png'],
    ],
  );
});

test('Web File MIME이 비어 있어도 추론한 타입으로 정규화하며 바이트를 유지한다', async () => {
  const file = new File(['original bytes'], 'screen.png', { type: '' });
  const formData = createFeedbackAttachmentFormData({
    body: 'body',
    items: [{ asset: { file, mimeType: '', uri: 'blob:preview' } }],
    kind: 'POSITIVE',
  });
  const attachment = formData.get('attachments');

  assert.ok(attachment instanceof File);
  assert.equal(attachment.type, 'image/png');
  assert.equal(attachment.name, 'screen.png');
  assert.equal(await attachment.text(), 'original bytes');
});

test('알 수 없는 형식과 명시된 비지원 MIME은 거부한다', () => {
  for (const asset of [
    { uri: 'content://media/123', fileName: null },
    { uri: 'file:///photo.heic' },
    { uri: 'file:///photo.jpg', mimeType: 'image/heic' },
    { uri: 'file:///photo.gif' },
  ]) {
    assert.equal(getFeedbackAssetContentType(asset), null);
    assert.throws(
      () =>
        createFeedbackAttachmentFormData({ body: 'body', items: [{ asset }], kind: 'POSITIVE' }),
      /Unsupported feedback image/u,
    );
  }
});

test('Web 첨부 전송은 same-origin cookie만 사용하고 Native 첨부 전송은 bearer를 사용한다', async () => {
  let capturedUrl: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input;
      capturedInit = init;
      return new Response(JSON.stringify({ completed: true }), { status: 200 });
    },
  );
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://kos.moe' } },
  });

  try {
    await submitFeedbackWithAttachments({
      body: 'web body',
      items: [
        {
          asset: {
            file: new File(['image'], 'photo.png', { type: 'image/png' }),
            uri: 'blob:preview',
          },
        },
      ],
      kind: 'POSITIVE',
      native: false,
      nativeToken: 'must-not-leave-web',
    });
    assert.equal(capturedUrl, 'https://kos.moe/feedback/attachments');
    assert.equal(capturedInit?.credentials, 'include');
    assert.equal((capturedInit?.headers as Record<string, string>).authorization, undefined);

    await submitFeedbackWithAttachments({
      body: 'native body',
      items: [{ asset: { fileName: 'photo.png', mimeType: null, uri: 'content://photo' } }],
      kind: 'NEGATIVE',
      native: true,
      nativeToken: 'native-token',
    });
    assert.equal(capturedUrl, 'https://api.kos.moe/feedback/attachments');
    assert.equal(capturedInit?.credentials, 'omit');
    assert.equal(
      (capturedInit?.headers as Record<string, string>).authorization,
      'Bearer native-token',
    );
  } finally {
    fetchMock.mock.restore();
    if (windowDescriptor) {
      Object.defineProperty(globalThis, 'window', windowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('첨부 전송은 non-2xx와 malformed 응답을 실패로 처리한다', async () => {
  const responses = [
    new Response(JSON.stringify({ completed: false }), { status: 200 }),
    new Response(JSON.stringify({ error: 'failed' }), { status: 502 }),
  ];
  const fetchMock = mock.method(globalThis, 'fetch', async () => responses.shift()!);

  try {
    await assert.rejects(
      submitFeedbackWithAttachments({
        body: 'body',
        items: [{ asset: { fileName: 'photo.png', mimeType: null, uri: 'content://photo' } }],
        kind: 'POSITIVE',
        native: true,
        nativeToken: null,
      }),
      /Invalid feedback response/u,
    );
    await assert.rejects(
      submitFeedbackWithAttachments({
        body: 'body',
        items: [{ asset: { fileName: 'photo.png', mimeType: null, uri: 'content://photo' } }],
        kind: 'POSITIVE',
        native: true,
        nativeToken: null,
      }),
      /HTTP 502/u,
    );
  } finally {
    fetchMock.mock.restore();
  }
});
