import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, mock, test } from 'node:test';
import { Follow, Undo } from '@fedify/vocab';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { federation as Federation } from './federation';
import type * as ProfileFollowDelivery from './profile-follow-delivery';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const senderProfileId = '019f6f67-1111-7777-8888-123456789abc';
const profileFollowId = '019f6f67-2222-7777-8888-123456789abc';
const profileFollowCreatedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');
const localActorUri = new URL(`/ap/actor/${senderProfileId}`, publicOrigin);
const remoteActorUri = new URL('https://remote.example/users/alice');
const actor = {
  inboxUri: 'https://remote.example/users/alice/inbox',
  sharedInboxUri: 'https://remote.example/inbox',
  uri: remoteActorUri.href,
};

let federation: typeof Federation;
let pg: typeof CoreDb.pg;
let sendProfileFollow: typeof ProfileFollowDelivery.sendProfileFollow;
let sendProfileUnfollow: typeof ProfileFollowDelivery.sendProfileUnfollow;

describe('profile follow delivery', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ pg } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ federation } = await import('./federation'));
    ({ sendProfileFollow, sendProfileUnfollow } = await import('./profile-follow-delivery'));

    await seedDatabase({ publicOrigin });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  after(async () => {
    await pg.end();
  });

  test('sendProfileFollow가 저장 actor inbox가 없으면 전송 전에 실패한다', async () => {
    await assert.rejects(
      sendProfileFollow({
        actor: { ...actor, inboxUri: null },
        outboundFollow: {
          createdAt: profileFollowCreatedAt,
          id: profileFollowId,
        },
        senderProfileId,
      }),
      /must have an inbox/,
    );
  });

  test('sendProfileFollow가 저장 projection으로 Follow를 구성하고 발송한다', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendProfileFollow({
      actor,
      outboundFollow: {
        createdAt: profileFollowCreatedAt,
        id: profileFollowId,
      },
      senderProfileId,
    });

    const call = fixture.calls[0];
    assert.ok(call?.activity instanceof Follow);
    assert.equal(call.activity.id?.href, `${publicOrigin}/ap/follow/${profileFollowId}`);
    assert.equal(call.activity.actorId?.href, localActorUri.href);
    assert.equal(call.activity.objectId?.href, remoteActorUri.href);
    assert.equal(call.activity.published?.toString(), profileFollowCreatedAt.toString());
    assert.deepEqual(
      call.activity.toIds.map((uri) => uri.href),
      [remoteActorUri.href],
    );
    assert.equal(call.recipient.id?.href, remoteActorUri.href);
    assert.equal(call.recipient.inboxId?.href, actor.inboxUri);
    assert.equal(call.recipient.endpoints?.sharedInbox?.href, actor.sharedInboxUri);
    assert.deepEqual(call.sender, { identifier: senderProfileId });
    assert.deepEqual(call.options, {
      orderingKey: `profile-follow:${localActorUri.href}\n${remoteActorUri.href}`,
    });
  });

  test('sendProfileUnfollow가 같은 projection으로 원본 Follow와 Undo를 구성한다', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);

    await sendProfileUnfollow({
      actor,
      outboundFollow: {
        createdAt: profileFollowCreatedAt,
        id: profileFollowId,
      },
      senderProfileId,
    });

    const call = fixture.calls[0];
    assert.ok(call?.activity instanceof Undo);
    assert.equal(call.activity.actorId?.href, localActorUri.href);
    assert.deepEqual(
      call.activity.toIds.map((uri) => uri.href),
      [remoteActorUri.href],
    );
    const originalFollow = await call.activity.getObject();
    assert.ok(originalFollow instanceof Follow);
    assert.equal(originalFollow.id?.href, `${publicOrigin}/ap/follow/${profileFollowId}`);
    assert.equal(originalFollow.actorId?.href, localActorUri.href);
    assert.equal(originalFollow.objectId?.href, remoteActorUri.href);
    assert.equal(originalFollow.published?.toString(), profileFollowCreatedAt.toString());
    assert.deepEqual(call.options, {
      orderingKey: `profile-follow:${localActorUri.href}\n${remoteActorUri.href}`,
    });
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
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    sendActivity: async (
      sender: { identifier: string },
      recipient: Recipient,
      activity: Activity,
      options?: { orderingKey?: string },
    ) => {
      calls.push({ activity, options, recipient, sender });
    },
  } as Context<void>;

  return { calls, context };
};
