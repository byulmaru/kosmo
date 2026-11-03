import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { Create, EmojiReact, Like, Note, Person, Undo } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubReactions,
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileBlocks,
  Profiles,
  Reactions,
} from '@kosmo/core/db';
import { seedDatabase } from '@kosmo/core/db/seed';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { createPost } from '@kosmo/core/services';
import { temporalClient } from '@kosmo/core/temporal/client';
import { remoteProfileLookupWorkflow } from '@kosmo/core/temporal/workflows';
import { and, eq } from 'drizzle-orm';
import { handleInboundUndo } from './inbound-follow';
import { setInboundObservabilityReporter } from './inbound-observability';
import { handleInboundReaction } from './inbound-reaction';
import {
  materializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { TestContext } from 'node:test';
import type { InboxContext } from '@fedify/fedify';
import type { InboundCaptureContext } from './inbound-observability';

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
    bodyText: crypto.randomUUID(),
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

const mockStoredActorLookups = (t: TestContext) =>
  t.mock.method(temporalClient.workflow, 'execute', async (workflow: unknown, options: unknown) => {
    assert.equal(workflow, remoteProfileLookupWorkflow.workflow);
    assert.ok(options && typeof options === 'object');
    const input = (options as { args?: readonly { actorUri: string }[] }).args?.[0];
    assert.ok(input);
    const actor = await db
      .select({ profileId: ActivityPubActors.profileId })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.uri, input.actorUri))
      .then((rows) => rows[0]);
    assert.ok(actor, `Expected stored actor ${input.actorUri}`);
    return actor.profileId;
  });

const readReaction = (profileId: string, postId: string) =>
  db
    .select()
    .from(Reactions)
    .where(and(eq(Reactions.profileId, profileId), eq(Reactions.postId, postId)))
    .then((rows) => rows[0]);

test('Like와 EmojiReact의 supported·missing·unsupported content를 공통 투영한다', async (t) => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const lookup = mockStoredActorLookups(t);
  const cases = [
    { Activity: Like, content: '👀', expected: '👀' },
    { Activity: EmojiReact, content: '🫶', expected: '🫶' },
    { Activity: EmojiReact, content: undefined, expected: '❤️' },
    { Activity: EmojiReact, content: ':blobcat:', expected: '❤️' },
    { Activity: Like, content: ':blobcat:', expected: '❤️' },
  ] as const;

  for (const [index, { Activity, content, expected }] of cases.entries()) {
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

    const lookupCall = lookup.mock.calls[index];
    assert.ok(lookupCall);
    const input = (
      lookupCall.arguments[1] as {
        args?: readonly { receipt?: { activityUri: string; receivedAt: string } }[];
      }
    ).args?.[0];
    const receipt = input?.receipt;
    assert.ok(receipt);
    assert.equal(receipt.activityUri, activity.id?.href);
    assert.doesNotThrow(() => Temporal.Instant.from(receipt.receivedAt));
  }
  assert.equal(lookup.mock.callCount(), cases.length);
});

