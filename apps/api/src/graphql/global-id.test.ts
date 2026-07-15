import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeGlobalId, encodeGlobalId } from './global-id';

const id = '019f6678-86fa-709b-984e-1520766b8447';

test('round-trips an unpadded URL-safe global ID', () => {
  const globalId = encodeGlobalId('Post', id);

  assert.equal(globalId.length, 27);
  assert.doesNotMatch(globalId, /[+/=]/);
  assert.deepEqual(decodeGlobalId(globalId), { id, typename: 'Post' });
});

test('stores the UUID as the first 16 bytes and the typename in the remainder', () => {
  const payload = Buffer.from(encodeGlobalId('Profile', id), 'base64url');

  assert.equal(payload.subarray(0, 16).toString('hex'), id.replaceAll('-', ''));
  assert.equal(payload.subarray(16).toString('ascii'), 'Profile');
});

test('rejects raw UUIDs, the old textual payload, padding and malformed base64url', () => {
  assert.throws(() => decodeGlobalId(id), /Invalid global ID/);
  assert.throws(
    () => decodeGlobalId(Buffer.from(`Post:${id}`).toString('base64url')),
    /Invalid global ID/,
  );
  assert.throws(() => decodeGlobalId(`${encodeGlobalId('Post', id)}=`), /Invalid global ID/);
  assert.throws(() => decodeGlobalId('A'), /Invalid global ID/);
});

test('rejects invalid UUIDs while encoding', () => {
  assert.throws(() => encodeGlobalId('Post', 'not-a-uuid'), /Invalid global ID/);
});
