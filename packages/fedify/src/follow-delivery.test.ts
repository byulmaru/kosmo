import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Accept, Follow, Person } from '@fedify/vocab';
import { sendAcceptFollowActivity } from './follow-delivery';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';

const canonicalOrigin = 'https://kos.moe';
const senderProfileId = '019f6f67-1111-7777-8888-123456789abc';
const localActorUri = new URL(`${canonicalOrigin}/ap/actor/${senderProfileId}`);
const remoteActorUri = new URL('https://remote.example/users/alice');
const recipientActor = new Person({
  id: remoteActorUri,
  inbox: new URL('https://remote.example/users/alice/inbox'),
});

describe('Fedify follow delivery', () => {
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
  } as Pick<Context<void>, 'canonicalOrigin' | 'getActorUri' | 'sendActivity'>;

  return { calls, context };
};
