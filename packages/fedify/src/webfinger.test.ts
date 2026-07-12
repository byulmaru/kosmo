import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as FederationModule from './federation';
import type * as WebFinger from './webfinger';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let seedDatabase: typeof CoreSeed.seedDatabase;
let federation: typeof FederationModule.federation;
let resolveLocalActorIdentifierByHandle: typeof WebFinger.resolveLocalActorIdentifierByHandle;

describe('WebFinger local profile handle mapping', () => {
  let localInstanceId: string;
  let remoteInstanceId: string;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ db, firstOrThrow, Instances, pg, Profiles } = await import('@kosmo/core/db'));
    ({ federation } = await import('./federation'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));
    ({ resolveLocalActorIdentifierByHandle } = await import('./webfinger'));

    await truncateDatabase();

    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
    remoteInstanceId = await createRemoteInstance();
  });

  beforeEach(async () => {
    await db.delete(Profiles);
  });

  after(async () => {
    await pg.end();
  });

  test('returns the active local profile id for a matching handle', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    assert.equal(await resolveLocalActorIdentifierByHandle('alice'), profile.id);
  });

  test('normalizes the queried handle before lookup', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    assert.equal(await resolveLocalActorIdentifierByHandle(' Alice '), profile.id);
    assert.equal(await resolveLocalActorIdentifierByHandle('Alice'), profile.id);
  });

  test('returns null when the local handle does not exist', async () => {
    assert.equal(await resolveLocalActorIdentifierByHandle('missing'), null);
  });

  for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
    test(`returns null when the matching local profile is ${state}`, async () => {
      await createProfile({ handle: 'alice', instanceId: localInstanceId, state });

      assert.equal(await resolveLocalActorIdentifierByHandle('alice'), null);
    });
  }

  test('ignores a matching handle from a non-configured instance', async () => {
    await createProfile({ handle: 'alice', instanceId: remoteInstanceId });

    assert.equal(await resolveLocalActorIdentifierByHandle('alice'), null);
  });

  test('serves a WebFinger JRD for a local active profile handle', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    const response = await federation.fetch(
      new Request(
        `${publicOrigin}/.well-known/webfinger?resource=${encodeURIComponent(
          'acct:alice@127.0.0.1:4173',
        )}`,
      ),
      { contextData: undefined },
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/jrd\+json/);

    const json = (await response.json()) as {
      subject?: string;
      links?: Array<{ rel?: string; href?: string; type?: string }>;
    };

    assert.equal(json.subject, 'acct:alice@127.0.0.1:4173');
    assert.ok(
      json.links?.some(
        (link) =>
          link.rel === 'self' &&
          link.href === `${publicOrigin}/ap/actor/${profile.id}` &&
          link.type === 'application/activity+json',
      ),
    );
  });

  test('rejects WebFinger requests from a non-canonical host', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    for (const resource of [
      'acct:alice@preview.example',
      `${publicOrigin}/ap/actor/${profile.id}`,
    ]) {
      const response = await federation.fetch(
        new Request(
          `http://preview.example/.well-known/webfinger?resource=${encodeURIComponent(resource)}`,
        ),
        { contextData: undefined },
      );

      assert.equal(response.status, 404);
    }
  });
});

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
  const url = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname));
  assert.match(databaseName, /^kosmo_test(?:_[a-z0-9_]+)?$/);
};

const createRemoteInstance = async () =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: 'https://remote.example',
      domain: 'remote.example',
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning({ id: Instances.id })
    .then(firstOrThrow)
    .then((instance) => instance.id);

const createProfile = async ({
  handle,
  instanceId,
  state = ProfileState.ACTIVE,
}: {
  handle: string;
  instanceId: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);
