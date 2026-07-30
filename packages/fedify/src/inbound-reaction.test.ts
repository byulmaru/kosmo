import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Create, EmojiReact, Like, Note, Undo } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubReactions,
  db,
  firstOrThrow,
  Instances,
  pg,
  Profiles,
  Reactions,
} from '@kosmo/core/db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostVisibility,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { handleInboundUndo } from './inbound-follow';
import { handleInboundReaction } from './inbound-reaction';
import type { InboxContext } from '@fedify/fedify';

after(async () => {
  await pg.end();
});

const createProfile = async (kind: InstanceKind) => {
  const suffix = crypto.randomUUID();
  const canonicalOrigin = kind === InstanceKind.LOCAL ? `https://${suffix}.local.test` : null;
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin,
      domain: `${suffix}.example`,
      kind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
    })
    .returning()
    .then(firstOrThrow);
  const actorUri =
    kind === InstanceKind.LOCAL
      ? new URL(`/ap/actor/${profile.id}`, canonicalOrigin!).href
      : `https://${instance.domain}/users/${profile.id}`;

  if (kind === InstanceKind.ACTIVITYPUB) {
    await db.insert(ActivityPubActors).values({
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: actorUri,
    });
  }

  return { actorUri, canonicalOrigin, instance, profile };
};

const createLocalTarget = async () => {
  const author = await createProfile(InstanceKind.LOCAL);
  const post = await createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId: author.profile.id,
    visibility: PostVisibility.PUBLIC,
  }).then(({ post }) => post);

  return {
    author,
    objectUri: new URL(`/ap/note/${post.id}`, author.canonicalOrigin!),
    post,
  };
};

const createContext = (recipient: string | null): InboxContext<void> =>
  ({ recipient }) as unknown as InboxContext<void>;

const readReaction = (profileId: string, postId: string) =>
  db
    .select()
    .from(Reactions)
    .where(and(eq(Reactions.profileId, profileId), eq(Reactions.postId, postId)))
    .then((rows) => rows[0]);

test('Like와 EmojiReact의 supported·missing·unsupported content를 공통 투영한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const cases = [
    { Activity: Like, content: '👀', expected: '👀' },
    { Activity: EmojiReact, content: undefined, expected: '❤️' },
    { Activity: EmojiReact, content: ':blobcat:', expected: '❤️' },
    { Activity: Like, content: '👍', expected: '❤️' },
  ] as const;

  for (const { Activity, content, expected } of cases) {
    const target = await createLocalTarget();
    const activity = new Activity({
      actor: new URL(actor.actorUri),
      ...(content === undefined ? {} : { content }),
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: target.objectUri,
      to: new URL(target.author.actorUri),
    });

    await handleInboundReaction(createContext(null), activity);
    assert.equal((await readReaction(actor.profile.id, target.post.id))?.type, expected);
  }
});

test('activity audience와 personal/shared inbox route에 의존하지 않는다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const explicitAudienceTarget = await createLocalTarget();
  await handleInboundReaction(
    createContext(crypto.randomUUID()),
    new Like({
      actor: new URL(actor.actorUri),
      content: '🌈',
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: explicitAudienceTarget.objectUri,
      to: new URL('https://unrelated.example/users/recipient'),
    }),
  );
  assert.equal((await readReaction(actor.profile.id, explicitAudienceTarget.post.id))?.type, '🌈');

  const sharedTarget = await createLocalTarget();
  await handleInboundReaction(
    createContext(null),
    new EmojiReact({
      actor: new URL(actor.actorUri),
      content: '🎉',
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: sharedTarget.objectUri,
    }),
  );
  assert.equal((await readReaction(actor.profile.id, sharedTarget.post.id))?.type, '🎉');

  const personalTarget = await createLocalTarget();
  await handleInboundReaction(
    createContext(crypto.randomUUID()),
    new Like({
      actor: new URL(actor.actorUri),
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: personalTarget.objectUri,
    }),
  );
  assert.equal((await readReaction(actor.profile.id, personalTarget.post.id))?.type, '❤️');
});

test('malformed identity와 복수 actor/object activity는 side effect 없이 거부한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const otherActor = await createProfile(InstanceKind.ACTIVITYPUB);
  const target = await createLocalTarget();
  const otherTarget = await createLocalTarget();

  await handleInboundReaction(
    createContext(null),
    new Like({
      actors: [new URL(actor.actorUri), new URL(otherActor.actorUri)],
      content: '❤️',
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      objects: [target.objectUri, otherTarget.objectUri],
      to: new URL(target.author.actorUri),
    }),
  );
  await handleInboundReaction(
    createContext(null),
    new Like({
      actor: new URL(actor.actorUri),
      content: '❤️',
      object: target.objectUri,
      to: new URL(target.author.actorUri),
    }),
  );

  assert.equal(await readReaction(actor.profile.id, target.post.id), undefined);
  assert.equal(await readReaction(otherActor.profile.id, target.post.id), undefined);
});

test('Undo URI와 embedded activity는 mapping만 사용하고 actor mismatch를 거부한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const attacker = await createProfile(InstanceKind.ACTIVITYPUB);
  const firstTarget = await createLocalTarget();
  const secondTarget = await createLocalTarget();
  const first = new Like({
    actor: new URL(actor.actorUri),
    content: '❤️',
    id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
    object: firstTarget.objectUri,
    to: new URL(firstTarget.author.actorUri),
  });
  const second = new EmojiReact({
    actor: new URL(actor.actorUri),
    content: '☘️',
    id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
    object: secondTarget.objectUri,
    to: new URL(secondTarget.author.actorUri),
  });
  await handleInboundReaction(createContext(null), first);
  await handleInboundReaction(createContext(null), second);

  await handleInboundUndo(
    createContext(null),
    new Undo({
      actor: new URL(actor.actorUri),
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: new Create({
        actor: new URL(actor.actorUri),
        id: first.id,
        object: new Note({ content: 'not a Reaction' }),
      }),
    }),
  );
  assert.ok(await readReaction(actor.profile.id, firstTarget.post.id));

  await handleInboundUndo(
    createContext(null),
    new Undo({
      actors: [new URL(actor.actorUri), new URL(attacker.actorUri)],
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: first.id!,
    }),
  );
  assert.ok(await readReaction(actor.profile.id, firstTarget.post.id));

  await handleInboundUndo(
    createContext(null),
    new Undo({
      actor: new URL(actor.actorUri),
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: new EmojiReact({
        actors: [new URL(actor.actorUri), new URL(attacker.actorUri)],
        id: second.id,
      }),
    }),
  );
  assert.ok(await readReaction(actor.profile.id, secondTarget.post.id));

  await handleInboundUndo(
    createContext(null),
    new Undo({
      actor: new URL(attacker.actorUri),
      id: new URL(`/activities/${crypto.randomUUID()}`, attacker.actorUri),
      object: first.id!,
    }),
  );
  assert.ok(await readReaction(actor.profile.id, firstTarget.post.id));

  await handleInboundUndo(
    createContext(null),
    new Undo({
      actor: new URL(actor.actorUri),
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: first.id!,
    }),
  );
  assert.equal(await readReaction(actor.profile.id, firstTarget.post.id), undefined);

  await handleInboundUndo(
    createContext(null),
    new Undo({
      actor: new URL(actor.actorUri),
      id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
      object: second,
    }),
  );
  assert.equal(await readReaction(actor.profile.id, secondTarget.post.id), undefined);
  assert.equal(
    (
      await db
        .select()
        .from(ActivityPubReactions)
        .where(eq(ActivityPubReactions.uri, second.id!.href))
    ).length,
    0,
  );
});
