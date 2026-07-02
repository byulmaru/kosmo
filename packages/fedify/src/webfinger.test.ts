import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as WebFinger from './webfinger';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let seedDatabase: typeof CoreSeed.seedDatabase;
let mapLocalProfileHandle: typeof WebFinger.mapLocalProfileHandle;
let resolveLocalActorIdentifierByHandle: typeof WebFinger.resolveLocalActorIdentifierByHandle;

describe('WebFinger local profile handle mapping', () => {
  let localInstanceId: string;
  let remoteInstanceId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    const coreDb = await import('@kosmo/core/db');
    const seed = await import('@kosmo/core/db/seed');
    const webfinger = await import('./webfinger');

    db = coreDb.db;
    firstOrThrow = coreDb.firstOrThrow;
    Instances = coreDb.Instances;
    pg = coreDb.pg;
    Profiles = coreDb.Profiles;
    seedDatabase = seed.seedDatabase;
    mapLocalProfileHandle = webfinger.mapLocalProfileHandle;
    resolveLocalActorIdentifierByHandle = webfinger.resolveLocalActorIdentifierByHandle;

    await truncateDatabase();

    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
    remoteInstanceId = await createRemoteInstance();
  });

  beforeEach(async () => {
    await db.delete(Profiles);
  });

  afterAll(async () => {
    await pg.end();
  });

  test('returns the active local profile id for a matching handle', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    await expect(resolveLocalActorIdentifierByHandle('alice')).resolves.toBe(profile.id);
  });

  test('normalizes the queried handle before lookup', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    await expect(resolveLocalActorIdentifierByHandle(' Alice ')).resolves.toBe(profile.id);
  });

  test('returns null when the local handle does not exist', async () => {
    await expect(resolveLocalActorIdentifierByHandle('missing')).resolves.toBeNull();
  });

  test.each([ProfileState.DISABLED, ProfileState.SUSPENDED])(
    'returns null when the matching local profile is %s',
    async (state) => {
      await createProfile({ handle: 'alice', instanceId: localInstanceId, state });

      await expect(resolveLocalActorIdentifierByHandle('alice')).resolves.toBeNull();
    },
  );

  test('ignores a matching handle from a non-configured instance', async () => {
    await createProfile({ handle: 'alice', instanceId: remoteInstanceId });

    await expect(resolveLocalActorIdentifierByHandle('alice')).resolves.toBeNull();
  });

  test('exposes the same lookup as a Fedify handle mapper callback', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    await expect(mapLocalProfileHandle({} as never, 'alice')).resolves.toBe(profile.id);
  });
});

const truncateDatabase = async () => {
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
