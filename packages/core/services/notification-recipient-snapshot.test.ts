import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Instances,
  NotificationRecipientSnapshots,
  Notifications,
  pg,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
} from '../enums';
import { materializeNotification } from './notification-policy';
import { captureNotificationRecipients } from './notification-recipient-snapshot';

const sourceIds: string[] = [];
const profileIds: string[] = [];
const instanceIds: string[] = [];
const accountIds: string[] = [];

const createProfile = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);
  return profile;
};

const createAccount = async (
  profileId: string,
  role: AccountProfileRole = AccountProfileRole.MEMBER,
) => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: `subject-${suffix}`, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  accountIds.push(account.id);
  await db.insert(AccountProfiles).values({ accountId: account.id, profileId, role });
  return account.id;
};

after(async () => {
  try {
    if (sourceIds.length > 0) {
      await db
        .delete(NotificationRecipientSnapshots)
        .where(inArray(NotificationRecipientSnapshots.sourceId, sourceIds));
      await db.delete(Notifications).where(inArray(Notifications.sourceId, sourceIds));
    }
    if (accountIds.length > 0) {
      await db.delete(AccountProfiles).where(inArray(AccountProfiles.accountId, accountIds));
    }
    if (profileIds.length > 0) {
      await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
    }
    if (accountIds.length > 0) {
      await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
    }
    if (instanceIds.length > 0) {
      await db.delete(Instances).where(inArray(Instances.id, instanceIds));
    }
  } finally {
    await pg.end();
  }
});

test('an empty recipient snapshot remains empty after Account/Profile membership arrives later', async () => {
  const profile = await createProfile();
  const sourceId = crypto.randomUUID();
  sourceIds.push(sourceId);

  const original = await captureNotificationRecipients(db, {
    kind: NotificationKind.MENTION,
    recipientProfileIds: [profile.id],
    sourceId,
  });
  assert.deepEqual(original.recipients, { [profile.id]: [] });

  const lateAccountId = await createAccount(profile.id);
  const retry = await captureNotificationRecipients(db, {
    kind: NotificationKind.MENTION,
    recipientProfileIds: [profile.id],
    sourceId,
  });

  assert.equal(retry.actorAccountId, null);
  assert.deepEqual(retry.recipients, { [profile.id]: [] });
  assert.equal(retry.createdAt.toString(), original.createdAt.toString());
  assert.equal(await db.$count(AccountProfiles, eq(AccountProfiles.accountId, lateAccountId)), 1);
  assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, sourceId)), 0);
});

test('recipient capture excludes only the exact acting Account', async () => {
  const profile = await createProfile();
  const actorAccountId = await createAccount(profile.id, AccountProfileRole.OWNER);
  const siblingAccountId = await createAccount(profile.id);
  const sourceId = crypto.randomUUID();
  sourceIds.push(sourceId);

  const snapshot = await captureNotificationRecipients(db, {
    actorAccountId,
    kind: NotificationKind.MENTION,
    recipientProfileIds: [profile.id],
    sourceId,
  });

  assert.equal(snapshot.actorAccountId, actorAccountId);
  assert.deepEqual(snapshot.recipients, { [profile.id]: [siblingAccountId] });
});

test('one Account can receive the same source and kind under two Profiles with independent read state', async () => {
  const firstProfile = await createProfile();
  const secondProfile = await createProfile();
  const authorProfile = await createProfile();
  const accountId = await createAccount(firstProfile.id, AccountProfileRole.OWNER);
  await db.insert(AccountProfiles).values({
    accountId,
    profileId: secondProfile.id,
    role: AccountProfileRole.MEMBER,
  });
  const sourceId = crypto.randomUUID();
  sourceIds.push(sourceId);

  const [firstId] = await materializeNotification(db, {
    kind: NotificationKind.MENTION,
    recipientAccountIds: [accountId],
    recipientProfileId: firstProfile.id,
    relatedProfileId: authorProfile.id,
    sourceId,
  });
  assert.ok(firstId);
  const readAt = Temporal.Instant.from('2026-10-02T04:05:06.123456Z');
  await db.update(Notifications).set({ readAt }).where(eq(Notifications.id, firstId));

  const [secondId] = await materializeNotification(db, {
    kind: NotificationKind.MENTION,
    recipientAccountIds: [accountId],
    recipientProfileId: secondProfile.id,
    relatedProfileId: authorProfile.id,
    sourceId,
  });
  assert.ok(secondId);
  assert.notEqual(secondId, firstId);

  const notifications = await db
    .select()
    .from(Notifications)
    .where(eq(Notifications.sourceId, sourceId));
  assert.equal(notifications.length, 2);
  assert.deepEqual(
    notifications.map(({ recipientProfileId }) => recipientProfileId).sort(),
    [firstProfile.id, secondProfile.id].sort(),
  );
  assert.ok(
    notifications.every(
      ({ recipientAccountId, kind }) =>
        recipientAccountId === accountId && kind === NotificationKind.MENTION,
    ),
  );
  assert.equal(
    notifications.find(({ id }) => id === firstId)?.readAt?.toString(),
    readAt.toString(),
  );
  assert.equal(notifications.find(({ id }) => id === secondId)?.readAt, null);
});
