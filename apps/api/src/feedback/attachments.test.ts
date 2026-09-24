import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackAttachmentMaxBytes } from '@kosmo/core/validation';
import { readFeedbackAttachments } from './attachments';

const pngBytes = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
);

test('실제 File bytes와 허용 MIME이 일치하는 첨부를 읽는다', async () => {
  const [attachment] = await readFeedbackAttachments([
    new File([pngBytes], 'screen.png', { type: 'image/png' }),
  ]);

  assert.equal(attachment?.contentType, 'image/png');
  assert.deepEqual(attachment?.bytes, pngBytes);
});

test('가짜 파일·허용되지 않은 형식·크기 초과를 전달 전에 거부한다', async () => {
  await assert.rejects(readFeedbackAttachments([{}]), /이미지 파일/u);
  await assert.rejects(
    readFeedbackAttachments([new File(['gif'], 'image.gif', { type: 'image/gif' })]),
    /JPEG, PNG, WebP/u,
  );
  await assert.rejects(
    readFeedbackAttachments([
      new File([new Uint8Array(feedbackAttachmentMaxBytes + 1)], 'screen.png', {
        type: 'image/png',
      }),
    ]),
    /5MB/u,
  );
});
