import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { Endpoints, Note, Person } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { count, eq } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Object as ActivityPubObject } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as Materialization from './remote-actor-materialization';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const remoteDomain = 'remote.example';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let seedDatabase: typeof CoreSeed.seedDatabase;
let findOrMaterializeRemoteProfileActor: typeof Materialization.findOrMaterializeRemoteProfileActor;
let materializeRemoteProfileActor: typeof Materialization.materializeRemoteProfileActor;
let RemoteActorMaterializationError: typeof Materialization.RemoteActorMaterializationError;

describe('remote actor materialization', () => {
  let localInstanceId: string;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ ActivityPubActors, db, firstOrThrow, Instances, pg, Profiles } =
      await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));
    ({
      findOrMaterializeRemoteProfileActor,
      materializeRemoteProfileActor,
      RemoteActorMaterializationError,
    } = await import('./remote-actor-materialization'));

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.delete(Profiles);
    await db.delete(Instances).where(eq(Instances.domain, remoteDomain));
  });

  after(async () => {
    await pg.end();
  });

  test('stores a looked-up actor and its endpoint metadata', async () => {
    const actor = createActor();
    const { context, lookupObject } = createLookupContext(async () => actor);
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');

    const profile = await materializeRemoteProfileActor({
      context,
      handle: `alice@${remoteDomain}`,
      now,
    });

    assert.equal(profile.handle, 'alice');
    assert.equal(profile.displayName, 'Alice Remote');
    assert.equal(profile.bio, 'Remote bio');
    assert.equal(profile.followPolicy, ProfileFollowPolicy.APPROVAL_REQUIRED);
    assert.equal(profile.createdAt.toString(), '2024-01-02T03:04:05Z');
    assert.equal(lookupObject.mock.calls.length, 1);
    assert.equal(lookupObject.mock.calls[0]?.arguments[0], `acct:alice@${remoteDomain}`);
    assert.ok(lookupObject.mock.calls[0]?.arguments[1]?.signal instanceof AbortSignal);

    const stored = await db
      .select({ actor: ActivityPubActors, instance: Instances })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Profiles.id, profile.id))
      .limit(1)
      .then(firstOrThrow);

    assert.equal(stored.instance.domain, remoteDomain);
    assert.equal(stored.instance.kind, InstanceKind.ACTIVITYPUB);
    assert.equal(stored.actor.uri, actor.id?.href);
    assert.equal(stored.actor.type, ActivityPubActorType.PERSON);
    assert.equal(stored.actor.inboxUri, `https://${remoteDomain}/users/alice/inbox`);
    assert.equal(stored.actor.outboxUri, `https://${remoteDomain}/users/alice/outbox`);
    assert.equal(stored.actor.followersUri, `https://${remoteDomain}/users/alice/followers`);
    assert.equal(stored.actor.followingUri, `https://${remoteDomain}/users/alice/following`);
    assert.equal(stored.actor.sharedInboxUri, `https://${remoteDomain}/inbox`);
    assert.equal(stored.actor.lastFetchedAt?.toString(), now.toString());
  });

  test('canonicalizes a trailing DNS root dot before lookup and storage', async () => {
    const { context, lookupObject } = createLookupContext(async () => createActor());

    const profile = await materializeRemoteProfileActor({
      context,
      handle: `alice@${remoteDomain}.`,
    });

    const instance = await db
      .select()
      .from(Instances)
      .where(eq(Instances.id, profile.instanceId!))
      .limit(1)
      .then(firstOrThrow);

    assert.equal(instance.domain, remoteDomain);
    assert.equal(lookupObject.mock.calls[0]?.arguments[0], `acct:alice@${remoteDomain}`);
  });

  test('applies the lookup deadline to document and context loaders', async () => {
    const documentLoader = createDocumentLoader();
    const contextLoader = createDocumentLoader();
    const { context, lookupObject } = createLookupContext(async () => createActor(), {
      contextLoader,
      documentLoader,
    });

    await materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` });

    const lookupOptions = lookupObject.mock.calls[0]?.arguments[1];
    assert.ok(lookupOptions?.signal instanceof AbortSignal);
    await lookupOptions?.documentLoader?.(`https://${remoteDomain}/actor`);
    await lookupOptions?.contextLoader?.(`https://${remoteDomain}/context`);
    assert.equal(documentLoader.mock.calls[0]?.arguments[1]?.signal, lookupOptions?.signal);
    assert.equal(contextLoader.mock.calls[0]?.arguments[1]?.signal, lookupOptions?.signal);
  });

  test('rejects lookup errors, missing objects, and non-actors without creating profiles', async () => {
    const lookupError = new Error('lookup failed');
    const cases: Array<{
      expected: RegExp;
      result: ActivityPubObject | Error | null;
    }> = [
      { expected: /lookup failed/, result: lookupError },
      { expected: /did not return an actor/, result: null },
      {
        expected: /did not return an actor/,
        result: new Note({ id: new URL(`https://${remoteDomain}/notes/1`), content: 'note' }),
      },
    ];

    for (const { expected, result } of cases) {
      const { context } = createLookupContext(async () => {
        if (result instanceof Error) {
          throw result;
        }
        return result;
      });

      await assert.rejects(
        materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
        expected,
      );
      assert.equal(await countRows(Profiles), 0);
    }
  });

  test('rejects mismatched and unsupported preferred usernames', async () => {
    for (const actor of [
      createActor({ preferredUsername: 'bob' }),
      createActor({ preferredUsername: 'alice with spaces' }),
    ]) {
      const { context } = createLookupContext(async () => actor);

      await assert.rejects(
        materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
        RemoteActorMaterializationError,
      );
      assert.equal(await countRows(Profiles), 0);
    }
  });

  test('falls back to the handle when the actor name is unsupported', async () => {
    const { context } = createLookupContext(async () => createActor({ name: 'x'.repeat(1_000) }));

    const profile = await materializeRemoteProfileActor({
      context,
      handle: `alice@${remoteDomain}`,
    });

    assert.equal(profile.displayName, 'alice');
  });

  for (const state of [InstanceState.SUSPENDED, InstanceState.UNRESPONSIVE]) {
    test(`does not look up or write actors for a ${state} instance`, async () => {
      await createRemoteInstance({ state });
      const { context, lookupObject } = createLookupContext(async () => createActor());

      await assert.rejects(
        materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
        /Remote instance is unavailable/,
      );

      assert.equal(lookupObject.mock.calls.length, 0);
      assert.equal(await countRows(Profiles), 0);
    });
  }

  test('does not treat an existing local instance as an ActivityPub instance', async () => {
    await createRemoteInstance({ kind: InstanceKind.LOCAL });
    const { context, lookupObject } = createLookupContext(async () => createActor());

    await assert.rejects(
      materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
      /Remote instance is not an ActivityPub instance/,
    );

    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(await countRows(Profiles), 0);
  });

  test('reuses an existing remote actor URI and refreshes published when present', async () => {
    const originalCreatedAt = Temporal.Instant.from('2020-01-01T00:00:00Z');
    const nextPublished = Temporal.Instant.from('2024-01-02T03:04:05Z');
    const stored = await createStoredRemoteActor({ createdAt: originalCreatedAt });
    const { context } = createLookupContext(async () =>
      createActor({ name: 'Refreshed Alice', published: nextPublished }),
    );

    const refreshed = await materializeRemoteProfileActor({
      context,
      handle: `alice@${remoteDomain}`,
      now: Temporal.Instant.from('2026-07-10T00:00:00Z'),
    });

    assert.equal(refreshed.id, stored.profile.id);
    assert.equal(refreshed.displayName, 'Refreshed Alice');
    assert.equal(refreshed.createdAt.toString(), nextPublished.toString());

    const withoutPublished = createActor({ name: 'No Published', published: null });
    const { context: secondContext } = createLookupContext(async () => withoutPublished);
    const preserved = await materializeRemoteProfileActor({
      context: secondContext,
      handle: `alice@${remoteDomain}`,
      now: Temporal.Instant.from('2026-07-11T00:00:00Z'),
    });

    assert.equal(preserved.createdAt.toString(), nextPublished.toString());
  });

  for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
    test(`does not reactivate or update a ${state} remote profile`, async () => {
      const stored = await createStoredRemoteActor({ profileState: state });
      const { context, lookupObject } = createLookupContext(async () =>
        createActor({ name: 'Unexpected Refresh' }),
      );

      await assert.rejects(
        materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
        /Remote profile is unavailable/,
      );

      assert.equal(lookupObject.mock.calls.length, 1);
      const profile = await db
        .select()
        .from(Profiles)
        .where(eq(Profiles.id, stored.profile.id))
        .limit(1)
        .then(firstOrThrow);
      assert.equal(profile.state, state);
      assert.equal(profile.displayName, 'alice');
    });
  }

  test('rejects actor URI collisions with local profiles', async () => {
    const profile = await createProfile({ handle: 'local', instanceId: localInstanceId });
    const actor = createActor();
    await db.insert(ActivityPubActors).values({
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: actor.id!.href,
    });
    const { context } = createLookupContext(async () => actor);

    await assert.rejects(
      materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
      /collides with a local actor/,
    );
  });

  test('rejects a local-origin actor URI before a local actor row exists', async () => {
    const actor = createActor({ id: new URL(`${publicOrigin}/ap/actors/alice`) });
    const { context } = createLookupContext(async () => actor);

    await assert.rejects(
      materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
      /Remote actor URI uses the local origin/,
    );

    assert.equal(await countRows(Profiles), 0);
    assert.equal(await countRows(ActivityPubActors), 0);
  });

  test('rejects handle collisions with a different actor URI', async () => {
    const instance = await createRemoteInstance();
    await createProfile({ handle: 'alice', instanceId: instance.id });
    const { context } = createLookupContext(async () => createActor());

    await assert.rejects(
      materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
      /handle collides with another actor/,
    );
  });

  test('returns stale profiles before scheduling refresh', async () => {
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const stored = await createStoredRemoteActor({
      lastFetchedAt: now.subtract({ hours: 8 * 24 }),
    });
    const { context, lookupObject } = createLookupContext(async () => createActor());
    const refreshes: Array<() => Promise<void>> = [];

    const profile = await findOrMaterializeRemoteProfileActor({
      context,
      handle: `alice@${remoteDomain}`,
      now,
      scheduleRefresh: (refresh) => refreshes.push(refresh),
    });

    assert.equal(profile.id, stored.profile.id);
    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(refreshes.length, 1);

    await refreshes[0]!();
    assert.equal(lookupObject.mock.calls.length, 1);
  });

  test('returns stale profiles without refresh for unresponsive instances', async () => {
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const stored = await createStoredRemoteActor({
      instanceState: InstanceState.UNRESPONSIVE,
      lastFetchedAt: now.subtract({ hours: 8 * 24 }),
    });
    const { context, lookupObject } = createLookupContext(async () => createActor());
    const refreshes: Array<() => Promise<void>> = [];

    const profile = await findOrMaterializeRemoteProfileActor({
      context,
      handle: `alice@${remoteDomain}`,
      now,
      scheduleRefresh: (refresh) => refreshes.push(refresh),
    });

    assert.equal(profile.id, stored.profile.id);
    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(refreshes.length, 0);
  });

  test('rejects stored profiles from suspended instances', async () => {
    await createStoredRemoteActor({ instanceState: InstanceState.SUSPENDED });
    const { context, lookupObject } = createLookupContext(async () => createActor());

    await assert.rejects(
      findOrMaterializeRemoteProfileActor({
        context,
        handle: `alice@${remoteDomain}`,
      }),
      /Profile not found/,
    );
    assert.equal(lookupObject.mock.calls.length, 0);
  });

  test('recovers concurrent first materialization as one remote identity', async () => {
    const actor = createActor();
    let lookupCount = 0;
    let releaseLookups!: () => void;
    const bothLookupsStarted = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    const { context } = createLookupContext(async () => {
      lookupCount += 1;
      if (lookupCount === 2) {
        releaseLookups();
      }
      await bothLookupsStarted;
      return actor;
    });

    const [firstProfile, secondProfile] = await Promise.all([
      materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
      materializeRemoteProfileActor({ context, handle: `alice@${remoteDomain}` }),
    ]);

    assert.equal(firstProfile.id, secondProfile.id);
    assert.equal(await countRows(Profiles), 1);
    assert.equal(await countRows(ActivityPubActors), 1);
  });

  test('matches the remote actor Drizzle schema in PostgreSQL', async () => {
    const columns = await pg<
      Array<{ column_name: string; is_nullable: 'YES' | 'NO' }>
    >`SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'activitypub_actor'
        AND column_name IN (
          'inbox_uri',
          'outbox_uri',
          'followers_uri',
          'following_uri',
          'shared_inbox_uri',
          'last_fetched_at'
        )
      ORDER BY column_name`;

    assert.deepEqual(
      columns.map((column) => [column.column_name, column.is_nullable]),
      [
        ['followers_uri', 'YES'],
        ['following_uri', 'YES'],
        ['inbox_uri', 'YES'],
        ['last_fetched_at', 'YES'],
        ['outbox_uri', 'YES'],
        ['shared_inbox_uri', 'YES'],
      ],
    );

    const enumValues = await pg<Array<{ enumlabel: string }>>`
      SELECT enumlabel
      FROM pg_enum
      INNER JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'activitypub_actor_type'
      ORDER BY enumsortorder
    `;

    assert.deepEqual(
      enumValues.map((row) => row.enumlabel),
      Object.values(ActivityPubActorType),
    );
  });
});

