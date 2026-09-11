import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
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
import { findEligiblePushInstallations, invalidatePushInstallation } from './push-installation';
import { revokeCurrentSession } from './session';

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

test('eligible delivery enforces epoch, read-state, and TTL boundaries', async () => {
  const fixture = await createFixture({ profileCount: 2 });
  const [session] = fixture.sessions;
  assert.ok(session);
  const installationId = crypto.randomUUID();
  const historicalEpoch = Temporal.Now.instant().subtract({ hours: 1 });

  try {
    const installation = await db
      .insert(PushInstallations)
      .values({
        accountId: fixture.account.id,
        installationId,
        platform: PushInstallationPlatform.ANDROID,
        registrationEpoch: historicalEpoch,
        sessionId: session.id,
        token: `token-${crypto.randomUUID()}`,
      })
      .returning()
      .then(firstOrThrow);

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
    const expiredEpoch = Temporal.Now.instant().subtract({ hours: 26 });
    await db
      .update(PushInstallations)
      .set({ registrationEpoch: expiredEpoch })
      .where(eq(PushInstallations.id, installation.id));
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
  const registrationEpoch = Temporal.Now.instant().subtract({ seconds: 1 });

  try {
    await db.insert(PushInstallations).values([
      {
        accountId: fixture.account.id,
        installationId: firstInstallationId,
        platform: PushInstallationPlatform.ANDROID,
        registrationEpoch,
        sessionId: firstSession.id,
        token: `token-${crypto.randomUUID()}`,
      },
      {
        accountId: fixture.account.id,
        installationId: secondInstallationId,
        platform: PushInstallationPlatform.IOS,
        registrationEpoch,
        sessionId: secondSession.id,
        token: `token-${crypto.randomUUID()}`,
      },
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

    await db
      .update(Sessions)
      .set({ state: SessionState.REVOKED })
      .where(eq(Sessions.id, secondSession.id));
    const revokedSessionNotification = await insertNotification({
      createdAt: Temporal.Now.instant(),
      recipientProfileId: fixture.profiles[1]!.id,
    });
    assert.deepEqual(
      (await findEligiblePushInstallations({ notificationId: revokedSessionNotification.id })).map(
        ({ installationId }) => installationId,
      ),
      [firstInstallationId],
    );

    await db
      .update(Sessions)
      .set({ state: SessionState.ACTIVE })
      .where(eq(Sessions.id, secondSession.id));
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, fixture.profiles[1]!.id));
    const disabledProfileNotification = await insertNotification({
      createdAt: Temporal.Now.instant(),
      recipientProfileId: fixture.profiles[1]!.id,
    });
    assert.deepEqual(
      await findEligiblePushInstallations({ notificationId: disabledProfileNotification.id }),
      [],
    );

    await db
      .update(Profiles)
      .set({ state: ProfileState.ACTIVE })
      .where(eq(Profiles.id, fixture.profiles[1]!.id));
    await db
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(eq(Accounts.id, fixture.account.id));
    const disabledAccountNotification = await insertNotification({
      createdAt: Temporal.Now.instant(),
      recipientProfileId: fixture.profiles[0]!.id,
    });
    assert.deepEqual(
      await findEligiblePushInstallations({ notificationId: disabledAccountNotification.id }),
      [],
    );
  } finally {
    await cleanupFixture(fixture);
  }
});

test('stale provider invalidation leaves the refreshed token intact', async () => {
  const fixture = await createFixture();
  const [session] = fixture.sessions;
  assert.ok(session);
  const installationId = crypto.randomUUID();
  const firstToken = `token-${crypto.randomUUID()}`;
  const secondToken = `token-${crypto.randomUUID()}`;

  try {
    await db.insert(PushInstallations).values({
      accountId: fixture.account.id,
      installationId,
      platform: PushInstallationPlatform.ANDROID,
      sessionId: session.id,
      token: secondToken,
    });
    await invalidatePushInstallation({
      accountId: fixture.account.id,
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
    await invalidatePushInstallation({
      accountId: fixture.account.id,
      installationId,
      token: secondToken,
    });
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

test('session revoke deletes installations for terminal and active sessions', async () => {
  const fixture = await createFixture({ sessionCount: 2 });
  const [oldSession, newSession] = fixture.sessions;
  assert.ok(oldSession);
  assert.ok(newSession);
  const expiredInstallationId = crypto.randomUUID();
  const activeInstallationId = crypto.randomUUID();

  try {
    await db.insert(PushInstallations).values([
      {
        accountId: fixture.account.id,
        installationId: expiredInstallationId,
        platform: PushInstallationPlatform.ANDROID,
        sessionId: oldSession.id,
        token: `token-${crypto.randomUUID()}`,
      },
      {
        accountId: fixture.account.id,
        installationId: activeInstallationId,
        platform: PushInstallationPlatform.IOS,
        sessionId: newSession.id,
        token: `token-${crypto.randomUUID()}`,
      },
    ]);

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
        .where(eq(PushInstallations.installationId, expiredInstallationId)),
      [],
    );

    assert.deepEqual(await revokeCurrentSession({ token: newSession.token }), {
      status: 'REVOKED',
    });
    assert.deepEqual(
      await db
        .select({ id: PushInstallations.id })
        .from(PushInstallations)
        .where(eq(PushInstallations.installationId, activeInstallationId)),
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
    await db.insert(PushInstallations).values([
      {
        accountId: fixture.account.id,
        installationId: crypto.randomUUID(),
        platform: PushInstallationPlatform.ANDROID,
        sessionId: firstSession.id,
        token: `token-${crypto.randomUUID()}`,
      },
      {
        accountId: fixture.account.id,
        installationId: crypto.randomUUID(),
        platform: PushInstallationPlatform.IOS,
        sessionId: secondSession.id,
        token: `token-${crypto.randomUUID()}`,
      },
    ]);
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
