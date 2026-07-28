import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, mock, test } from 'node:test';
import { EmojiReact, Like, Undo } from '@fedify/vocab';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { federation as Federation } from './federation';
import type * as ReactionDelivery from './reaction-delivery';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const senderProfileId = '019f6f67-1111-7777-8888-123456789abc';
const remotePostUri = new URL('https://remote.example/posts/1');
const remoteActorUri = new URL('https://remote.example/users/alice');
const actor = {
  inboxUri: 'https://remote.example/users/alice/inbox',
  sharedInboxUri: 'https://remote.example/inbox',
  uri: remoteActorUri.href,
};

let federation: typeof Federation;
let pg: typeof CoreDb.pg;
let sendProfileReaction: typeof ReactionDelivery.sendProfileReaction;
let sendProfileReactionUndo: typeof ReactionDelivery.sendProfileReactionUndo;

describe('Reaction delivery', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ pg } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ federation } = await import('./federation'));
    ({ sendProfileReaction, sendProfileReactionUndo } = await import('./reaction-delivery'));

    await seedDatabase({ publicOrigin });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  after(async () => {
    await pg.end();
  });

  test('여섯 Type을 stable identity의 Like 또는 EmojiReact로 직렬화한다', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);
    const cases = [
      { activityClass: Like, id: '019f6f67-2222-7777-8888-123456789a01', type: '❤️' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a02', type: '🥹' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a03', type: '🎉' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a04', type: '👀' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a05', type: '☘️' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a06', type: '🌈' },
    ] as const;

    for (const reaction of cases) {
      await sendProfileReaction({
        actor,
        objectUri: remotePostUri.href,
        outboundReaction: {
          createdAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
          id: reaction.id,
          type: reaction.type,
        },
        senderProfileId,
      });
    }

    assert.equal(fixture.calls.length, cases.length);
    for (const [index, reaction] of cases.entries()) {
      const call = fixture.calls[index];
      assert.ok(call);
      assert.ok(call.activity instanceof reaction.activityClass);
      assert.equal(call.activity.id?.href, `${publicOrigin}/ap/reaction/${reaction.id}`);
      assert.equal(call.activity.actorId?.href, `${publicOrigin}/ap/actor/${senderProfileId}`);
      assert.equal(call.activity.objectId?.href, remotePostUri.href);
      assert.equal(call.activity.content?.toString(), reaction.type);
      assert.equal(call.activity.published?.toString(), '2026-07-28T00:00:00Z');
      assert.deepEqual(
        call.activity.toIds.map((uri) => uri.href),
        [remoteActorUri.href],
      );
      assert.deepEqual(
        call.activity.ccIds.map((uri) => uri.href),
        [],
      );
      assert.equal(call.recipient.id?.href, remoteActorUri.href);
      assert.equal(call.recipient.inboxId?.href, actor.inboxUri);
      assert.equal(call.recipient.endpoints?.sharedInbox?.href, actor.sharedInboxUri);
      assert.deepEqual(call.sender, { identifier: senderProfileId });
      assert.deepEqual(call.options, {
        orderingKey: `${publicOrigin}/ap/reaction/${reaction.id}`,
      });

      const json = (await call.activity.toJsonLd()) as { content?: unknown; type?: unknown };
      assert.equal(json.type, reaction.type === '❤️' ? 'Like' : 'EmojiReact');
      assert.equal(json.content, reaction.type);
    }
  });

  test('Undo는 #undo identity와 exact 원본 activity 및 같은 ordering key를 사용한다', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);
    const reactionId = '019f6f67-2222-7777-8888-123456789abc';

    await sendProfileReactionUndo({
      actor,
      objectUri: remotePostUri.href,
      outboundReaction: {
        createdAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
        id: reactionId,
        type: '🎉',
      },
      senderProfileId,
    });

    const call = fixture.calls[0];
    assert.ok(call?.activity instanceof Undo);
    const original = await call.activity.getObject();
    assert.ok(original instanceof EmojiReact);
    assert.equal(call.activity.id?.href, `${publicOrigin}/ap/reaction/${reactionId}#undo`);
    assert.equal(call.activity.actorId?.href, `${publicOrigin}/ap/actor/${senderProfileId}`);
    assert.deepEqual(
      call.activity.toIds.map((uri) => uri.href),
      [remoteActorUri.href],
    );
    assert.equal(original.id?.href, `${publicOrigin}/ap/reaction/${reactionId}`);
    assert.equal(original.actorId?.href, `${publicOrigin}/ap/actor/${senderProfileId}`);
    assert.equal(original.objectId?.href, remotePostUri.href);
    assert.equal(original.content?.toString(), '🎉');
    assert.equal(original.published?.toString(), '2026-07-28T00:00:00Z');
    assert.deepEqual(call.options, {
      orderingKey: `${publicOrigin}/ap/reaction/${reactionId}`,
    });
  });

  test('unsupported Type과 없거나 malformed인 저장 endpoint를 전송 전에 거부한다', async () => {
    const fixture = createContextFixture();
    mock.method(federation, 'createContext', () => fixture.context);
    const base = {
      actor,
      objectUri: remotePostUri.href,
      outboundReaction: {
        createdAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
        id: '019f6f67-2222-7777-8888-123456789abc',
        type: '👍',
      },
      senderProfileId,
    };

    await assert.rejects(sendProfileReaction(base), /Unsupported outbound/);
    await assert.rejects(
      sendProfileReaction({
        ...base,
        actor: { ...actor, inboxUri: null },
        outboundReaction: { ...base.outboundReaction, type: '❤️' },
      }),
      /must have an inbox/,
    );
    await assert.rejects(
      sendProfileReaction({
        ...base,
        objectUri: 'not a URI',
        outboundReaction: { ...base.outboundReaction, type: '❤️' },
      }),
      /Invalid URL|must be an HTTP/,
    );
    await assert.rejects(
      sendProfileReaction({
        ...base,
        actor: { ...actor, inboxUri: 'ftp://remote.example/inbox' },
        outboundReaction: { ...base.outboundReaction, type: '❤️' },
      }),
      /must be an HTTP/,
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
