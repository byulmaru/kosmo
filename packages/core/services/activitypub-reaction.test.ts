import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import {
  ActivityPubActors,
  ActivityPubReactions,
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileFollows,
  Profiles,
  Reactions,
} from '../db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostVisibility,
  ProfileFollowPolicy,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { temporalClient } from '../temporal/client';
import { materializeInboundReaction, undoInboundReaction } from './activitypub-reaction';
import { createPost } from './post';
import { addReaction } from './reaction';

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

const createLocalPost = async (
  profileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) =>
  createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId,
    visibility,
  }).then(({ post }) => post);

const createRemotePost = async (
  profileId: string,
  objectUri: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) =>
  createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    objectUri,
    origin: 'ACTIVITYPUB',
    profileId,
    publishedAt: null,
    receivedAt: Temporal.Now.instant(),
    visibility,
  }).then((result) => {
    assert.equal(result.created, true);
    return result.post;
  });

const readMappings = (activityUri: string) =>
  db.select().from(ActivityPubReactions).where(eq(ActivityPubReactions.uri, activityUri));

test('Local Note URI를 새 core Reaction과 mapping으로 원자적으로 materialize한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const author = await createProfile(InstanceKind.LOCAL);
  const post = await createLocalPost(author.profile.id);
  const objectUri = new URL(`/ap/note/${post.id}`, author.canonicalOrigin!).href;
  const activityUri = `https://${actor.instance.domain}/activities/${crypto.randomUUID()}`;
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  try {
    const result = await materializeInboundReaction({
      activityUri,
      actorUri: actor.actorUri,
      objectUri,
      type: '🎉',
    });

    assert.equal(result.kind, 'CREATED');
    if (result.kind !== 'CREATED') {
      assert.fail('Expected a created Reaction');
    }
    assert.equal(result.reaction.profileId, actor.profile.id);
    assert.equal(result.reaction.postId, post.id);
    assert.equal(result.reaction.type, '🎉');
    assert.equal((await readMappings(activityUri))[0]?.reactionId, result.reaction.id);
    assert.equal(
      (await db.select().from(Reactions).where(eq(Reactions.id, result.reaction.id))).length,
      1,
    );
    assert.equal(start.mock.callCount(), 1);
    assert.equal(start.mock.calls[0]?.arguments[0], 'reactionCreateEffectsWorkflow');
    assert.deepEqual(start.mock.calls[0]?.arguments[1]?.args, [
      { origin: 'ACTIVITYPUB', reactionId: result.reaction.id },
    ]);
  } finally {
    start.mock.restore();
  }
});

test('inbound Reaction Create start 실패는 commit과 caller 결과를 유지하면서 callback으로 관측한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const author = await createProfile(InstanceKind.LOCAL);
  const post = await createLocalPost(author.profile.id);
  const activityUri = `https://${actor.instance.domain}/activities/${crypto.randomUUID()}`;
  const objectUri = new URL(`/ap/note/${post.id}`, author.canonicalOrigin!).href;
  const failure = new Error('Temporal unavailable');
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    throw failure;
  });
  const reports: unknown[] = [];

  try {
    const result = await materializeInboundReaction({
      activityUri,
      actorUri: actor.actorUri,
      objectUri,
      onWorkflowStartError: (error) => reports.push(error),
      type: '🎉',
    });

    assert.equal(result.kind, 'CREATED');
    if (result.kind !== 'CREATED') {
      assert.fail('Expected a created Reaction');
    }
    assert.equal((await readMappings(activityUri))[0]?.reactionId, result.reaction.id);
    assert.equal(
      (await db.select().from(Reactions).where(eq(Reactions.id, result.reaction.id))).length,
      1,
    );
    assert.deepEqual(reports, [failure]);
  } finally {
    start.mock.restore();
  }
});

