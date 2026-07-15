import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Accept, Follow, Person, Undo } from '@fedify/vocab';
import {
  getFollowActivityUri,
  getFollowOrderingKey,
  sendAcceptFollowActivity,
  sendFollowActivity,
  sendUndoFollowActivity,
} from './follow-delivery';
import type { Activity, Recipient } from '@fedify/vocab';
import type { FollowDeliveryContext } from './follow-delivery';

const canonicalOrigin = 'https://kos.moe';
const senderProfileId = '019f6f67-1111-7777-8888-123456789abc';
const profileFollowId = '019f6f67-2222-7777-8888-123456789abc';
const localActorUri = new URL(`${canonicalOrigin}/ap/actor/${senderProfileId}`);
const remoteActorUri = new URL('https://remote.example/users/alice');
const recipientActor = new Person({
  id: remoteActorUri,
  inbox: new URL('https://remote.example/users/alice/inbox'),
});

describe('Fedify follow delivery', () => {
  test('sends Follow with stable relation identity and ordering', async () => {
    const fixture = createContextFixture();
    const activity = await sendFollowActivity({
      context: fixture.context,
      profileFollowId,
      recipientActor,
      senderProfileId,
    });

    assert.ok(activity instanceof Follow);
    assert.equal(activity.id?.href, `${canonicalOrigin}/ap/follow/${profileFollowId}`);
    assert.equal(activity.actorId?.href, localActorUri.href);
    assert.equal(activity.objectId?.href, remoteActorUri.href);
    assert.deepEqual(
      activity.toIds.map((uri) => uri.href),
      [remoteActorUri.href],
    );
    assert.deepEqual(fixture.calls, [
      {
        activity,
        options: { orderingKey: getFollowOrderingKey(localActorUri, remoteActorUri) },
        recipient: recipientActor,
        sender: { identifier: senderProfileId },
      },
    ]);
  });

  test('sends Undo with the original Follow and the same actor-pair ordering key', async () => {
    const fixture = createContextFixture();
    const originalFollow = new Follow({
      actor: localActorUri,
      id: getFollowActivityUri(canonicalOrigin, profileFollowId),
      object: remoteActorUri,
    });
    const activity = await sendUndoFollowActivity({
      context: fixture.context,
      originalFollow,
      recipientActor,
      senderProfileId,
    });

    assert.ok(activity instanceof Undo);
    assert.equal(activity.actorId?.href, localActorUri.href);
    assert.equal(await activity.getObject(), originalFollow);
    assert.deepEqual(fixture.calls[0]?.options, {
      orderingKey: getFollowOrderingKey(localActorUri, remoteActorUri),
    });
  });

  test('sends Accept to the remote follower with the received Follow as object', async () => {
    const fixture = createContextFixture();
    const receivedFollow = new Follow({ actor: remoteActorUri, object: localActorUri });
    const activity = await sendAcceptFollowActivity({
      context: fixture.context,
      recipientActor,
      receivedFollow,
      senderProfileId,
    });

    assert.ok(activity instanceof Accept);
    assert.equal(activity.actorId?.href, localActorUri.href);
    assert.equal(await activity.getObject(), receivedFollow);
    assert.equal(fixture.calls[0]?.recipient, recipientActor);
    assert.equal(fixture.calls[0]?.options, undefined);
  });

  test('rejects a recipient without an actor id before delivery', async () => {
    const fixture = createContextFixture();
    const recipient = { id: null, inboxId: new URL('https://remote.example/inbox') };

    await assert.rejects(
      sendFollowActivity({
        context: fixture.context,
        profileFollowId,
        recipientActor: recipient,
        senderProfileId,
      }),
      /must have an actor id/,
    );
    assert.equal(fixture.calls.length, 0);
  });

  test('rejects a recipient without an inbox before delivery', async () => {
    const fixture = createContextFixture();
    const recipient = { id: remoteActorUri, inboxId: null };

    await assert.rejects(
      sendFollowActivity({
        context: fixture.context,
        profileFollowId,
        recipientActor: recipient,
        senderProfileId,
      }),
      /must have an inbox/,
    );
    assert.equal(fixture.calls.length, 0);
  });

  test('rejects an Undo whose original Follow does not match the delivery endpoints', async () => {
    const fixture = createContextFixture();
    const originalFollow = new Follow({
      actor: new URL('https://kos.moe/ap/actor/someone-else'),
      object: remoteActorUri,
    });

    await assert.rejects(
      sendUndoFollowActivity({
        context: fixture.context,
        originalFollow,
        recipientActor,
        senderProfileId,
      }),
      /must match the delivery endpoints/,
    );
    assert.equal(fixture.calls.length, 0);
  });

  test('rejects an Accept whose received Follow does not match the delivery endpoints', async () => {
    const fixture = createContextFixture();
    const receivedFollow = new Follow({
      actor: new URL('https://remote.example/users/someone-else'),
      object: localActorUri,
    });

    await assert.rejects(
      sendAcceptFollowActivity({
        context: fixture.context,
        recipientActor,
        receivedFollow,
        senderProfileId,
      }),
      /must match the delivery endpoints/,
    );
    assert.equal(fixture.calls.length, 0);
  });
});

interface SendActivityCall {
  readonly activity: Activity;
  readonly options: { readonly orderingKey?: string } | undefined;
  readonly recipient: Recipient;
  readonly sender: { readonly identifier: string };
}

const createContextFixture = () => {
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, canonicalOrigin),
    sendActivity: async (
      sender: { identifier: string },
      recipient: Recipient,
      activity: Activity,
      options?: { orderingKey?: string },
    ) => {
      calls.push({ activity, options, recipient, sender });
    },
  } as FollowDeliveryContext;

  return { calls, context };
};