type PersonOptions = ConstructorParameters<typeof Person>[0];

const createActor = (overrides: Partial<PersonOptions> = {}) =>
  new Person({
    endpoints: new Endpoints({ sharedInbox: new URL(`https://${remoteDomain}/inbox`) }),
    followers: new URL(`https://${remoteDomain}/users/alice/followers`),
    following: new URL(`https://${remoteDomain}/users/alice/following`),
    id: new URL(`https://${remoteDomain}/users/alice`),
    inbox: new URL(`https://${remoteDomain}/users/alice/inbox`),
    manuallyApprovesFollowers: true,
    name: 'Alice Remote',
    outbox: new URL(`https://${remoteDomain}/users/alice/outbox`),
    preferredUsername: 'alice',
    published: Temporal.Instant.from('2024-01-02T03:04:05Z'),
    summary: 'Remote bio',
    ...overrides,
  });

const createLookupContext = (
  implementation: (
    identifier: string | URL,
    options?: NonNullable<Parameters<Context<void>['lookupObject']>[1]>,
  ) => Promise<ActivityPubObject | null>,
  loaders: Partial<Pick<Context<void>, 'contextLoader' | 'documentLoader'>> = {},
) => {
  const lookupObject = mock.fn(implementation);

  return {
    context: {
      ...loaders,
      lookupObject: lookupObject as unknown as Context<void>['lookupObject'],
    },
    lookupObject,
  };
};

