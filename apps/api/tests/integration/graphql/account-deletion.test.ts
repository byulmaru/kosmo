import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  ApplicationState,
  ApplicationType,
  InstanceKind,
  InstanceState,
  OAuthTokenState,
  ProfileFollowPolicy,
  ProfileState,
  PushInstallationPlatform,
  SessionState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ApplicationAuthorizations: typeof CoreDb.ApplicationAuthorizations;
let Applications: typeof CoreDb.Applications;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let OAuthAuthorizationCodes: typeof CoreDb.OAuthAuthorizationCodes;
let OAuthTokens: typeof CoreDb.OAuthTokens;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let PushInstallations: typeof CoreDb.PushInstallations;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;

type GraphQLResult<T> = {
  data?: T;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

type FixtureOptions = {
  readonly profileStates?: ReadonlyArray<ProfileState>;
};

before(async () => {
  process.env.NODE_ENV = 'production';
  ({
    AccountProfiles,
    Accounts,
    ApplicationAuthorizations,
    Applications,
    db,
    firstOrThrow,
    Instances,
    OAuthAuthorizationCodes,
    OAuthTokens,
    pg,
    Profiles,
    PushInstallations,
    Sessions,
  } = await import('@kosmo/core/db'));
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

const createFixture = async ({ profileStates = [] }: FixtureOptions = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  const profiles = [];
  for (const [index, state] of profileStates.entries()) {
    profiles.push(
      await db
        .insert(Profiles)
        .values({
          displayName: `${suffix}-${index}`,
          followPolicy: ProfileFollowPolicy.OPEN,
          handle: `${suffix}-${index}`,
          instanceId: instance.id,
          normalizedHandle: `${suffix}-${index}`,
          state,
        })
        .returning()
        .then(firstOrThrow),
    );
  }
  const account = await db
    .insert(Accounts)
    .values({
      displayName: suffix,
      featureFlags: ['preserved-flag'],
      oidcSubject: `subject-${suffix}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  if (profiles.length) {
    await db.insert(AccountProfiles).values(
      profiles.map((profile) => ({
        accountId: account.id,
        profileId: profile.id,
        role: AccountProfileRole.OWNER,
      })),
    );
  }
  const sessions = await db
    .insert(Sessions)
    .values([
      {
        accountId: account.id,
        activeProfileId: profiles[0]?.id,
        state: SessionState.ACTIVE,
        token: `current-${suffix}`,
      },
      {
        accountId: account.id,
        activeProfileId: profiles[0]?.id,
        state: SessionState.ACTIVE,
        token: `other-${suffix}`,
      },
      {
        accountId: account.id,
        state: SessionState.REVOKED,
        token: `revoked-${suffix}`,
      },
    ])
    .returning();

  const application = await db
    .insert(Applications)
    .values({
      clientId: `client-${suffix}`,
      name: `Application ${suffix}`,
      redirectUris: ['https://client.example/callback'],
      scopes: ['read'],
      state: ApplicationState.ACTIVE,
      type: ApplicationType.CONFIDENTIAL,
    })
    .returning()
    .then(firstOrThrow);
  const now = Temporal.Now.instant();
  await db.insert(ApplicationAuthorizations).values({
    accountId: account.id,
    applicationId: application.id,
    profileId: profiles[0]?.id,
    scopes: ['read'],
  });
  await db.insert(OAuthTokens).values({
    accessTokenHash: `access-${suffix}`,
    accountId: account.id,
    applicationId: application.id,
    expiresAt: now.add({ hours: 1 }),
    issuedAt: now,
    lastUsedAt: now,
    profileId: profiles[0]?.id,
    scopes: ['read'],
    state: OAuthTokenState.ACTIVE,
  });
  await db.insert(OAuthTokens).values({
    accessTokenHash: `expired-${suffix}`,
    accountId: account.id,
    applicationId: application.id,
    expiresAt: now.subtract({ hours: 1 }),
    issuedAt: now.subtract({ hours: 2 }),
    lastUsedAt: now.subtract({ hours: 1 }),
    profileId: profiles[0]?.id,
    scopes: ['read'],
    state: OAuthTokenState.EXPIRED,
  });
  await db.insert(OAuthAuthorizationCodes).values({
    accountId: account.id,
    applicationId: application.id,
    codeChallenge: 'challenge',
    codeChallengeMethod: 'S256',
    codeHash: `code-${suffix}`,
    expiresAt: now.add({ minutes: 5 }),
    profileId: profiles[0]?.id,
    redirectUri: 'https://client.example/callback',
    scopes: ['read'],
  });
  await db.insert(PushInstallations).values(
    sessions.slice(0, 2).map((session, index) => ({
      accountId: account.id,
      platform: index === 0 ? PushInstallationPlatform.IOS : PushInstallationPlatform.ANDROID,
      sessionId: session.id,
      token: `push-${suffix}-${index}`,
    })),
  );

  return { account, application, instance, profiles, sessions };
};

const cleanup = async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
  await db.delete(PushInstallations).where(eq(PushInstallations.accountId, fixture.account.id));
  await db
    .delete(OAuthAuthorizationCodes)
    .where(eq(OAuthAuthorizationCodes.accountId, fixture.account.id));
  await db.delete(OAuthTokens).where(eq(OAuthTokens.accountId, fixture.account.id));
  await db
    .delete(ApplicationAuthorizations)
    .where(eq(ApplicationAuthorizations.accountId, fixture.account.id));
  await db.delete(Sessions).where(eq(Sessions.accountId, fixture.account.id));
  await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, fixture.account.id));
  await db.delete(Accounts).where(eq(Accounts.id, fixture.account.id));
  await db.delete(Applications).where(eq(Applications.id, fixture.application.id));
  if (fixture.profiles.length) {
    await db.delete(Profiles).where(
      inArray(
        Profiles.id,
        fixture.profiles.map(({ id }) => id),
      ),
    );
  }
  await db.delete(Instances).where(eq(Instances.id, fixture.instance.id));
};

const request = async <T>(query: string, token?: string): Promise<GraphQLResult<T>> => {
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query }),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    method: 'POST',
  });
  return response.json() as Promise<GraphQLResult<T>>;
};

test('Active Profile이 남으면 탈퇴 mutation이 변경 없이 거부된다', async () => {
  const fixture = await createFixture({
    profileStates: [ProfileState.ACTIVE, ProfileState.DISABLED],
  });

  try {
    const deletion = await request<{
      deleteAccount: { completed: boolean };
    }>('mutation { deleteAccount { completed } }', fixture.sessions[0]!.token);
    assert.deepEqual(deletion.data, {
      deleteAccount: { completed: false },
    });
    assert.equal(
      (
        await db
          .select({ state: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0]?.state,
      AccountState.ACTIVE,
    );
    const persistedSessions = await db
      .select({ id: Sessions.id, state: Sessions.state, token: Sessions.token })
      .from(Sessions)
      .where(eq(Sessions.accountId, fixture.account.id))
      .orderBy(Sessions.token);
    assert.deepEqual(
      persistedSessions,
      [...fixture.sessions]
        .sort((left, right) => left.token.localeCompare(right.token))
        .map(({ id, state, token }) => ({ id, state, token })),
    );
    assert.equal(
      await db.$count(AccountProfiles, eq(AccountProfiles.accountId, fixture.account.id)),
      fixture.profiles.length,
    );
    assert.equal(
      (
        await db
          .select({ revokedAt: ApplicationAuthorizations.revokedAt })
          .from(ApplicationAuthorizations)
          .where(eq(ApplicationAuthorizations.accountId, fixture.account.id))
      )[0]?.revokedAt,
      null,
    );
    assert.deepEqual(
      (
        await db
          .select({ revokedAt: OAuthTokens.revokedAt, state: OAuthTokens.state })
          .from(OAuthTokens)
          .where(eq(OAuthTokens.accountId, fixture.account.id))
          .orderBy(OAuthTokens.accessTokenHash)
      ).map(({ revokedAt, state }) => ({ revokedAt, state })),
      [
        { revokedAt: null, state: OAuthTokenState.ACTIVE },
        { revokedAt: null, state: OAuthTokenState.EXPIRED },
      ],
    );
    assert.equal(
      await db.$count(
        OAuthAuthorizationCodes,
        eq(OAuthAuthorizationCodes.accountId, fixture.account.id),
      ),
      1,
    );
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.accountId, fixture.account.id)),
      2,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('비활성 Profile만 있는 Account를 탈퇴하고 Profile을 보존한다', async () => {
  const fixture = await createFixture({ profileStates: [ProfileState.DISABLED] });

  try {
    const deletion = await request<{
      deleteAccount: { completed: boolean };
    }>('mutation { deleteAccount { completed } }', fixture.sessions[0]!.token);
    assert.deepEqual(deletion.data, {
      deleteAccount: { completed: true },
    });

    assert.deepEqual(
      await db
        .select({
          displayName: Accounts.displayName,
          featureFlags: Accounts.featureFlags,
          state: Accounts.state,
        })
        .from(Accounts)
        .where(eq(Accounts.id, fixture.account.id))
        .then(firstOrThrow),
      {
        displayName: fixture.account.displayName,
        featureFlags: ['preserved-flag'],
        state: AccountState.DISABLED,
      },
    );
    assert.equal(
      (
        await db
          .select({ state: Profiles.state })
          .from(Profiles)
          .where(eq(Profiles.id, fixture.profiles[0]!.id))
      )[0]?.state,
      ProfileState.DISABLED,
    );
    assert.equal(
      await db.$count(AccountProfiles, eq(AccountProfiles.accountId, fixture.account.id)),
      1,
    );
    const persistedSessions = await db
      .select({ id: Sessions.id, state: Sessions.state, token: Sessions.token })
      .from(Sessions)
      .where(eq(Sessions.accountId, fixture.account.id))
      .orderBy(Sessions.token);
    assert.deepEqual(
      persistedSessions,
      [...fixture.sessions]
        .sort((left, right) => left.token.localeCompare(right.token))
        .map(({ id, state, token }) => ({
          id,
          state: state === SessionState.ACTIVE ? SessionState.REVOKED : state,
          token,
        })),
    );
    assert.equal(
      (
        await db
          .select({ revokedAt: ApplicationAuthorizations.revokedAt })
          .from(ApplicationAuthorizations)
          .where(eq(ApplicationAuthorizations.accountId, fixture.account.id))
      )[0]?.revokedAt
        ? true
        : false,
      true,
    );
    const tokens = await db
      .select({ revokedAt: OAuthTokens.revokedAt, state: OAuthTokens.state })
      .from(OAuthTokens)
      .where(eq(OAuthTokens.accountId, fixture.account.id));
    assert.equal(tokens.length, 2);
    assert.ok(
      tokens.every(({ revokedAt, state }) => state === OAuthTokenState.REVOKED && revokedAt),
    );
    assert.equal(
      await db.$count(
        OAuthAuthorizationCodes,
        eq(OAuthAuthorizationCodes.accountId, fixture.account.id),
      ),
      0,
    );
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.accountId, fixture.account.id)),
      0,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('Account 탈퇴 API는 인증과 Bearer 형식을 요구한다', async () => {
  const anonymous = await request('mutation { deleteAccount { completed } }');
  assert.equal(anonymous.data, null);
  assert.equal(anonymous.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

  const malformed = await app.request('/graphql', {
    body: JSON.stringify({ query: 'mutation { deleteAccount { completed } }' }),
    headers: { authorization: 'Basic invalid', 'content-type': 'application/json' },
    method: 'POST',
  });
  const result = (await malformed.json()) as GraphQLResult<unknown>;
  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
});
