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
let ActivityPubActorKeys: typeof CoreDb.ActivityPubActorKeys;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
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

    ({ ActivityPubActorKeys, ActivityPubActors, db, firstOrThrow, Instances, pg, Profiles } =
      await import('@kosmo/core/db'));
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
    assert.ok(
      json.links?.some(
        (link) =>
          link.rel === 'http://webfinger.net/rel/profile-page' &&
          link.href === `${publicOrigin}/@alice`,
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

  test('serves the canonical actor document and reuses its stored key pairs', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });
    const requestActor = () =>
      federation.fetch(
        new Request(`${publicOrigin}/ap/actor/${profile.id}`, {
          headers: { accept: 'application/activity+json' },
        }),
        { contextData: undefined },
      );
    const response = await requestActor();
    const actor = (await response.json()) as {
      assertionMethod?: Array<{ controller?: string; id?: string; type?: string }>;
      endpoints?: { sharedInbox?: string };
      followers?: string;
      following?: string;
      id?: string;
      inbox?: string;
      name?: string;
      outbox?: string;
      preferredUsername?: string;
      publicKey?: { id?: string; owner?: string };
      published?: string;
      url?: string;
    };

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/activity\+json/);
    assert.equal(actor.id, `${publicOrigin}/ap/actor/${profile.id}`);
    assert.equal(actor.preferredUsername, 'alice');
    assert.equal(actor.name, 'alice');
    assert.equal(actor.url, `${publicOrigin}/@alice`);
    assert.equal(actor.published, profile.createdAt.toString());
    assert.equal(actor.inbox, `${publicOrigin}/ap/actor/${profile.id}/inbox`);
    assert.equal(actor.endpoints?.sharedInbox, `${publicOrigin}/inbox`);
    assert.equal(actor.outbox, `${publicOrigin}/ap/actor/${profile.id}/outbox`);
    assert.equal(actor.publicKey?.id, `${publicOrigin}/ap/actor/${profile.id}#main-key`);
    assert.equal(actor.publicKey?.owner, `${publicOrigin}/ap/actor/${profile.id}`);
    assert.ok(
      actor.assertionMethod?.some(
        (method) =>
          method.id?.startsWith(`${publicOrigin}/ap/actor/${profile.id}#`) === true &&
          method.type === 'Multikey' &&
          method.controller === `${publicOrigin}/ap/actor/${profile.id}`,
      ),
    );
    assert.equal(actor.followers, undefined);
    assert.equal(actor.following, undefined);

    const actorsAfterFirstRequest = await db.select().from(ActivityPubActors);
    const keysAfterFirstRequest = await db.select().from(ActivityPubActorKeys);
    assert.equal(actorsAfterFirstRequest.length, 1);
    assert.equal(keysAfterFirstRequest.length, 2);

    assert.equal((await requestActor()).status, 200);

    const actorsAfterSecondRequest = await db.select().from(ActivityPubActors);
    const keysAfterSecondRequest = await db.select().from(ActivityPubActorKeys);
    assert.deepEqual(actorsAfterSecondRequest, actorsAfterFirstRequest);
    assert.deepEqual(keysAfterSecondRequest, keysAfterFirstRequest);
  });

  test('returns 404 for a missing local actor document', async () => {
    const response = await federation.fetch(
      new Request(`${publicOrigin}/ap/actor/019f6f67-1111-7777-8888-123456789abc`, {
        headers: { accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );

    assert.equal(response.status, 404);
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