test('저장된 Remote Post URI와 서로 다른 Type을 같은 actor에 materialize한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const author = await createProfile(InstanceKind.ACTIVITYPUB);
  const objectUri = `https://${author.instance.domain}/notes/${crypto.randomUUID()}`;
  const post = await createRemotePost(author.profile.id, objectUri);

  const results = await Promise.all(
    ['🥹', '🌈'].map((type) =>
      materializeInboundReaction({
        activityUri: `https://${actor.instance.domain}/activities/${crypto.randomUUID()}`,
        actorUri: actor.actorUri,
        objectUri,
        type,
      }),
    ),
  );

  assert.deepEqual(
    results.map(({ kind }) => kind),
    ['CREATED', 'CREATED'],
  );
  assert.deepEqual(
    (
      await db
        .select({ type: Reactions.type })
        .from(Reactions)
        .where(and(eq(Reactions.profileId, actor.profile.id), eq(Reactions.postId, post.id)))
    )
      .map(({ type }) => type)
      .sort(),
    ['🌈', '🥹'].sort(),
  );
});

test('object와 Followers Post 접근을 side effect 없이 검증한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const author = await createProfile(InstanceKind.LOCAL);
  const post = await createLocalPost(author.profile.id, PostVisibility.FOLLOWERS);
  const objectUri = new URL(`/ap/note/${post.id}`, author.canonicalOrigin!).href;

  const rejected = await Promise.all([
    materializeInboundReaction({
      activityUri: `https://${actor.instance.domain}/activities/unknown-object`,
      actorUri: actor.actorUri,
      objectUri: `https://${author.instance.domain}/ap/note/${crypto.randomUUID()}`,
      type: '❤️',
    }),
    materializeInboundReaction({
      activityUri: `https://${actor.instance.domain}/activities/inaccessible`,
      actorUri: actor.actorUri,
      objectUri,
      type: '❤️',
    }),
  ]);
  assert.deepEqual(
    rejected.map(({ kind }) => kind),
    ['REJECTED', 'REJECTED'],
  );

  await db.insert(ProfileFollows).values({
    followeeProfileId: author.profile.id,
    followerProfileId: actor.profile.id,
  });
  const accepted = await materializeInboundReaction({
    activityUri: `https://${actor.instance.domain}/activities/follower`,
    actorUri: actor.actorUri,
    objectUri,
    type: '❤️',
  });
  assert.equal(accepted.kind, 'CREATED');
});

test('exact duplicate와 기존 core Reaction mapping은 멱등이고 URI conflict는 최초 상태를 보존한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const author = await createProfile(InstanceKind.LOCAL);
  const post = await createLocalPost(author.profile.id);
  const objectUri = new URL(`/ap/note/${post.id}`, author.canonicalOrigin!).href;
  const activityUri = `https://${actor.instance.domain}/activities/${crypto.randomUUID()}`;
  const input = {
    activityUri,
    actorUri: actor.actorUri,
    objectUri,
    type: '👀',
  } as const;
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  try {
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => materializeInboundReaction(input)),
    );
    assert.equal(concurrent.filter(({ kind }) => kind === 'CREATED').length, 1);
    assert.equal(concurrent.filter(({ kind }) => kind === 'DUPLICATE').length, 3);
    assert.equal((await readMappings(activityUri)).length, 1);
    assert.equal(start.mock.callCount(), 1);

    const conflict = await materializeInboundReaction({ ...input, type: '☘️' });
    assert.equal(conflict.kind, 'REJECTED');
    assert.equal(
      (await db.select().from(Reactions).where(eq(Reactions.profileId, actor.profile.id))).filter(
        ({ postId }) => postId === post.id,
      ).length,
      1,
    );
    assert.equal(start.mock.callCount(), 1);

    const secondActor = await createProfile(InstanceKind.ACTIVITYPUB);
    const existing = await addReaction({
      actorProfileId: secondActor.profile.id,
      origin: 'ACTIVITYPUB',
      postId: post.id,
      type: '☘️',
    });
    assert.equal(start.mock.callCount(), 2);
    const mapped = await materializeInboundReaction({
      activityUri: `https://${secondActor.instance.domain}/activities/existing`,
      actorUri: secondActor.actorUri,
      objectUri,
      type: '☘️',
    });
    assert.equal(mapped.kind, 'MAPPED');
    if (mapped.kind !== 'MAPPED') {
      assert.fail('Expected an existing Reaction mapping');
    }
    assert.equal(mapped.reaction.id, existing.reaction.id);
    assert.equal(start.mock.callCount(), 2);
  } finally {
    start.mock.restore();
  }
});

