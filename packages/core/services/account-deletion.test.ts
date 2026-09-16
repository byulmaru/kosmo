import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import {
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
} from '../db';
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
} from '../enums';
import { deleteAccount, getAccountDeletionEligibility } from './account-deletion';

after(async () => {
  await pg.end();
});

type FixtureOptions = {
  readonly accountState?: AccountState;
  readonly profileStates?: ReadonlyArray<ProfileState>;
  readonly withAuthorizations?: boolean;
};

const createFixture = async ({
  accountState = AccountState.ACTIVE,
  profileStates = [],
  withAuthorizations = false,
}: FixtureOptions = {}) => {
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
      displayName: `display-${suffix}`,
      featureFlags: ['preserved-flag'],
      oidcSubject: `subject-${suffix}`,
      state: accountState,
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

  let application: typeof Applications.$inferSelect | undefined;
  if (withAuthorizations) {
    const createdApplication = await db
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
    application = createdApplication;
    const now = Temporal.Now.instant();
    await db.insert(ApplicationAuthorizations).values({
      accountId: account.id,
      applicationId: createdApplication.id,
      profileId: profiles[0]?.id,
      scopes: ['read'],
    });
    await db.insert(OAuthTokens).values({
      accessTokenHash: `access-${suffix}`,
      accountId: account.id,
      applicationId: createdApplication.id,
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
      applicationId: createdApplication.id,
      expiresAt: now.subtract({ hours: 1 }),
      issuedAt: now.subtract({ hours: 2 }),
      lastUsedAt: now.subtract({ hours: 1 }),
      profileId: profiles[0]?.id,
      scopes: ['read'],
      state: OAuthTokenState.EXPIRED,
    });
    await db.insert(OAuthAuthorizationCodes).values({
      accountId: account.id,
      applicationId: createdApplication.id,
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
  }

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
  if (fixture.application) {
    await db.delete(Applications).where(eq(Applications.id, fixture.application.id));
  }
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

test('Profile이 없으면 탈퇴 eligibility를 허용한다', async () => {
  const fixture = await createFixture();

  try {
    const currentToken = fixture.sessions.find(({ token }) => token.startsWith('current-'))!.token;
    assert.deepEqual(await getAccountDeletionEligibility({ token: currentToken }), {
      activeProfileCount: 0,
      canDelete: true,
    });
    assert.deepEqual(await deleteAccount({ token: currentToken }), {
      activeProfileCount: 0,
      status: 'DELETED',
    });
    assert.equal(
      (
        await db
          .select({ state: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0]?.state,
      AccountState.DISABLED,
    );
  } finally {
    await cleanup(fixture);
  }
});

test('Active Profile이 남아 있으면 모든 탈퇴 변경을 거부한다', async () => {
  const fixture = await createFixture({
    profileStates: [ProfileState.ACTIVE, ProfileState.DISABLED],
    withAuthorizations: true,
  });

  try {
    const currentToken = fixture.sessions.find(({ token }) => token.startsWith('current-'))!.token;
    assert.deepEqual(await getAccountDeletionEligibility({ token: currentToken }), {
      activeProfileCount: 1,
      canDelete: false,
    });
    assert.deepEqual(await deleteAccount({ token: currentToken }), {
      activeProfileCount: 1,
      status: 'BLOCKED',
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
    assert.ok(
      (
        await db
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.accountId, fixture.account.id))
      ).every(({ state }) => state === SessionState.ACTIVE || state === SessionState.REVOKED),
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

test('DISABLED가 아닌 Profile은 탈퇴 eligibility를 충족하지 못한다', async () => {
  const fixture = await createFixture({ profileStates: [ProfileState.SUSPENDED] });

  try {
    assert.deepEqual(await getAccountDeletionEligibility({ token: fixture.sessions[0]!.token }), {
      activeProfileCount: 1,
      canDelete: false,
    });
  } finally {
    await cleanup(fixture);
  }
});

test('모든 Profile이 비활성화된 Suspended Account를 원자적으로 탈퇴하고 속성을 보존한다', async () => {
  const fixture = await createFixture({
    accountState: AccountState.SUSPENDED,
    profileStates: [ProfileState.DISABLED],
    withAuthorizations: true,
  });
  const currentToken = fixture.sessions.find(({ token }) => token.startsWith('current-'))!.token;

  try {
    assert.deepEqual(await getAccountDeletionEligibility({ token: currentToken }), {
      activeProfileCount: 0,
      canDelete: true,
    });
    assert.deepEqual(await deleteAccount({ token: currentToken }), {
      activeProfileCount: 0,
      status: 'DELETED',
    });

    const account = await db
      .select({
        displayName: Accounts.displayName,
        featureFlags: Accounts.featureFlags,
        state: Accounts.state,
      })
      .from(Accounts)
      .where(eq(Accounts.id, fixture.account.id))
      .then(firstOrThrow);
    assert.deepEqual(account, {
      displayName: fixture.account.displayName,
      featureFlags: ['preserved-flag'],
      state: AccountState.DISABLED,
    });
    const persistedSessions = await db
      .select({ id: Sessions.id, state: Sessions.state })
      .from(Sessions)
      .where(eq(Sessions.accountId, fixture.account.id))
      .orderBy(Sessions.token);
    assert.deepEqual(
      persistedSessions,
      [...fixture.sessions]
        .sort((left, right) => left.token.localeCompare(right.token))
        .map(({ id, state }) => ({
          id,
          state: state === SessionState.ACTIVE ? SessionState.REVOKED : state,
        })),
    );
    assert.equal(
      await db.$count(AccountProfiles, eq(AccountProfiles.accountId, fixture.account.id)),
      fixture.profiles.length,
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
      await db.$count(
        ApplicationAuthorizations,
        eq(ApplicationAuthorizations.accountId, fixture.account.id),
      ),
      1,
    );
    assert.ok(
      (
        await db
          .select({ revokedAt: ApplicationAuthorizations.revokedAt })
          .from(ApplicationAuthorizations)
          .where(eq(ApplicationAuthorizations.accountId, fixture.account.id))
      )[0]?.revokedAt,
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
    assert.deepEqual(await deleteAccount({ token: currentToken }), {
      activeProfileCount: 0,
      status: 'ALREADY_DELETED',
    });
  } finally {
    await cleanup(fixture);
  }
});

test('호출 transaction이 rollback되면 Account 탈퇴 결과도 함께 rollback된다', async () => {
  const fixture = await createFixture({
    profileStates: [ProfileState.DISABLED],
    withAuthorizations: true,
  });

  try {
    await assert.rejects(
      db.transaction(async (tx) => {
        const currentToken = fixture.sessions.find(({ token }) =>
          token.startsWith('current-'),
        )!.token;
        assert.deepEqual(await deleteAccount({ token: currentToken }, tx), {
          activeProfileCount: 0,
          status: 'DELETED',
        });
        throw new Error('rollback');
      }),
      /rollback/,
    );
    assert.equal(
      (
        await db
          .select({ state: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0]?.state,
      AccountState.ACTIVE,
    );
    assert.ok(
      (
        await db
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.accountId, fixture.account.id))
      ).some(({ state }) => state === SessionState.ACTIVE),
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
