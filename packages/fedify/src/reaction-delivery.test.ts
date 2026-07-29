import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, mock, test } from 'node:test';
import { EmojiReact, Like, Undo } from '@fedify/vocab';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import type { Context, SenderKeyPair } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { federation as Federation } from './federation';
import type * as ReactionDelivery from './reaction-delivery';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let federation: typeof Federation;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let localInstanceId: string;
let pg: typeof CoreDb.pg;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let sendReaction: typeof ReactionDelivery.sendReaction;
let sendReactionUndo: typeof ReactionDelivery.sendReactionUndo;

describe('Reaction delivery', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      pg,
      Posts,
      ProfileFollows,
      Profiles,
      Reactions,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ federation } = await import('./federation'));
    ({ sendReaction, sendReactionUndo } = await import('./reaction-delivery'));

    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  afterEach(() => {
    mock.restoreAll();
  });

  after(async () => {
    await pg.end();
  });

  test('여섯 Type을 저장 projection에서 stable identity의 Like 또는 EmojiReact로 직렬화한다', async () => {
    const target = await createDeliveryFixture();
    const context = createContextFixture();
    mock.method(federation, 'createContext', () => context.context);
    const cases = [
      { activityClass: Like, id: '019f6f67-2222-7777-8888-123456789a01', type: '❤️' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a02', type: '🥹' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a03', type: '🎉' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a04', type: '👀' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a05', type: '☘️' },
      { activityClass: EmojiReact, id: '019f6f67-2222-7777-8888-123456789a06', type: '🌈' },
    ] as const;

    for (const reaction of cases) {
      const stored = await db
        .insert(Reactions)
        .values({
          createdAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
          id: reaction.id,
          postId: target.postId,
          profileId: target.senderProfileId,
          type: reaction.type,
        })
        .returning()
        .then(firstOrThrow);
      await sendReaction(stored);
    }

    assert.equal(context.calls.length, cases.length);
    for (const [index, reaction] of cases.entries()) {
      const call = context.calls[index];
      assert.ok(call);
      assert.ok(call.activity instanceof reaction.activityClass);
      assert.equal(call.activity.id?.href, `${publicOrigin}/ap/reaction/${reaction.id}`);
      assert.equal(
        call.activity.actorId?.href,
        `${publicOrigin}/ap/actor/${target.senderProfileId}`,
      );
      assert.equal(call.activity.objectId?.href, target.objectUri);
      assert.equal(call.activity.content?.toString(), reaction.type);
      assert.equal(call.activity.published?.toString(), '2026-07-28T00:00:00Z');
      assert.deepEqual(
        call.activity.toIds.map((uri) => uri.href),
        [target.actorUri],
      );
      assert.deepEqual(
        call.activity.ccIds.map((uri) => uri.href),
        [],
      );
      assert.equal(call.recipient.id?.href, target.actorUri);
      assert.equal(call.recipient.inboxId?.href, target.inboxUri);
      assert.equal(call.recipient.endpoints?.sharedInbox?.href, target.sharedInboxUri);
      assertSenderKeys(call.sender, `${publicOrigin}/ap/actor/${target.senderProfileId}`);
      assert.deepEqual(call.options, {
        orderingKey: `${publicOrigin}/ap/reaction/${reaction.id}`,
        preferSharedInbox: true,
      });

      const json = (await call.activity.toJsonLd()) as { content?: unknown; type?: unknown };
      assert.equal(json.type, reaction.type === '❤️' ? 'Like' : 'EmojiReact');
      assert.equal(json.content, reaction.type);
    }
  });

  test('삭제된 row에서도 create와 exact Undo를 같은 ordering key로 직렬화한다', async () => {
    const target = await createDeliveryFixture();
    const context = createContextFixture();
    mock.method(federation, 'createContext', () => context.context);
    const reaction = await db
      .insert(Reactions)
      .values({
        createdAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
        postId: target.postId,
        profileId: target.senderProfileId,
        type: '🎉',
      })
      .returning()
      .then(firstOrThrow);
    await db.delete(Reactions).where(eq(Reactions.id, reaction.id));

    await sendReaction(reaction);
    await sendReactionUndo(reaction);

    assert.ok(context.calls[0]?.activity instanceof EmojiReact);
    const call = context.calls[1];
    assert.ok(call?.activity instanceof Undo);
    const original = await call.activity.getObject();
    assert.ok(original instanceof EmojiReact);
    assert.equal(call.activity.id?.href, `${publicOrigin}/ap/reaction/${reaction.id}#undo`);
    assert.equal(call.activity.actorId?.href, `${publicOrigin}/ap/actor/${target.senderProfileId}`);
    assert.deepEqual(
      call.activity.toIds.map((uri) => uri.href),
      [target.actorUri],
    );
    assert.equal(original.id?.href, `${publicOrigin}/ap/reaction/${reaction.id}`);
    assert.equal(original.objectId?.href, target.objectUri);
    assert.equal(original.content?.toString(), '🎉');
    assert.equal(original.published?.toString(), '2026-07-28T00:00:00Z');
    assert.deepEqual(call.options, {
      orderingKey: `${publicOrigin}/ap/reaction/${reaction.id}`,
      preferSharedInbox: true,
    });
    assert.equal(context.calls[0]?.options?.orderingKey, call.options?.orderingKey);
  });

  test('발신 Profile의 LOCAL Instance canonical origin으로 actor·activity·서명 key를 구성한다', async () => {
    const suffix = crypto.randomUUID();
    const senderOrigin = `https://sender-${suffix}.local.example`;
    const senderInstance = await db
      .insert(Instances)
      .values({
        canonicalOrigin: senderOrigin,
        domain: `sender-${suffix}.local.example`,
        kind: InstanceKind.LOCAL,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const target = await createDeliveryFixture({ senderInstanceId: senderInstance.id });
    const context = createContextFixture(senderOrigin);
    const contextOrigins: string[] = [];
    mock.method(federation, 'createContext', (origin: URL) => {
      contextOrigins.push(origin.origin);
      return context.context;
    });
    const reaction = await createReaction(target, '❤️');

    await sendReaction(reaction);
    await sendReactionUndo(reaction);

    assert.deepEqual(contextOrigins, [senderOrigin, senderOrigin]);
    assert.equal(context.calls.length, 2);
    for (const call of context.calls) {
      assert.equal(
        call.activity.actorId?.href,
        `${senderOrigin}/ap/actor/${target.senderProfileId}`,
      );
      assertSenderKeys(call.sender, `${senderOrigin}/ap/actor/${target.senderProfileId}`);
      assert.equal(call.options?.orderingKey, `${senderOrigin}/ap/reaction/${reaction.id}`);
    }
    assert.equal(context.calls[0]?.activity.id?.href, `${senderOrigin}/ap/reaction/${reaction.id}`);
    assert.equal(
      context.calls[1]?.activity.id?.href,
      `${senderOrigin}/ap/reaction/${reaction.id}#undo`,
    );
  });

  test('FOLLOWERS Post는 create의 최신 접근만 확인하고 Undo 철회는 유지한다', async () => {
    const target = await createDeliveryFixture({ visibility: PostVisibility.FOLLOWERS });
    const context = createContextFixture();
    mock.method(federation, 'createContext', () => context.context);
    const reaction = await createReaction(target, '❤️');

    await sendReaction(reaction);
    assert.equal(context.calls.length, 0);

    const relation = await db
      .insert(ProfileFollows)
      .values({
        followeeProfileId: target.authorProfileId,
        followerProfileId: target.senderProfileId,
      })
      .returning()
      .then(firstOrThrow);
    await sendReaction(reaction);
    assert.equal(context.calls.length, 1);

    await db.delete(ProfileFollows).where(eq(ProfileFollows.id, relation.id));
    await sendReaction(reaction);
    await sendReactionUndo(reaction);

    assert.equal(context.calls.length, 2);
    assert.ok(context.calls[1]?.activity instanceof Undo);
  });

  test('unsupported Type과 없거나 malformed인 저장 projection은 전송하지 않는다', async () => {
    const context = createContextFixture();
    mock.method(federation, 'createContext', () => context.context);

    const unsupported = await createDeliveryFixture();
    await assert.rejects(
      sendReactionUndo({
        createdAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
        id: crypto.randomUUID(),
        postId: unsupported.postId,
        profileId: unsupported.senderProfileId,
        type: '👍',
      }),
      /Unsupported outbound/,
    );

    const missingInbox = await createDeliveryFixture({ inboxUri: null });
    const missingInboxReaction = await createReaction(missingInbox, '❤️');
    await sendReaction(missingInboxReaction);

    const tombstone = await createDeliveryFixture();
    const tombstoneReaction = await createReaction(tombstone, '🎉');
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, tombstone.postId));
    await sendReaction(tombstoneReaction);
    await sendReactionUndo(tombstoneReaction);

    const malformedObject = await createDeliveryFixture({ objectUri: 'not a URI' });
    const malformedObjectReaction = await createReaction(malformedObject, '❤️');
    await assert.rejects(sendReaction(malformedObjectReaction), /Invalid URL|must be an HTTP/);

    const malformedInbox = await createDeliveryFixture({
      inboxUri: 'ftp://remote.example/inbox',
    });
    const malformedInboxReaction = await createReaction(malformedInbox, '❤️');
    await assert.rejects(sendReaction(malformedInboxReaction), /must be an HTTP/);
    assert.equal(context.calls.length, 0);
  });
});

