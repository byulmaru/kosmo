import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeGlobalId } from './global-id';
import { parsePostReference } from './post-reference';

const postId = '00000000-0000-4000-8000-000000000001';

test('parses exactly twelve ASCII alphanumeric characters as a Post slug', () => {
  assert.deepEqual(parsePostReference('AbC123456789'), { slug: 'AbC123456789' });
  assert.equal(parsePostReference('AbC12345678'), null);
  assert.equal(parsePostReference('AbC1234567890'), null);
  assert.equal(parsePostReference('AbC12345678_'), null);
  assert.equal(parsePostReference('AbC12345678-'), null);
});

test('parses only a valid Post Relay global ID as a legacy reference', () => {
  assert.deepEqual(parsePostReference(encodeGlobalId('Post', postId)), { id: postId });
  assert.equal(parsePostReference(encodeGlobalId('Profile', postId)), null);
  assert.equal(parsePostReference(postId), null);
  assert.equal(parsePostReference('not-a-global-id'), null);
});