test('아직 저장되지 않은 Like·EmojiReact actor를 materialize한 뒤 기존 Reaction 경로로 저장한다', async () => {
  const publicOrigin = 'http://127.0.0.1:4173';
  process.env.PUBLIC_ORIGIN = publicOrigin;
  await seedDatabase({ publicOrigin });

  const likeActorUri = new URL(`https://${crypto.randomUUID()}.example/users/alice`);
  const emojiActorUri = new URL(`https://${crypto.randomUUID()}.example/users/alice`);
  const likeTarget = await createLocalTarget();
  const emojiTarget = await createLocalTarget();
  const like = new Like({
    actor: likeActorUri,
    id: new URL(`/activities/${crypto.randomUUID()}`, likeActorUri),
    object: likeTarget.objectUri,
  });
  const emojiReact = new EmojiReact({
    actor: emojiActorUri,
    content: '🎉',
    id: new URL(`/activities/${crypto.randomUUID()}`, emojiActorUri),
    object: emojiTarget.objectUri,
  });
  const lookupInputs: Array<{ actorUri: string; contextOrigin?: string }> = [];
  const lookup = mock.method(
    temporalClient.workflow,
    'execute',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, remoteProfileLookupWorkflow.workflow);
      assert.ok(options && typeof options === 'object');
      const workflowOptions = options as {
        args?: Array<{ actorUri: string; contextOrigin?: string }>;
      };
      const lookupInput = workflowOptions.args?.[0];
      assert.ok(lookupInput);
      lookupInputs.push({
        actorUri: lookupInput.actorUri,
        contextOrigin: lookupInput.contextOrigin,
      });
      const actorUri = new URL(lookupInput.actorUri);
      const actor = new Person({ id: actorUri, preferredUsername: 'alice' });
      const profile = await materializeRemoteProfileActor({
        actorUri,
        context: { lookupObject: async () => actor },
      });
      return profile.id;
    },
  );
  const start = mock.method(temporalClient.workflow, 'start', async () => undefined);

  try {
    const context = { ...createContext(null), canonicalOrigin: publicOrigin };
    await handleInboundReaction(context, like);
    await handleInboundReaction(context, emojiReact);

    assert.equal(lookup.mock.callCount(), 2);
    assert.equal(start.mock.callCount(), 2);
    assert.deepEqual(lookupInputs, [
      { actorUri: likeActorUri.href, contextOrigin: publicOrigin },
      { actorUri: emojiActorUri.href, contextOrigin: publicOrigin },
    ]);

    for (const { activity, actorUri, target, expectedType } of [
      { activity: like, actorUri: likeActorUri, target: likeTarget, expectedType: '❤️' },
      {
        activity: emojiReact,
        actorUri: emojiActorUri,
        target: emojiTarget,
        expectedType: '🎉',
      },
    ]) {
      const actorRow = await db
        .select({ profileId: ActivityPubActors.profileId })
        .from(ActivityPubActors)
        .where(eq(ActivityPubActors.uri, actorUri.href))
        .then(firstOrThrow);

      const reaction = await readReaction(actorRow.profileId, target.post.id);
      assert.equal(reaction?.type, expectedType);
      const mapping = await db
        .select({ reactionId: ActivityPubReactions.reactionId })
        .from(ActivityPubReactions)
        .where(eq(ActivityPubReactions.uri, activity.id!.href))
        .then(firstOrThrow);
      assert.equal(mapping.reactionId, reaction?.id);
    }
  } finally {
    start.mock.restore();
    lookup.mock.restore();
  }
});

test('사용할 수 없는 저장 actor lookup은 정상 거부하고 Reaction을 저장하지 않는다', async (t) => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  await db
    .update(Profiles)
    .set({ state: ProfileState.SUSPENDED })
    .where(eq(Profiles.id, actor.profile.id));
  const lookupErrors = [
    new NotFoundError('Profile not found'),
    new ConflictError({ message: 'Remote actor URI uses the local origin' }),
    new RemoteActorMaterializationError('Remote actor representation was rejected'),
  ];
  let lookupIndex = 0;
  const target = await createLocalTarget();
  const lookup = t.mock.method(
    temporalClient.workflow,
    'execute',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, remoteProfileLookupWorkflow.workflow);
      assert.ok(options && typeof options === 'object');
      const input = (options as { args?: readonly { actorUri: string }[] }).args?.[0];
      assert.ok(input);
      assert.equal(input.actorUri, actor.actorUri);
      const storedActor = await db
        .select({ profileId: ActivityPubActors.profileId })
        .from(ActivityPubActors)
        .where(eq(ActivityPubActors.uri, input.actorUri))
        .then((rows) => rows[0]);
      assert.equal(storedActor?.profileId, actor.profile.id);

      const error = lookupErrors[lookupIndex++];
      assert.ok(error);
      throw error;
    },
  );
  const logs: unknown[] = [];
  const restoreReporter = setInboundObservabilityReporter({
    log: (observation) => logs.push(observation),
  });

  try {
    for (let index = 0; index < lookupErrors.length; index += 1) {
      await handleInboundReaction(
        createContext(null),
        new Like({
          actor: new URL(actor.actorUri),
          id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
          object: target.objectUri,
        }),
      );
      assert.equal(await readReaction(actor.profile.id, target.post.id), undefined);
    }

    assert.equal(lookup.mock.callCount(), lookupErrors.length);
    assert.equal(
      await db
        .select({ state: Profiles.state })
        .from(Profiles)
        .where(eq(Profiles.id, actor.profile.id))
        .then(firstOrThrow)
        .then(({ state }) => state),
      ProfileState.SUSPENDED,
    );
    assert.deepEqual(
      logs,
      lookupErrors.map(() => ({
        activityType: 'Like',
        actorOrigin: new URL(actor.actorUri).origin,
        handler: 'reaction',
        objectOrigin: target.objectUri.origin,
        outcome: 'rejected',
        phase: 'actor_lookup',
        reasonCode: 'remote_actor_materialization_rejected',
      })),
    );
  } finally {
    restoreReporter();
  }
});