test('같은 activity URI의 동시 conflict는 한 identity만 보존하고 loser Reaction을 rollback한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const author = await createProfile(InstanceKind.LOCAL);
  const post = await createLocalPost(author.profile.id);
  const objectUri = new URL(`/ap/note/${post.id}`, author.canonicalOrigin!).href;
  const activityUri = `https://${actor.instance.domain}/activities/${crypto.randomUUID()}`;

  const results = await Promise.all(
    ['👀', '☘️'].map((type) =>
      materializeInboundReaction({
        activityUri,
        actorUri: actor.actorUri,
        objectUri,
        type,
      }),
    ),
  );

  assert.deepEqual(results.map(({ kind }) => kind).sort(), ['CREATED', 'REJECTED']);
  const reactions = await db
    .select()
    .from(Reactions)
    .where(and(eq(Reactions.profileId, actor.profile.id), eq(Reactions.postId, post.id)));
  assert.equal(reactions.length, 1);
  assert.equal((await readMappings(activityUri))[0]?.reactionId, reactions[0]?.id);
});

test('mapping owner의 Undo만 exact Reaction과 mapping을 제거하고 반복은 no-op이다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const attacker = await createProfile(InstanceKind.ACTIVITYPUB);
  const author = await createProfile(InstanceKind.LOCAL);
  const post = await createLocalPost(author.profile.id);
  const activityUri = `https://${actor.instance.domain}/activities/${crypto.randomUUID()}`;
  const created = await materializeInboundReaction({
    activityUri,
    actorUri: actor.actorUri,
    objectUri: new URL(`/ap/note/${post.id}`, author.canonicalOrigin!).href,
    type: '🥹',
  });
  if (created.kind !== 'CREATED') {
    assert.fail('Expected a created Reaction');
  }
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  try {
    assert.deepEqual(await undoInboundReaction({ activityUri, actorUri: attacker.actorUri }), {
      reactionId: null,
    });
    assert.equal((await readMappings(activityUri)).length, 1);
    assert.equal(start.mock.callCount(), 0);

    assert.deepEqual(await undoInboundReaction({ activityUri, actorUri: actor.actorUri }), {
      reactionId: created.reaction.id,
    });
    assert.equal((await readMappings(activityUri)).length, 0);
    assert.deepEqual(
      await db.select().from(Reactions).where(eq(Reactions.id, created.reaction.id)),
      [],
    );
    assert.equal(start.mock.callCount(), 1);
    assert.equal(start.mock.calls[0]?.arguments[0], 'reactionDeleteEffectsWorkflow');
    assert.deepEqual(start.mock.calls[0]?.arguments[1]?.args, [
      {
        createdAt: created.reaction.createdAt.toString(),
        id: created.reaction.id,
        origin: 'ACTIVITYPUB',
        postId: created.reaction.postId,
        profileId: created.reaction.profileId,
        type: created.reaction.type,
      },
    ]);
    assert.deepEqual(await undoInboundReaction({ activityUri, actorUri: actor.actorUri }), {
      reactionId: null,
    });
    assert.equal(start.mock.callCount(), 1);
  } finally {
    start.mock.restore();
  }
});

test('inbound Reaction Undo start 실패는 삭제 commit과 caller 결과를 유지하면서 callback으로 관측한다', async () => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const author = await createProfile(InstanceKind.LOCAL);
  const post = await createLocalPost(author.profile.id);
  const activityUri = `https://${actor.instance.domain}/activities/${crypto.randomUUID()}`;
  const objectUri = new URL(`/ap/note/${post.id}`, author.canonicalOrigin!).href;
  let failStart = false;
  const failure = new Error('Temporal unavailable');
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    if (failStart) {
      throw failure;
    }
    return undefined as never;
  });
  const reports: unknown[] = [];

  try {
    const created = await materializeInboundReaction({
      activityUri,
      actorUri: actor.actorUri,
      objectUri,
      type: '🥹',
    });
    if (created.kind !== 'CREATED') {
      assert.fail('Expected a created Reaction');
    }
    failStart = true;

    const deleted = await undoInboundReaction({
      activityUri,
      actorUri: actor.actorUri,
      onWorkflowStartError: (error) => reports.push(error),
    });

    assert.equal(deleted.reactionId, created.reaction.id);
    assert.equal((await readMappings(activityUri)).length, 0);
    assert.deepEqual(
      await db.select().from(Reactions).where(eq(Reactions.id, created.reaction.id)),
      [],
    );
    assert.deepEqual(reports, [failure]);
  } finally {
    start.mock.restore();
  }
});
