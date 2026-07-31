import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Post Share Reference', () => {
  it('configured canonical origin과 Post route identity만 결합한다', async () => {
    const shareReference = await import('./postShareReference').catch(() => null);

    assert.ok(shareReference, 'postShareReference builder가 구현되어야 한다.');
    assert.equal(
      shareReference.createPostShareReference('https://kosmo.example', '@alice', 'post-id'),
      'https://kosmo.example/@alice/post-id',
    );
    assert.equal(
      shareReference.createPostShareReference('https://kosmo.example/', '@alice', 'post-id'),
      'https://kosmo.example/@alice/post-id',
    );
  });

  it('path segment를 인코딩하고 query와 hash를 만들지 않는다', async () => {
    const shareReference = await import('./postShareReference').catch(() => null);

    assert.ok(shareReference);
    assert.equal(
      shareReference.createPostShareReference(
        'https://kosmo.example',
        '@alice name@remote.example',
        'post/id?#',
      ),
      'https://kosmo.example/@alice%20name@remote.example/post%2Fid%3F%23',
    );
  });

  it('browser current Host를 읽지 않고 parent가 고른 direct Source identity를 사용한다', async () => {
    const shareReference = await import('./postShareReference').catch(() => null);
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://preview.example' } },
    });

    try {
      assert.ok(shareReference);
      assert.equal(
        shareReference.createPostShareReference(
          'https://canonical.example',
          '@source@remote.example',
          'source-id',
        ),
        'https://canonical.example/@source@remote.example/source-id',
      );
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: originalWindow,
        });
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});