const createDocumentLoader = () =>
  mock.fn<Context<void>['documentLoader']>(async (url) => ({
    contextUrl: null,
    document: {},
    documentUrl: url,
  }));

const createRemoteInstance = async ({
  kind = InstanceKind.ACTIVITYPUB,
  state = InstanceState.ACTIVE,
}: { kind?: InstanceKind; state?: InstanceState } = {}) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${remoteDomain}`,
      domain: remoteDomain,
      kind,
      state,
    })
    .returning()
    .then(firstOrThrow);

const createProfile = async ({
  createdAt,
  handle,
  instanceId,
  state = ProfileState.ACTIVE,
}: {
  createdAt?: Temporal.Instant;
  handle: string;
  instanceId: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      createdAt,
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: handle.toLowerCase(),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createStoredRemoteActor = async ({
  createdAt = Temporal.Instant.from('2020-01-01T00:00:00Z'),
  instanceState = InstanceState.ACTIVE,
  lastFetchedAt = Temporal.Instant.from('2026-07-09T00:00:00Z'),
  profileState = ProfileState.ACTIVE,
}: {
  createdAt?: Temporal.Instant;
  instanceState?: InstanceState;
  lastFetchedAt?: Temporal.Instant | null;
  profileState?: ProfileState;
} = {}) => {
  const instance = await createRemoteInstance({ state: instanceState });
  const profile = await createProfile({
    createdAt,
    handle: 'alice',
    instanceId: instance.id,
    state: profileState,
  });
  const actor = await db
    .insert(ActivityPubActors)
    .values({
      lastFetchedAt,
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: `https://${remoteDomain}/users/alice`,
    })
    .returning()
    .then(firstOrThrow);

  return { actor, instance, profile };
};

const countRows = async (table: typeof Profiles | typeof ActivityPubActors) =>
  db
    .select({ value: count() })
    .from(table)
    .then(firstOrThrow)
    .then((row) => row.value);

const truncateDatabase = async () => {
  assertTestDatabaseUrl();

  await pg.unsafe(`
    DO $$
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement;
      END IF;
    END $$;
  `);
};

const assertTestDatabaseUrl = () => {
  assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, '/kosmo_test');
};
