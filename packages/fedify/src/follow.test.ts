import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFollowOrderingKey,
  createOutboundFollowUri,
  getLocalActorUri,
  parseOutboundFollowUri,
} from './follow';

test('creates canonical local actor URIs from configured origin and profile id', () => {
  assert.equal(
    getLocalActorUri(new URL('https://kosmo.example'), '018f7c4e-4b8f-7000-8000-000000000001').href,
    'https://kosmo.example/ap/actor/018f7c4e-4b8f-7000-8000-000000000001',
  );
});

test('creates outbound Follow URI from ProfileFollow id', () => {
  const profileFollowId = '018f7c4e-4b8f-7000-8000-000000000002';
  const uri = createOutboundFollowUri(new URL('https://kosmo.example'), profileFollowId);

  assert.equal(uri.href, `https://kosmo.example/ap/follows/${profileFollowId}`);
  assert.equal(parseOutboundFollowUri(uri), profileFollowId);
});

test('keeps Follow and Undo ordering key stable for an actor pair', () => {
  const actorUri = new URL('https://kosmo.example/ap/actor/local');
  const objectUri = new URL('https://remote.example/users/alice');

  assert.equal(
    createFollowOrderingKey(actorUri, objectUri),
    createFollowOrderingKey(actorUri, objectUri),
  );
  assert.notEqual(
    createFollowOrderingKey(actorUri, objectUri),
    createFollowOrderingKey(objectUri, actorUri),
  );
});
