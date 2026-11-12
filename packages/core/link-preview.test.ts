import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLinkPreviewUrl } from './link-preview.js';

test('normalizes HTTP(S) link-preview URLs and rejects unsupported origins', () => {
  assert.equal(
    normalizeLinkPreviewUrl('HTTPS://EXAMPLE.COM:443?query=1#section'),
    'https://example.com/?query=1#section',
  );
  assert.equal(
    normalizeLinkPreviewUrl('http://EXAMPLE.COM:80/article'),
    'http://example.com/article',
  );

  for (const invalidUrl of [
    'https://user:password@example.com/',
    'https://example.com:8443/',
    'javascript:alert(1)',
    '/relative/path',
  ]) {
    assert.equal(normalizeLinkPreviewUrl(invalidUrl), null, invalidUrl);
  }
});