type DeliveryFixture = {
  readonly actorUri: string;
  readonly authorProfileId: string;
  readonly inboxUri: string | null;
  readonly objectUri: string;
  readonly postId: string;
  readonly senderProfileId: string;
  readonly sharedInboxUri: string;
};

const createDeliveryFixture = async ({
  inboxUri,
  objectUri,
  senderInstanceId = localInstanceId,
  visibility = PostVisibility.PUBLIC,
}: {
  inboxUri?: string | null;
  objectUri?: string;
  senderInstanceId?: string;
  visibility?: PostVisibility;
} = {}): Promise<DeliveryFixture> => {
  const suffix = crypto.randomUUID();
  const sender = await db
    .insert(Profiles)
    .values({
      displayName: `sender-${suffix}`,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: `sender-${suffix}`,
      instanceId: senderInstanceId,
      normalizedHandle: `sender-${suffix}`,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const remoteInstance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://remote-${suffix}.example`,
      domain: `remote-${suffix}.example`,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const author = await db
    .insert(Profiles)
    .values({
      displayName: `author-${suffix}`,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: `author-${suffix}`,
      instanceId: remoteInstance.id,
      normalizedHandle: `author-${suffix}`,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const actorUri = `https://${remoteInstance.domain}/users/${author.id}`;
  const resolvedInboxUri =
    inboxUri === undefined ? `https://${remoteInstance.domain}/users/${author.id}/inbox` : inboxUri;
  const sharedInboxUri = `https://${remoteInstance.domain}/inbox`;
  await db.insert(ActivityPubActors).values({
    inboxUri: resolvedInboxUri,
    profileId: author.id,
    sharedInboxUri,
    type: 'PERSON',
    uri: actorUri,
  });
  const post = await db
    .insert(Posts)
    .values({
      profileId: author.id,
      state: PostState.ACTIVE,
      visibility,
    })
    .returning()
    .then(firstOrThrow);
  const resolvedObjectUri = objectUri ?? `https://${remoteInstance.domain}/posts/${post.id}`;
  await db.insert(ActivityPubPosts).values({
    postId: post.id,
    receivedAt: Temporal.Now.instant(),
    uri: resolvedObjectUri,
  });

  return {
    actorUri,
    authorProfileId: author.id,
    inboxUri: resolvedInboxUri,
    objectUri: resolvedObjectUri,
    postId: post.id,
    senderProfileId: sender.id,
    sharedInboxUri,
  };
};

const createReaction = (fixture: DeliveryFixture, type: string) =>
  db
    .insert(Reactions)
    .values({ postId: fixture.postId, profileId: fixture.senderProfileId, type })
    .returning()
    .then(firstOrThrow);

interface SendActivityCall {
  readonly activity: Activity;
  readonly options:
    | { readonly orderingKey?: string; readonly preferSharedInbox?: boolean }
    | undefined;
  readonly recipient: Recipient;
  readonly sender: readonly SenderKeyPair[];
}

const assertSenderKeys = (sender: readonly SenderKeyPair[], actorUri: string) => {
  assert.equal(sender.length, 2);
  assert.equal(sender[0]?.keyId.href, `${actorUri}#main-key`);
  assert.equal(sender[1]?.keyId.href, `${actorUri}#key-2`);
  assert.ok(sender[0]?.privateKey instanceof CryptoKey);
  assert.ok(sender[1]?.privateKey instanceof CryptoKey);
};

const createContextFixture = (canonicalOrigin = publicOrigin) => {
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, canonicalOrigin),
    sendActivity: async (
      sender: readonly SenderKeyPair[],
      recipient: Recipient,
      activity: Activity,
      options?: { orderingKey?: string; preferSharedInbox?: boolean },
    ) => {
      calls.push({ activity, options, recipient, sender });
    },
  } as unknown as Context<void>;

  return { calls, context };
};
