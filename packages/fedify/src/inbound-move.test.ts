import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { Group, Move, Person } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { temporalClient } from '@kosmo/core/temporal/client';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { InboxContext } from '@fedify/fedify';
import type { Object as ActivityPubObject } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { handleInboundMove as HandleInboundMove } from './inbound-move';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileMigrations: typeof CoreDb.ProfileMigrations;
let Profiles: typeof CoreDb.Profiles;
let pg: typeof CoreDb.pg;
let handleInboundMove: typeof HandleInboundMove;
let localInstanceId: string;
const createdInstanceIds: string[] = [];
const createdProfileIds: string[] = [];

describe('inbound Move', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      db,
      firstOrThrow,
      Instances,
      ProfileFollows,
      ProfileFollowRequests,
      ProfileMigrations,
      Profiles,
      pg,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundMove } = await import('./inbound-move'));
    ({
      localInstance: { id: localInstanceId },
    } = await seedDatabase({ publicOrigin }));
  });

  beforeEach(async () => {
    await cleanFixtures();
    mock.restoreAll();
  });

  after(async () => {
    await cleanFixtures();
    await pg.end();
  });

  test('rejects mismatched actor and object before any lookup or workflow start', async () => {
    const lookupObject = mock.fn(async () => null);
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
    const actorUri = new URL('https://source.example/users/alice');
    const objectUri = new URL('https://source.example/users/other');
    const targetUri = new URL('https://target.example/users/alice');

    try {
      await handleInboundMove(
        createContext(lookupObject),
        new Move({ actor: actorUri, object: objectUri, target: targetUri }),
      );
    } finally {
      start.mock.restore();
    }

    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(start.mock.calls.length, 0);
  });

  test('starts a prepared remote-to-local Move without changing preparation state', async () => {
    const fixture = await createFixture({ targetKind: InstanceKind.LOCAL });
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    try {
      await handleInboundMove(
        createContext(),
        new Move({
          actor: fixture.sourceActorUri,
          object: fixture.sourceActorUri,
          target: fixture.targetActorUri,
        }),
      );
    } finally {
      start.mock.restore();
    }

    assert.equal(start.mock.calls.length, 1);
    const [workflowType, options] = start.mock.calls[0]?.arguments ?? [];
    assert.equal(workflowType, 'profileMigrationMoveWorkflow');
    assert.deepEqual((options as { args: unknown[] }).args, [
      {
        sourceProfileId: fixture.sourceProfile!.id,
        targetProfileId: fixture.targetProfile.id,
      },
    ]);
    assert.equal(
      await db
        .select()
        .from(ProfileMigrations)
        .where(
          and(
            eq(ProfileMigrations.sourceProfileId, fixture.sourceProfile!.id),
            eq(ProfileMigrations.targetProfileId, fixture.targetProfile.id),
          ),
        )
        .then((rows) => rows.length),
      1,
    );
  });

  test('starts a remote-to-remote Move after checking the fetched target alias', async () => {
    const fixture = await createFixture({ targetKind: InstanceKind.ACTIVITYPUB });
    const targetActor = createActor(fixture.targetActorUri, fixture.sourceActorUri);
    const lookupObject = mock.fn(async (identifier: string | URL) =>
      identifier.toString() === fixture.targetActorUri.href ? targetActor : null,
    );
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    try {
      await handleInboundMove(
        createContext(lookupObject),
        new Move({
          actor: fixture.sourceActorUri,
          object: fixture.sourceActorUri,
          target: fixture.targetActorUri,
        }),
      );
    } finally {
      start.mock.restore();
    }

    assert.equal(lookupObject.mock.calls.length, 1);
    assert.equal(start.mock.calls.length, 1);
  });

  test('materializes an unknown remote source before starting the workflow', async () => {
    const fixture = await createFixture({
      sourceStored: false,
      targetKind: InstanceKind.ACTIVITYPUB,
    });
    const sourceActor = createActor(fixture.sourceActorUri);
    const targetActor = createActor(fixture.targetActorUri, fixture.sourceActorUri);
    const sourceHandle = `${sourceActor.preferredUsername}@${sourceActor.id!.hostname}`;
    const sourceWebFingerResource = fixture.sourceActorUri.href;
    const originalFetch = globalThis.fetch;
    const sourceWebFinger = mock.method(
      globalThis,
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (
          url.origin === fixture.sourceActorUri.origin &&
          url.pathname === '/.well-known/webfinger' &&
          url.searchParams.get('resource') === sourceWebFingerResource
        ) {
          return Response.json(
            { subject: `acct:${sourceHandle}` },
            { headers: { 'Content-Type': 'application/jrd+json' } },
          );
        }

        return originalFetch(input, init);
      },
    );
    const lookupObject = mock.fn(async (identifier: string | URL) => {
      if (identifier.toString() === fixture.targetActorUri.href) {
        return targetActor;
      }
      if (identifier.toString() === `acct:${sourceHandle}`) {
        return sourceActor;
      }
      return null;
    });
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    try {
      await handleInboundMove(
        createContext(lookupObject),
        new Move({
          actor: fixture.sourceActorUri,
          object: fixture.sourceActorUri,
          target: fixture.targetActorUri,
        }),
      );
    } finally {
      start.mock.restore();
      sourceWebFinger.mock.restore();
    }

    const sourceProfile = await db
      .select({ profile: Profiles })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .where(eq(ActivityPubActors.uri, fixture.sourceActorUri.href))
      .then(firstOrThrow)
      .then(({ profile }) => profile);
    createdProfileIds.push(sourceProfile.id);
    assert.equal(lookupObject.mock.calls.length, 2);
    assert.equal(lookupObject.mock.calls[0]?.arguments[0]?.toString(), fixture.targetActorUri.href);
    assert.equal(lookupObject.mock.calls[1]?.arguments[0]?.toString(), `acct:${sourceHandle}`);
    assert.equal(sourceWebFinger.mock.calls.length, 1);
    assert.equal(start.mock.calls.length, 1);
    const options = start.mock.calls[0]?.arguments[1] as { args: unknown[] };
    assert.deepEqual(options.args, [
      {
        sourceProfileId: sourceProfile.id,
        targetProfileId: fixture.targetProfile.id,
      },
    ]);
  });

  test('supports a non-Person source and target Actor kind', async () => {
    const fixture = await createFixture({
      sourceActorType: ActivityPubActorType.GROUP,
      targetActorType: ActivityPubActorType.GROUP,
      targetKind: InstanceKind.ACTIVITYPUB,
    });
    const sourceActor = createGroupActor(fixture.sourceActorUri);
    const targetActor = createGroupActor(fixture.targetActorUri, fixture.sourceActorUri);
    const lookupObject = mock.fn(async () => targetActor);
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    try {
      await handleInboundMove(
        createContext(lookupObject),
        new Move({
          actor: sourceActor,
          object: sourceActor,
          target: targetActor,
        }),
      );
    } finally {
      start.mock.restore();
    }

    assert.equal(start.mock.calls.length, 1);
    assert.equal(lookupObject.mock.calls.length, 1);
  });

  test('rejects a fetched target whose canonical id does not match target', async () => {
    const fixture = await createFixture({ targetKind: InstanceKind.ACTIVITYPUB });
    const mismatchedTarget = createActor(
      new URL('https://target.example/users/not-the-requested-target'),
      fixture.sourceActorUri,
    );
    const lookupObject = mock.fn(async () => mismatchedTarget);
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
    const beforeState = await readMigrationAndFollowState();

    try {
      await handleInboundMove(
        createContext(lookupObject),
        new Move({
          actor: fixture.sourceActorUri,
          object: fixture.sourceActorUri,
          target: fixture.targetActorUri,
        }),
      );
    } finally {
      start.mock.restore();
    }

    assert.equal(start.mock.calls.length, 0);
    assert.deepEqual(await readMigrationAndFollowState(), beforeState);
  });

  test('requires Local preparation but accepts an approval-required prepared target', async () => {
    for (const options of [
      { targetFollowPolicy: ProfileFollowPolicy.OPEN, withMigration: false },
      {
        targetFollowPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
        withMigration: true,
      },
    ] as const) {
      const fixture = await createFixture({
        targetFollowPolicy: options.targetFollowPolicy,
        targetKind: InstanceKind.LOCAL,
        withMigration: options.withMigration,
      });
      const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
      const beforeState = await readMigrationAndFollowState();

      try {
        await handleInboundMove(
          createContext(),
          new Move({
            actor: fixture.sourceActorUri,
            object: fixture.sourceActorUri,
            target: fixture.targetActorUri,
          }),
        );
      } finally {
        start.mock.restore();
      }

      assert.equal(start.mock.calls.length, options.withMigration ? 1 : 0);
      assert.deepEqual(await readMigrationAndFollowState(), beforeState);
    }
  });

  test('propagates durable workflow start failure for queue retry', async () => {
    const fixture = await createFixture({ targetKind: InstanceKind.LOCAL });
    const startError = new Error('Temporal is unavailable');
    const start = mock.method(temporalClient.workflow, 'start', async () => {
      throw startError;
    });

    try {
      await assert.rejects(
        handleInboundMove(
          createContext(),
          new Move({
            actor: fixture.sourceActorUri,
            object: fixture.sourceActorUri,
            target: fixture.targetActorUri,
          }),
        ),
        (error) => error === startError,
      );
    } finally {
      start.mock.restore();
    }

    assert.equal(start.mock.calls.length, 1);
    assert.equal(
      await db
        .select()
        .from(ProfileMigrations)
        .where(
          and(
            eq(ProfileMigrations.sourceProfileId, fixture.sourceProfile!.id),
            eq(ProfileMigrations.targetProfileId, fixture.targetProfile.id),
          ),
        )
        .then((rows) => rows.length),
      1,
    );
  });

  test('does not trust an embedded remote target alias over the canonical target lookup', async () => {
    const fixture = await createFixture({ targetKind: InstanceKind.ACTIVITYPUB });
    const canonicalTarget = createActor(fixture.targetActorUri);
    const forgedTarget = createActor(fixture.targetActorUri, fixture.sourceActorUri);
    const lookupObject = mock.fn(async (identifier: string | URL) =>
      identifier.toString() === fixture.targetActorUri.href ? canonicalTarget : null,
    );
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
    const beforeState = await readMigrationAndFollowState();

    try {
      await handleInboundMove(
        createContext(lookupObject),
        new Move({
          actor: fixture.sourceActorUri,
          object: fixture.sourceActorUri,
          target: forgedTarget,
        }),
      );
    } finally {
      start.mock.restore();
    }

    assert.equal(start.mock.calls.length, 0);
    assert.deepEqual(await readMigrationAndFollowState(), beforeState);
  });
});

