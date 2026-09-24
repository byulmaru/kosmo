import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeedbackUploadables, getFeedbackAssetContentType } from './feedbackAttachments';

test('Native MIME이 없어도 지원 확장자를 선택 검증과 uploadable에 동일하게 사용한다', () => {
  for (const [fileName, mimeType, extension] of [
    ['photo.JPG', 'image/jpeg', 'jpg'],
    ['photo.jpeg', 'image/jpeg', 'jpg'],
    ['screen.PNG', 'image/png', 'png'],
    ['photo.webp', 'image/webp', 'webp'],
  ]) {
    const asset = { fileName, mimeType: null, uri: 'content://media/123' };
    assert.equal(getFeedbackAssetContentType(asset), mimeType);
    assert.deepEqual(createFeedbackUploadables([{ asset }]), {
      'input.attachments.0': { name: `feedback-1.${extension}`, type: mimeType, uri: asset.uri },
    });
  }
  const asset = { fileName: null, uri: 'file:///cache/screen.png?version=1' };
  assert.equal(getFeedbackAssetContentType(asset), 'image/png');
  assert.deepEqual(createFeedbackUploadables([{ asset }])['input.attachments.0'], {
    name: 'feedback-1.png',
    type: 'image/png',
    uri: asset.uri,
  });
});

test('알 수 없는 형식과 명시된 비지원 MIME은 확장자로 허용하지 않는다', () => {
  for (const asset of [
    { uri: 'content://media/123', fileName: null },
    { uri: 'file:///photo.heic' },
    { uri: 'file:///photo.jpg', mimeType: 'image/heic' },
    { uri: 'file:///photo.gif' },
  ]) {
    assert.equal(getFeedbackAssetContentType(asset), null);
    assert.throws(() => createFeedbackUploadables([{ asset }]), /Unsupported feedback image/u);
  }
});

test('Web File과 명시된 MIME을 유지한다', () => {
  const file = new File(['original bytes'], 'screen.png', { type: 'image/png' });
  const asset = { file, uri: 'blob:preview', mimeType: '' };
  assert.equal(getFeedbackAssetContentType(asset), 'image/png');
  assert.equal(createFeedbackUploadables([{ asset }])['input.attachments.0'], file);
  assert.equal(
    getFeedbackAssetContentType({ uri: 'file:///photo', mimeType: 'IMAGE/JPEG' }),
    'image/jpeg',
  );
});