test('non-HTTP actor/object identity rejects before remote actor lookup', async () => {
  const target = await createLocalTarget();
  const unexpectedLookup = mock.method(temporalClient.workflow, 'execute', async () => {
    throw new Error('Invalid identity must not trigger actor lookup');
  });

  try {
    await handleInboundReaction(
      createContext(null),
      new Like({
        actor: new URL('urn:actor:invalid'),
        id: new URL(`https://invalid.example/activities/${crypto.randomUUID()}`),
        object: target.objectUri,
      }),
    );
    await handleInboundReaction(
      createContext(null),
      new Like({
        actor: new URL(`https://${crypto.randomUUID()}.example/users/alice`),
        id: new URL(`https://invalid.example/activities/${crypto.randomUUID()}`),
        object: new URL('urn:object:invalid'),
      }),
    );

    assert.equal(unexpectedLookup.mock.callCount(), 0);
  } finally {
    unexpectedLookup.mock.restore();
  }
});

test('unknown actor lookup failure propagates without Reaction persistence', async () => {
  const actorUri = new URL(`https://${crypto.randomUUID()}.example/users/alice`);
  const target = await createLocalTarget();
  const failure = new Error('Remote actor lookup unavailable');
  const lookup = mock.method(temporalClient.workflow, 'execute', async () => {
    throw failure;
  });

  try {
    await assert.rejects(
      handleInboundReaction(
        createContext(null),
        new Like({
          actor: actorUri,
          id: new URL(`/activities/${crypto.randomUUID()}`, actorUri),
          object: target.objectUri,
        }),
      ),
      failure,
    );

    assert.equal(lookup.mock.callCount(), 1);
    assert.equal(
      await db
        .select()
        .from(ActivityPubActors)
        .where(eq(ActivityPubActors.uri, actorUri.href))
        .then((rows) => rows.length),
      0,
    );
    assert.equal(await db.$count(Reactions, and(eq(Reactions.postId, target.post.id))), 0);
  } finally {
    lookup.mock.restore();
  }
});

test('inbound Reaction Create와 Undo의 Workflow start 실패를 기존 reporter로 1회 capture하고 결과를 유지한다', async (t) => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const likeTarget = await createLocalTarget();
  const emojiTarget = await createLocalTarget();
  const like = new Like({
    actor: new URL(actor.actorUri),
    id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
    object: likeTarget.objectUri,
  });
  const emojiReact = new EmojiReact({
    actor: new URL(actor.actorUri),
    content: '🎉',
    id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
    object: emojiTarget.objectUri,
  });
  const failure = new Error('Temporal unavailable');
  mockStoredActorLookups(t);
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    throw failure;
  });
  const captures: Array<{ error: unknown; context: InboundCaptureContext }> = [];
  const restoreReporter = setInboundObservabilityReporter({
    captureException: (error, context) => captures.push({ context, error }),
    log: () => undefined,
  });

  try {
    await handleInboundReaction(createContext(null), like);
    await handleInboundReaction(createContext(null), emojiReact);
    assert.ok(await readReaction(actor.profile.id, likeTarget.post.id));
    assert.ok(await readReaction(actor.profile.id, emojiTarget.post.id));

    await handleInboundUndo(
      createContext(null),
      new Undo({
        actor: new URL(actor.actorUri),
        object: like,
      }),
    );

    assert.equal(await readReaction(actor.profile.id, likeTarget.post.id), undefined);
    assert.ok(await readReaction(actor.profile.id, emojiTarget.post.id));
    assert.equal(start.mock.callCount(), 3);
    assert.deepEqual(
      captures.map(({ error }) => error),
      [failure, failure, failure],
    );
    assert.deepEqual(
      captures.map(({ context }) => context.tags),
      [
        {
          activity_type: 'Like',
          handler: 'reaction',
          outcome: 'internal_failure',
          phase: 'effect',
          reason_code: 'reaction_notification_effect_failed',
        },
        {
          activity_type: 'EmojiReact',
          handler: 'reaction',
          outcome: 'internal_failure',
          phase: 'effect',
          reason_code: 'reaction_notification_effect_failed',
        },
        {
          activity_type: 'Undo',
          handler: 'undo',
          outcome: 'internal_failure',
          phase: 'effect',
          reason_code: 'reaction_undo_notification_effect_failed',
        },
      ],
    );
  } finally {
    restoreReporter();
    start.mock.restore();
  }
});

test('activity audience와 personal/shared inbox route에 의존하지 않는다', async (t) => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const lookup = mockStoredActorLookups(t);
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
  assert.equal(lookup.mock.callCount(), 3);
});

