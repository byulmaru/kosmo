import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeProfileEditImageUpload,
  createProfileEditRouteImage,
  failProfileEditImageUpload,
  profileEditImageInput,
  releaseProfileEditImagePreview,
  removeProfileEditImage,
  replaceProfileEditImage,
  retryProfileEditImageUpload,
} from './profileEditMedia';
import type { ImagePickerAsset } from 'expo-image-picker';

const asset = (uri: string): ImagePickerAsset => ({ height: 100, uri, width: 100 });

test('current와 empty Media를 route image state로 보존한다', () => {
  assert.deepEqual(createProfileEditRouteImage(null), {
    asset: null,
    generation: 0,
    mediaId: null,
    presentation: { kind: 'current', previewUri: null },
  });
  assert.deepEqual(
    createProfileEditRouteImage({ id: 'media-current', url: 'https://media.example/current' }),
    {
      asset: null,
      generation: 0,
      mediaId: 'media-current',
      presentation: { kind: 'current', previewUri: 'https://media.example/current' },
    },
  );
});

test('교체 generation만 완료하고 제거는 null input으로 변환한다', () => {
  const initial = createProfileEditRouteImage({ id: 'media-current', url: 'current://preview' });
  const replacing = replaceProfileEditImage(initial, asset('blob:https://kosmo.example/next'));

  assert.equal(replacing.generation, 1);
  assert.equal(replacing.mediaId, null);
  assert.deepEqual(replacing.presentation, {
    kind: 'replacement',
    previewUri: 'blob:https://kosmo.example/next',
    uploadState: 'uploading',
  });
  assert.equal(completeProfileEditImageUpload(replacing, 0, 'media-stale'), replacing);

  const ready = completeProfileEditImageUpload(replacing, 1, 'media-ready');
  assert.equal(ready.mediaId, 'media-ready');
  assert.equal(ready.presentation.kind, 'replacement');
  assert.equal(
    ready.presentation.kind === 'replacement' && ready.presentation.uploadState,
    'ready',
  );
  assert.equal(profileEditImageInput(initial), undefined);
  assert.equal(profileEditImageInput(ready), 'media-ready');

  const removed = removeProfileEditImage(ready);
  assert.equal(removed.generation, 2);
  assert.equal(removed.mediaId, null);
  assert.deepEqual(removed.presentation, { kind: 'removed', previewUri: null });
  assert.equal(profileEditImageInput(removed), null);
});

test('실패한 field만 같은 asset으로 새 generation에서 재시도한다', () => {
  const replacing = replaceProfileEditImage(
    createProfileEditRouteImage(null),
    asset('file:///avatar.webp'),
  );
  const failed = failProfileEditImageUpload(replacing, replacing.generation);
  assert.equal(failed.presentation.kind, 'replacement');
  assert.equal(
    failed.presentation.kind === 'replacement' && failed.presentation.uploadState,
    'error',
  );

  const retried = retryProfileEditImageUpload(failed);
  assert.equal(retried.asset, replacing.asset);
  assert.equal(retried.generation, replacing.generation + 1);
  assert.equal(retried.mediaId, null);
  assert.equal(
    retried.presentation.kind === 'replacement' && retried.presentation.uploadState,
    'uploading',
  );
});

test('Web blob preview만 해제한다', () => {
  const released: string[] = [];
  const release = (uri: string) => released.push(uri);

  releaseProfileEditImagePreview(
    replaceProfileEditImage(
      createProfileEditRouteImage(null),
      asset('blob:https://kosmo.example/preview'),
    ),
    release,
  );
  releaseProfileEditImagePreview(
    replaceProfileEditImage(createProfileEditRouteImage(null), asset('file:///preview.webp')),
    release,
  );

  assert.deepEqual(released, ['blob:https://kosmo.example/preview']);
});
