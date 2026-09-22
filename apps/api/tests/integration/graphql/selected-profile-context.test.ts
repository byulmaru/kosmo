import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;

type CurrentSessionResult = {
  data?: {
    currentSession?: {
      selectedProfile?: { id: string } | null;
    } | null;
  } | null;
  errors?: Array<{ message: string }>;
};

before(async () => {
  process.env.NODE_ENV = 'production';
  ({ AccountProfiles, Accounts, db, firstOrThrow, Instances, pg, Profiles, Sessions } =
    await import('@kosmo/core/db'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  await pg.end();
});

const createProfile = async (
  instanceId: string,
  handle: string,
  state: ProfileState = ProfileState.ACTIVE,
) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: handle,
      state,
    })
    .returning()
    .then(firstOrThrow);

const requestCurrentSession = async (
  token: string,
  selectedProfileId: unknown,
): Promise<CurrentSessionResult> => {
  const response = await app.request('/graphql', {
    body: JSON.stringify({
      extensions: { selectedProfileId },
      query: 'query { currentSession { selectedProfile { id } } }',
    }),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  assert.equal(response.status, 200);
  return (await response.json()) as CurrentSessionResult;
};

test('selected-profile extension is request-local and falls back for unauthorized profiles', async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://selected-profile-${suffix}.example`,
      domain: `selected-profile-${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const account = await db
    .insert(Accounts)
    .values({
      displayName: `Selected profile account ${suffix}`,
      oidcSubject: `selected-profile-subject-${suffix}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const otherAccount = await db
    .insert(Accounts)
    .values({
      displayName: `Other account ${suffix}`,
      oidcSubject: `other-subject-${suffix}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const fallbackProfile = await createProfile(instance.id, `fallback-${suffix}`);
  const selectedProfile = await createProfile(instance.id, `selected-${suffix}`);
  const invisibleProfile = await createProfile(
    instance.id,
    `invisible-${suffix}`,
    ProfileState.DISABLED,
  );
  const otherProfile = await createProfile(instance.id, `other-${suffix}`);
  await db.insert(AccountProfiles).values([
    { accountId: account.id, profileId: fallbackProfile.id, role: AccountProfileRole.OWNER },
    { accountId: account.id, profileId: selectedProfile.id, role: AccountProfileRole.MEMBER },
    { accountId: account.id, profileId: invisibleProfile.id, role: AccountProfileRole.OWNER },
    { accountId: otherAccount.id, profileId: otherProfile.id, role: AccountProfileRole.OWNER },
  ]);
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: fallbackProfile.id,
      state: SessionState.ACTIVE,
      token: `selected-profile-token-${suffix}`,
    })
    .returning()
    .then(firstOrThrow);

  try {
    const selected = await requestCurrentSession(
      session.token,
      encodeGlobalId('Profile', selectedProfile.id),
    );
    assert.equal(selected.errors, undefined, JSON.stringify(selected.errors));
    assert.deepEqual(selected.data?.currentSession?.selectedProfile, {
      id: encodeGlobalId('Profile', selectedProfile.id),
    });

    const crossAccount = await requestCurrentSession(
      session.token,
      encodeGlobalId('Profile', otherProfile.id),
    );
    assert.equal(crossAccount.errors, undefined, JSON.stringify(crossAccount.errors));
    assert.deepEqual(crossAccount.data?.currentSession?.selectedProfile, {
      id: encodeGlobalId('Profile', fallbackProfile.id),
    });

    const invisible = await requestCurrentSession(
      session.token,
      encodeGlobalId('Profile', invisibleProfile.id),
    );
    assert.equal(invisible.errors, undefined, JSON.stringify(invisible.errors));
    assert.deepEqual(invisible.data?.currentSession?.selectedProfile, {
      id: encodeGlobalId('Profile', fallbackProfile.id),
    });

    const malformed = await requestCurrentSession(session.token, 'not-a-profile-id');
    assert.equal(malformed.errors, undefined, JSON.stringify(malformed.errors));
    assert.deepEqual(malformed.data?.currentSession?.selectedProfile, {
      id: encodeGlobalId('Profile', fallbackProfile.id),
    });

    const persisted = await db
      .select({ activeProfileId: Sessions.activeProfileId })
      .from(Sessions)
      .where(eq(Sessions.id, session.id))
      .then(firstOrThrow);
    assert.equal(persisted.activeProfileId, fallbackProfile.id);
  } finally {
    await db.delete(Sessions).where(eq(Sessions.id, session.id));
    await db
      .delete(AccountProfiles)
      .where(inArray(AccountProfiles.accountId, [account.id, otherAccount.id]));
    await db
      .delete(Profiles)
      .where(
        inArray(Profiles.id, [
          fallbackProfile.id,
          selectedProfile.id,
          invisibleProfile.id,
          otherProfile.id,
        ]),
      );
    await db.delete(Accounts).where(inArray(Accounts.id, [account.id, otherAccount.id]));
    await db.delete(Instances).where(eq(Instances.id, instance.id));
  }
});