test('Active Profile Block은 Like와 EmojiReact를 양방향 rejected projection으로 관측한다', async (t) => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const lookup = mockStoredActorLookups(t);
  const firstTarget = await createLocalTarget();
  const secondTarget = await createLocalTarget();
  await db.insert(ProfileBlocks).values([
    {
      ownerProfileId: firstTarget.author.profile.id,
      targetProfileId: actor.profile.id,
    },
    {
      ownerProfileId: actor.profile.id,
      targetProfileId: secondTarget.author.profile.id,
    },
  ]);
  const logs: unknown[] = [];
  const restoreReporter = setInboundObservabilityReporter({
    log: (observation) => logs.push(observation),
  });

  try {
    await handleInboundReaction(
      createContext(null),
      new Like({
        actor: new URL(actor.actorUri),
        id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
        object: firstTarget.objectUri,
      }),
    );
    await handleInboundReaction(
      createContext(null),
      new EmojiReact({
        actor: new URL(actor.actorUri),
        content: '🎉',
        id: new URL(`/activities/${crypto.randomUUID()}`, actor.actorUri),
        object: secondTarget.objectUri,
      }),
    );
  } finally {
    restoreReporter();
  }

  assert.equal(lookup.mock.callCount(), 2);

  assert.equal(await readReaction(actor.profile.id, firstTarget.post.id), undefined);
  assert.equal(await readReaction(actor.profile.id, secondTarget.post.id), undefined);
  assert.deepEqual(logs, [
    {
      activityType: 'Like',
      actorOrigin: new URL(actor.actorUri).origin,
      handler: 'reaction',
      objectOrigin: firstTarget.objectUri.origin,
      outcome: 'rejected',
      phase: 'projection',
      reasonCode: 'reaction_projection_rejected',
    },
    {
      activityType: 'EmojiReact',
      actorOrigin: new URL(actor.actorUri).origin,
      handler: 'reaction',
      objectOrigin: secondTarget.objectUri.origin,
      outcome: 'rejected',
      phase: 'projection',
      reasonCode: 'reaction_projection_rejected',
    },
  ]);
  assert.equal(
    logs.some(
      (observation) =>
        typeof observation === 'object' &&
        observation !== null &&
        'outcome' in observation &&
        observation.outcome === 'internal_failure',
    ),
    false,
  );
});

test('malformed identity와 복수 actor/object activity는 side effect 없이 거부한다', async (t) => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const otherActor = await createProfile(InstanceKind.ACTIVITYPUB);
  const target = await createLocalTarget();
  const otherTarget = await createLocalTarget();
  const unexpectedLookup = t.mock.method(temporalClient.workflow, 'execute', async () => {
    throw new Error('Invalid identity must not trigger actor lookup');
  });

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
  assert.equal(unexpectedLookup.mock.callCount(), 0);

  assert.equal(await readReaction(actor.profile.id, target.post.id), undefined);
  assert.equal(await readReaction(otherActor.profile.id, target.post.id), undefined);
});

test('Undo URI와 embedded activity는 mapping만 사용하고 actor mismatch를 거부한다', async (t) => {
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
  const lookup = mockStoredActorLookups(t);
  await handleInboundReaction(createContext(null), first);
  await handleInboundReaction(createContext(null), second);
  assert.equal(lookup.mock.callCount(), 2);

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

test('Mastodon embedded Undo(Like)가 fragment activity mapping과 Reaction을 제거한다', async (t) => {
  const actor = await createProfile(InstanceKind.ACTIVITYPUB);
  const target = await createLocalTarget();
  const activityUri = `${actor.actorUri}#likes/${crypto.randomUUID()}`;
  const like = await Like.fromJsonLd({
    '@context': 'https://www.w3.org/ns/activitystreams',
    actor: actor.actorUri,
    id: activityUri,
    object: target.objectUri.href,
    type: 'Like',
  });

  const lookup = mockStoredActorLookups(t);
  await handleInboundReaction(createContext(null), like);
  assert.equal(lookup.mock.callCount(), 1);
  const reaction = await readReaction(actor.profile.id, target.post.id);
  assert.ok(reaction);

  const undo = await Undo.fromJsonLd({
    '@context': 'https://www.w3.org/ns/activitystreams',
    actor: actor.actorUri,
    id: `${activityUri}/undo`,
    object: {
      actor: actor.actorUri,
      id: activityUri,
      object: target.objectUri.href,
      type: 'Like',
    },
    type: 'Undo',
  });
  await handleInboundUndo(createContext(null), undo);

  assert.equal(await readReaction(actor.profile.id, target.post.id), undefined);
  assert.equal(
    await db
      .select()
      .from(ActivityPubReactions)
      .where(eq(ActivityPubReactions.uri, activityUri))
      .then((rows) => rows.length),
    0,
  );
});