const createActor = (id: URL, alias?: URL) =>
  new Person({
    aliases: alias ? [alias] : [],
    id,
    preferredUsername: id.pathname.split('/').at(-1) ?? 'profile',
  });

const createGroupActor = (id: URL, alias?: URL) =>
  new Group({
    aliases: alias ? [alias] : [],
    id,
    preferredUsername: id.pathname.split('/').at(-1) ?? 'group',
  });

const createContext = (
  lookupObject: (identifier: string | URL) => Promise<ActivityPubObject | null> = async () => null,
): InboxContext<void> =>
  ({
    canonicalOrigin: publicOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    lookupObject,
    recipient: null,
  }) as unknown as InboxContext<void>;

const createFixture = async ({
  sourceActorType = ActivityPubActorType.PERSON,
  sourceStored = true,
  targetActorType = ActivityPubActorType.PERSON,
  targetFollowPolicy = ProfileFollowPolicy.OPEN,
  targetKind,
  withMigration = true,
}: {
  sourceActorType?: ActivityPubActorType;
  sourceStored?: boolean;
  targetActorType?: ActivityPubActorType;
  targetFollowPolicy?: ProfileFollowPolicy;
  targetKind: InstanceKind;
  withMigration?: boolean;
}) => {
  const suffix = randomUUID();
  const sourceActorPath = sourceStored ? suffix : suffix.replaceAll('-', '').slice(0, 24);
  const sourceInstance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: 'https://source.example',
      domain: sourceStored ? `${suffix}.source.example` : 'source.example',
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const targetInstance =
    targetKind === InstanceKind.LOCAL
      ? await db
          .select()
          .from(Instances)
          .where(eq(Instances.id, localInstanceId))
          .then(firstOrThrow)
      : await db
          .insert(Instances)
          .values({
            canonicalOrigin: 'https://target.example',
            domain: `${suffix}.target.example`,
            kind: InstanceKind.ACTIVITYPUB,
            state: InstanceState.ACTIVE,
          })
          .returning()
          .then(firstOrThrow);
  createdInstanceIds.push(sourceInstance.id);
  if (targetKind === InstanceKind.ACTIVITYPUB) {
    createdInstanceIds.push(targetInstance.id);
  }

  const sourceProfile = sourceStored
    ? await db
        .insert(Profiles)
        .values({
          displayName: `${suffix}-source`,
          followPolicy: ProfileFollowPolicy.OPEN,
          handle: `${suffix}-source`,
          instanceId: sourceInstance.id,
          normalizedHandle: `${suffix}-source`,
        })
        .returning()
        .then(firstOrThrow)
    : undefined;
  const targetProfile = await db
    .insert(Profiles)
    .values({
      displayName: `${suffix}-target`,
      followPolicy: targetFollowPolicy,
      handle: `${suffix}-target`,
      instanceId: targetInstance.id,
      normalizedHandle: `${suffix}-target`,
    })
    .returning()
    .then(firstOrThrow);
  createdProfileIds.push(targetProfile.id);
  if (sourceProfile) {
    createdProfileIds.push(sourceProfile.id);
  }

  const sourceActorUri = new URL(`https://source.example/users/${sourceActorPath}`);
  const targetActorUri =
    targetKind === InstanceKind.LOCAL
      ? new URL(`/ap/actor/${targetProfile.id}`, publicOrigin)
      : new URL(`https://target.example/users/${suffix}`);
  await db.insert(ActivityPubActors).values([
    ...(sourceProfile
      ? [
          {
            profileId: sourceProfile.id,
            type: sourceActorType,
            uri: sourceActorUri.href,
          },
        ]
      : []),
    {
      profileId: targetProfile.id,
      type: targetActorType,
      uri: targetActorUri.href,
    },
  ]);

  if (targetKind === InstanceKind.LOCAL && withMigration && sourceProfile) {
    await db.insert(ProfileMigrations).values({
      sourceProfileId: sourceProfile.id,
      targetProfileId: targetProfile.id,
    });
  }

  return { sourceActorUri, sourceProfile, targetActorUri, targetProfile };
};

const cleanFixtures = async () => {
  if (createdProfileIds.length > 0) {
    await db
      .delete(ProfileMigrations)
      .where(
        or(
          inArray(ProfileMigrations.sourceProfileId, createdProfileIds),
          inArray(ProfileMigrations.targetProfileId, createdProfileIds),
        ),
      )
      .catch(() => undefined);
    await db.delete(Profiles).where(inArray(Profiles.id, createdProfileIds));
    createdProfileIds.length = 0;
  }
  if (createdInstanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, createdInstanceIds));
    createdInstanceIds.length = 0;
  }
};

const readMigrationAndFollowState = async () => ({
  follows: await db.select().from(ProfileFollows),
  migrations: await db.select().from(ProfileMigrations),
  requests: await db.select().from(ProfileFollowRequests),
});
