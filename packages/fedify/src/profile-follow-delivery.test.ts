import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProfileFollowDelivery } from './profile-follow-delivery';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';

const canonicalOrigin = 'https://kos.moe';
const senderProfileId = '019f6f67-1111-7777-8888-123456789abc';
const profileFollow = {
  createdAt: Temporal.Instant.from('2026-07-16T00:00:00Z'),
  followeeProfileId: '019f6f67-3333-7777-8888-123456789abc',
  followerProfileId: senderProfileId,
  id: '019f6f67-2222-7777-8888-123456789abc',
};
const actor = {
  inboxUri: 'https://remote.example/users/alice/inbox',
  sharedInboxUri: 'https://remote.example/inbox',
  uri: 'https://remote.example/users/alice',
};

test('stored actor endpoint로 Follow와 Undo를 전송한다', async () => {
  const calls: Array<{
    activity: Activity;
    options: { orderingKey?: string } | undefined;
    recipient: Recipient;
  }> = [];
  const context = {
    canonicalOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, canonicalOrigin),
    sendActivity: async (
      _sender: { identifier: string },
      recipient: Recipient,
      activity: Activity,
      options?: { orderingKey?: string },
    ) => {
      calls.push({ activity, options, recipient });
    },
  } as Context<void>;
  const delivery = createProfileFollowDelivery(async () => context);

  await delivery.sendFollow({ actor, profileFollow, senderProfileId });
  await delivery.sendUndo({ actor, profileFollow, senderProfileId });

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.recipient.id?.href, actor.uri);
  assert.equal(calls[0]?.recipient.inboxId?.href, actor.inboxUri);
  assert.equal(calls[0]?.recipient.endpoints?.sharedInbox?.href, actor.sharedInboxUri);
  assert.equal(calls[0]?.activity.id?.href, `${canonicalOrigin}/ap/follow/${profileFollow.id}`);
  assert.equal(calls[0]?.activity.actorId?.href, `${canonicalOrigin}/ap/actor/${senderProfileId}`);
  assert.equal(calls[0]?.activity.objectId?.href, actor.uri);
  assert.equal(calls[0]?.activity.published?.toString(), profileFollow.createdAt.toString());
  assert.deepEqual(calls[0]?.options, calls[1]?.options);
});

test('저장 actor inbox가 없으면 network API를 호출하지 않고 실패한다', async () => {
  let contextCreated = false;
  const delivery = createProfileFollowDelivery(async () => {
    contextCreated = true;
    return {} as Context<void>;
  });

  await assert.rejects(
    delivery.sendFollow({
      actor: { ...actor, inboxUri: null },
      profileFollow,
      senderProfileId,
    }),
    /must have an inbox/,
  );
  assert.equal(contextCreated, false);
});
