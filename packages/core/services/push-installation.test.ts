import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  Profiles,
  PushInstallations,
  Sessions,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
  PushInstallationPlatform,
  SessionState,
} from '../enums';
import { ConflictError, PermissionDeniedError } from '../error';
import {
  findEligiblePushInstallations,
  invalidatePushInstallation,
  PushInstallationStorageError,
  registerPushInstallation,
  unregisterPushInstallation,
} from './push-installation';
import { revokeCurrentSession } from './session';
import type { DatabaseHandle } from '../db';

after(async () => {
  await pg.end();
});

type Fixture = {
  readonly account: typeof Accounts.$inferSelect;
  readonly profiles: readonly (typeof Profiles.$inferSelect)[];
  readonly sessions: readonly (typeof Sessions.$inferSelect)[];
  readonly instance: typeof Instances.$inferSelect;
};

const createFixture = async ({
  profileCount = 1,
  sessionCount = 1,
}: {
  readonly profileCount?: number;
  readonly sessionCount?: number;
} = {}): Promise<Fixture> => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({
      displayName: suffix,
      oidcSubject: `subject-${suffix}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profiles = await db
    .insert(Profiles)
    .values(
      Array.from({ length: profileCount }, (_, index) => ({
        displayName: `${suffix}-${index}`,
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: `${suffix}-${index}`,
        instanceId: instance.id,
        normalizedHandle: `${suffix}-${index}`,
        state: ProfileState.ACTIVE,
      })),
    )
    .returning();
  await db.insert(AccountProfiles).values(
    profiles.map((profile) => ({
      accountId: account.id,
      profileId: profile.id,
      role: AccountProfileRole.OWNER,
    })),
  );
  const sessions = await db
    .insert(Sessions)
    .values(
      Array.from({ length: sessionCount }, (_, index) => ({
        accountId: account.id,
        state: SessionState.ACTIVE,
        token: `${suffix}-${index}`,
      })),
    )
    .returning();

  return { account, instance, profiles, sessions };
};

const cleanupFixture = async ({ account, instance, profiles, sessions }: Fixture) => {
  await db.delete(Notifications).where(
    inArray(
      Notifications.recipientProfileId,
      profiles.map(({ id }) => id),
    ),
  );
  await db.delete(Sessions).where(
    inArray(
      Sessions.id,
      sessions.map(({ id }) => id),
    ),
  );
  await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, account.id));
  await db.delete(Profiles).where(
    inArray(
      Profiles.id,
      profiles.map(({ id }) => id),
    ),
  );
  await db.delete(Instances).where(eq(Instances.id, instance.id));
  await db.delete(Accounts).where(eq(Accounts.id, account.id));
};

const insertNotification = async ({
  createdAt,
  recipientProfileId,
}: {
  readonly createdAt: Temporal.Instant;
  readonly recipientProfileId: string;
}) =>
  db
    .insert(Notifications)
    .values({
      createdAt,
      data: {},
      kind: NotificationKind.FOLLOW,
      recipientProfileId,
      sourceId: crypto.randomUUID(),
    })
    .returning()
    .then(firstOrThrow);

test('registration refresh keeps the epoch and eligible delivery ignores read state', async () => {
  const fixture = await createFixture({ profileCount: 2 });
  const [session] = fixture.sessions;
  assert.ok(session);
  const installationId = crypto.randomUUID();

  try {
    await registerPushInstallation({
      accountId: fixture.account.id,
      installationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: session.id,
      token: `token-${crypto.randomUUID()}`,
    });
    const firstRegistration = await db
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId))
      .then(firstOrThrow);

    await registerPushInstallation({
      accountId: fixture.account.id,
      installationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: session.id,
      token: `refreshed-${crypto.randomUUID()}`,
    });
    const refreshed = await db
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId))
      .then(firstOrThrow);
    assert.equal(
      refreshed.registrationEpoch.toString(),
      firstRegistration.registrationEpoch.toString(),
    );
    assert.equal(refreshed.token.startsWith('refreshed-'), true);
    const historicalEpoch = Temporal.Now.instant().subtract({ hours: 26 });
    await db
      .update(PushInstallations)
      .set({ registrationEpoch: historicalEpoch })
      .where(eq(PushInstallations.id, refreshed.id));

    const before = await insertNotification({
      createdAt: historicalEpoch.subtract({ seconds: 1 }),
      recipientProfileId: fixture.profiles[0]!.id,
    });
    const after = await insertNotification({
      createdAt: Temporal.Now.instant(),
      recipientProfileId: fixture.profiles[0]!.id,
    });
    const expired = await insertNotification({
      createdAt: Temporal.Now.instant().subtract({ hours: 25 }),
      recipientProfileId: fixture.profiles[0]!.id,
    });
    await db
      .update(Notifications)
      .set({ readAt: Temporal.Now.instant() })
      .where(eq(Notifications.id, after.id));

    assert.deepEqual(
      await findEligiblePushInstallations({
        notificationId: before.id,
      }),
      [],
    );
    assert.equal(
      (
        await findEligiblePushInstallations({
          notificationId: after.id,
        })
      ).length,
      1,
    );
    assert.deepEqual(
      await findEligiblePushInstallations({
        notificationId: expired.id,
      }),
      [],
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('all active installations fan out for every Account Profile', async () => {
  const fixture = await createFixture({ profileCount: 2, sessionCount: 2 });
  const [firstSession, secondSession] = fixture.sessions;
  assert.ok(firstSession);
  assert.ok(secondSession);
  const firstInstallationId = crypto.randomUUID();
  const secondInstallationId = crypto.randomUUID();

  try {
    await Promise.all([
      registerPushInstallation({
        accountId: fixture.account.id,
        installationId: firstInstallationId,
        platform: PushInstallationPlatform.ANDROID,
        sessionId: firstSession.id,
        token: `token-${crypto.randomUUID()}`,
      }),
      registerPushInstallation({
        accountId: fixture.account.id,
        installationId: secondInstallationId,
        platform: PushInstallationPlatform.IOS,
        sessionId: secondSession.id,
        token: `token-${crypto.randomUUID()}`,
      }),
    ]);
    const notification = await insertNotification({
      createdAt: Temporal.Now.instant(),
      recipientProfileId: fixture.profiles[1]!.id,
    });

    assert.deepEqual(
      (await findEligiblePushInstallations({ notificationId: notification.id }))
        .map(({ installationId }) => installationId)
        .sort(),
      [firstInstallationId, secondInstallationId].sort(),
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('ownership, stale invalidation, unregister and logout remove delivery eligibility', async () => {
  const owner = await createFixture();
  const other = await createFixture();
  const [ownerSession] = owner.sessions;
  const [otherSession] = other.sessions;
  assert.ok(ownerSession);
  assert.ok(otherSession);
  const installationId = crypto.randomUUID();
  const firstToken = `token-${crypto.randomUUID()}`;
  const secondToken = `token-${crypto.randomUUID()}`;

  try {
    await registerPushInstallation({
      accountId: owner.account.id,
      installationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: ownerSession.id,
      token: firstToken,
    });
    await assert.rejects(
      registerPushInstallation({
        accountId: other.account.id,
        installationId,
        platform: PushInstallationPlatform.ANDROID,
        sessionId: otherSession.id,
        token: secondToken,
      }),
      PermissionDeniedError,
    );
    await assert.rejects(
      registerPushInstallation({
        accountId: other.account.id,
        installationId: crypto.randomUUID(),
        platform: PushInstallationPlatform.ANDROID,
        sessionId: otherSession.id,
        token: firstToken,
      }),
      ConflictError,
    );

    await registerPushInstallation({
      accountId: owner.account.id,
      installationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: ownerSession.id,
      token: secondToken,
    });
    await invalidatePushInstallation({
      accountId: owner.account.id,
      installationId,
      token: firstToken,
    });
    assert.deepEqual(
      (
        await db
          .select({ token: PushInstallations.token })
          .from(PushInstallations)
          .where(eq(PushInstallations.installationId, installationId))
      )[0],
      { token: secondToken },
    );
    await unregisterPushInstallation({
      accountId: owner.account.id,
      installationId,
      sessionId: ownerSession.id,
    });
    assert.deepEqual(
      await db
        .select({ id: PushInstallations.id })
        .from(PushInstallations)
        .where(eq(PushInstallations.installationId, installationId)),
      [],
    );
  } finally {
    await cleanupFixture(owner);
    await cleanupFixture(other);
  }
});

test('expired and revoked sessions delete installations before re-registration', async () => {
  const fixture = await createFixture({ sessionCount: 2 });
  const [oldSession, newSession] = fixture.sessions;
  assert.ok(oldSession);
  assert.ok(newSession);
  const installationId = crypto.randomUUID();

  try {
    await registerPushInstallation({
      accountId: fixture.account.id,
      installationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: oldSession.id,
      token: `token-${crypto.randomUUID()}`,
    });
    const original = await db
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId))
      .then(firstOrThrow);

    await db
      .update(Sessions)
      .set({ state: SessionState.EXPIRED })
      .where(eq(Sessions.id, oldSession.id));
    assert.deepEqual(await revokeCurrentSession({ token: oldSession.token }), {
      status: 'ALREADY_UNAUTHENTICATED',
    });
    assert.deepEqual(
      await db
        .select({ id: PushInstallations.id })
        .from(PushInstallations)
        .where(eq(PushInstallations.installationId, installationId)),
      [],
    );

    await registerPushInstallation({
      accountId: fixture.account.id,
      installationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: newSession.id,
      token: original.token,
    });
    const rebound = await db
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId))
      .then(firstOrThrow);
    assert.ok(
      rebound.registrationEpoch.epochNanoseconds > original.registrationEpoch.epochNanoseconds,
    );

    await revokeCurrentSession({ token: newSession.token });
    assert.deepEqual(
      await db
        .select({ id: PushInstallations.id })
        .from(PushInstallations)
        .where(eq(PushInstallations.installationId, installationId)),
      [],
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('account deletion cascades all installations', async () => {
  const fixture = await createFixture({ sessionCount: 2 });
  const [firstSession, secondSession] = fixture.sessions;
  assert.ok(firstSession);
  assert.ok(secondSession);

  try {
    await Promise.all(
      [firstSession, secondSession].map((session) =>
        registerPushInstallation({
          accountId: fixture.account.id,
          installationId: crypto.randomUUID(),
          platform: PushInstallationPlatform.ANDROID,
          sessionId: session.id,
          token: `token-${crypto.randomUUID()}`,
        }),
      ),
    );
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.accountId, fixture.account.id)),
      2,
    );

    // The existing Account deletion cleanup removes Sessions first; the
    // Session foreign key then cascades the installation rows before Account
    // itself is deleted.
    await db.delete(Sessions).where(eq(Sessions.accountId, fixture.account.id));
    await db.delete(Accounts).where(eq(Accounts.id, fixture.account.id));
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.accountId, fixture.account.id)),
      0,
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('concurrent first registration converges to one installation row', async () => {
  const fixture = await createFixture({ sessionCount: 2 });
  const [firstSession, secondSession] = fixture.sessions;
  assert.ok(firstSession);
  assert.ok(secondSession);
  const installationId = crypto.randomUUID();

  try {
    await Promise.all([
      registerPushInstallation({
        accountId: fixture.account.id,
        installationId,
        platform: PushInstallationPlatform.ANDROID,
        sessionId: firstSession.id,
        token: `token-${crypto.randomUUID()}`,
      }),
      registerPushInstallation({
        accountId: fixture.account.id,
        installationId,
        platform: PushInstallationPlatform.ANDROID,
        sessionId: secondSession.id,
        token: `token-${crypto.randomUUID()}`,
      }),
    ]);
    assert.equal(
      await db.$count(
        PushInstallations,
        and(
          eq(PushInstallations.accountId, fixture.account.id),
          eq(PushInstallations.installationId, installationId),
        ),
      ),
      1,
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('accepts the maximum opaque registration token length', async () => {
  const fixture = await createFixture();
  const [session] = fixture.sessions;
  assert.ok(session);
  const installationId = crypto.randomUUID();
  const token = 't'.repeat(4096);

  try {
    await registerPushInstallation({
      accountId: fixture.account.id,
      installationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: session.id,
      token,
    });
    assert.equal(
      (
        await db
          .select({ token: PushInstallations.token })
          .from(PushInstallations)
          .where(eq(PushInstallations.installationId, installationId))
      )[0]?.token.length,
      4096,
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('removes same-account duplicate tokens and rejects other-account tokens', async () => {
  const owner = await createFixture();
  const other = await createFixture();
  const [ownerSession] = owner.sessions;
  const [otherSession] = other.sessions;
  assert.ok(ownerSession);
  assert.ok(otherSession);
  const token = 't'.repeat(4096);
  const existingTargetToken = `existing-${crypto.randomUUID()}`;
  const ownerInstallationId = crypto.randomUUID();
  const sameAccountInstallationId = crypto.randomUUID();
  const otherAccountInstallationId = crypto.randomUUID();

  try {
    await registerPushInstallation({
      accountId: owner.account.id,
      installationId: ownerInstallationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: ownerSession.id,
      token,
    });
    await registerPushInstallation({
      accountId: owner.account.id,
      installationId: sameAccountInstallationId,
      platform: PushInstallationPlatform.IOS,
      sessionId: ownerSession.id,
      token: existingTargetToken,
    });
    const historicalEpoch = Temporal.Instant.from('2000-01-01T00:00:00Z');
    await db
      .update(PushInstallations)
      .set({ registrationEpoch: historicalEpoch })
      .where(eq(PushInstallations.installationId, sameAccountInstallationId));

    await registerPushInstallation({
      accountId: owner.account.id,
      installationId: sameAccountInstallationId,
      platform: PushInstallationPlatform.IOS,
      sessionId: ownerSession.id,
      token,
    });
    await assert.rejects(
      registerPushInstallation({
        accountId: other.account.id,
        installationId: otherAccountInstallationId,
        platform: PushInstallationPlatform.ANDROID,
        sessionId: otherSession.id,
        token,
      }),
      ConflictError,
    );

    assert.deepEqual(
      await db
        .select({ id: PushInstallations.id })
        .from(PushInstallations)
        .where(eq(PushInstallations.installationId, ownerInstallationId)),
      [],
    );
    assert.deepEqual(
      (
        await db
          .select({ accountId: PushInstallations.accountId, token: PushInstallations.token })
          .from(PushInstallations)
          .where(eq(PushInstallations.installationId, sameAccountInstallationId))
      )[0],
      { accountId: owner.account.id, token },
    );
    assert.equal(
      (
        await db
          .select({ registrationEpoch: PushInstallations.registrationEpoch })
          .from(PushInstallations)
          .where(eq(PushInstallations.installationId, sameAccountInstallationId))
      )[0]?.registrationEpoch.epochMilliseconds > historicalEpoch.epochMilliseconds,
      true,
    );
  } finally {
    await cleanupFixture(owner);
    await cleanupFixture(other);
  }
});

test('unexpected token storage failures are sanitized for registration and invalidation', async () => {
  const secret = `token-${crypto.randomUUID()}`;
  const databaseError = new Error(`driver params include ${secret}`);
  Object.assign(databaseError, {
    cause: { code: '54000', detail: `query parameter ${secret}` },
  });
  const failingDatabase = {
    transaction: async () => {
      throw databaseError;
    },
    delete: () => ({
      where: async () => {
        throw databaseError;
      },
    }),
  } as unknown as DatabaseHandle;
  const input = {
    accountId: crypto.randomUUID(),
    installationId: crypto.randomUUID(),
    platform: PushInstallationPlatform.ANDROID,
    sessionId: crypto.randomUUID(),
    token: secret,
  };

  for (const [name, operation] of [
    ['register', () => registerPushInstallation(input, failingDatabase)],
    [
      'invalidate',
      () =>
        invalidatePushInstallation(
          {
            accountId: input.accountId,
            installationId: input.installationId,
            token: input.token,
          },
          failingDatabase,
        ),
    ],
  ] as const) {
    await assert.rejects(operation(), (error: unknown) => {
      assert.ok(error instanceof PushInstallationStorageError);
      assert.equal(error.message, `Push installation ${name} failed.`);
      assert.equal(error.databaseCode, '54000');
      assert.equal('cause' in error, false);
      assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
});
