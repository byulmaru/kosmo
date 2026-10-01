import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  ApplicationState,
  ApplicationType,
  InstanceKind,
  InstanceState,
  NotificationKind,
  OAuthTokenState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  PushInstallationPlatform,
  SessionState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { MockActivityEnvironment } from '@temporalio/testing';
import { eq, inArray } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type {
  createPost as CreatePost,
  deletePost as DeletePost,
  repostPost as RepostPost,
} from '@kosmo/core/services';
import type { temporalClient as TemporalClient } from '@kosmo/core/temporal/client';
import type {
  createNotificationActivity as CreateNotificationActivity,
  createQuoteNotificationActivity as CreateQuoteNotificationActivity,
  createReactionNotificationActivity as CreateReactionNotificationActivity,
  createReplyNotificationActivity as CreateReplyNotificationActivity,
  createRepostNotificationActivity as CreateRepostNotificationActivity,
  deleteAccountActivity as DeleteAccountActivity,
  deleteReactionNotificationActivity as DeleteReactionNotificationActivity,
  deleteRepostNotificationActivity as DeleteRepostNotificationActivity,
} from './activities';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ApplicationAuthorizations: typeof CoreDb.ApplicationAuthorizations;
let Applications: typeof CoreDb.Applications;
let Instances: typeof CoreDb.Instances;
let NotificationQuoteJudgments: typeof CoreDb.NotificationQuoteJudgments;
let NotificationRollouts: typeof CoreDb.NotificationRollouts;
let Notifications: typeof CoreDb.Notifications;
let OAuthAuthorizationCodes: typeof CoreDb.OAuthAuthorizationCodes;
let OAuthTokens: typeof CoreDb.OAuthTokens;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileMutes: typeof CoreDb.ProfileMutes;
let Profiles: typeof CoreDb.Profiles;
let PushInstallations: typeof CoreDb.PushInstallations;
let Reactions: typeof CoreDb.Reactions;
let Sessions: typeof CoreDb.Sessions;
let createCorePost: typeof CreatePost;
let deleteAccountActivity: typeof DeleteAccountActivity;
let deletePost: typeof DeletePost;
let createReactionNotificationActivity: typeof CreateReactionNotificationActivity;
let createQuoteNotificationActivity: typeof CreateQuoteNotificationActivity;
let deleteReactionNotificationActivity: typeof DeleteReactionNotificationActivity;
let createReplyNotificationActivity: typeof CreateReplyNotificationActivity;
let createRepostNotificationActivity: typeof CreateRepostNotificationActivity;
let deleteRepostNotificationActivity: typeof DeleteRepostNotificationActivity;
let repostPost: typeof RepostPost;
let createNotificationActivity: typeof CreateNotificationActivity;
let temporalClient: typeof TemporalClient;

before(async () => {
  ({
    AccountProfiles,
    Accounts,
    ApplicationAuthorizations,
    Applications,
    db,
    firstOrThrow,
    Instances,
    NotificationQuoteJudgments,
    NotificationRollouts,
    Notifications,
    OAuthAuthorizationCodes,
    OAuthTokens,
    pg,
    PostContents,
    Posts,
    ProfileBlocks,
    ProfileFollows,
    ProfileMutes,
    Profiles,
    PushInstallations,
    Reactions,
    Sessions,
  } = await import('@kosmo/core/db'));
  ({
    createNotificationActivity,
    createReactionNotificationActivity,
    createQuoteNotificationActivity,
    createReplyNotificationActivity,
    createRepostNotificationActivity,
    deleteAccountActivity,
    deleteReactionNotificationActivity,
    deleteRepostNotificationActivity,
  } = await import('./activities'));
  ({ temporalClient } = await import('@kosmo/core/temporal/client'));
  ({ createPost: createCorePost, deletePost, repostPost } = await import('@kosmo/core/services'));
  await db
    .insert(NotificationRollouts)
    .values({ key: 'QUOTE_NOTIFICATION', activatedAt: Temporal.Now.instant(), enabled: true })
    .onConflictDoNothing();
});

beforeEach(async () => {
  await db.delete(NotificationQuoteJudgments);
  await db.delete(Notifications);
  await db.delete(ProfileFollows);
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Profiles);
  await db.delete(Instances);
});

after(async () => pg.end());

test('Account deletion Activity는 non-DISABLED Profile이 있으면 아무것도 변경하지 않는다', async () => {
  const fixture = await createAccountDeletionFixture({
    profileStates: [ProfileState.ACTIVE, ProfileState.DISABLED],
  });

  try {
    assert.equal(await deleteAccountActivity({ accountId: fixture.account.id }), false);
    assert.equal(
      (
        await db
          .select({ state: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0]?.state,
      AccountState.ACTIVE,
    );
    assert.deepEqual(
      (
        await db
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.accountId, fixture.account.id))
          .orderBy(Sessions.token)
      ).map(({ state }) => state),
      [SessionState.ACTIVE, SessionState.ACTIVE, SessionState.REVOKED],
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
    await cleanupAccountDeletionFixture(fixture);
  }
});

test('Account deletion Activity는 연결된 Profile이 없어도 계정과 인증 데이터를 정리한다', async () => {
  const fixture = await createAccountDeletionFixture({ profileStates: [] });

  try {
    assert.equal(await deleteAccountActivity({ accountId: fixture.account.id }), true);
    assert.equal(
      (
        await db
          .select({ state: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0]?.state,
      AccountState.DISABLED,
    );
    assert.deepEqual(
      (
        await db
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.accountId, fixture.account.id))
          .orderBy(Sessions.token)
      ).map(({ state }) => state),
      [SessionState.REVOKED, SessionState.REVOKED, SessionState.REVOKED],
    );
    assert.ok(
      (
        await db
          .select({ revokedAt: ApplicationAuthorizations.revokedAt })
          .from(ApplicationAuthorizations)
          .where(eq(ApplicationAuthorizations.accountId, fixture.account.id))
      )[0]?.revokedAt,
    );
    assert.deepEqual(
      (
        await db
          .select({ revokedAt: OAuthTokens.revokedAt, state: OAuthTokens.state })
          .from(OAuthTokens)
          .where(eq(OAuthTokens.accountId, fixture.account.id))
          .orderBy(OAuthTokens.accessTokenHash)
      ).map(({ revokedAt, state }) => ({ revokedAt: Boolean(revokedAt), state })),
      [
        { revokedAt: true, state: OAuthTokenState.REVOKED },
        { revokedAt: true, state: OAuthTokenState.REVOKED },
      ],
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
    await cleanupAccountDeletionFixture(fixture);
  }
});

test('Account deletion Activity는 모든 Profile이 DISABLED면 계정과 인증 데이터를 정리한다', async () => {
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.DISABLED] });

  try {
    assert.equal(await deleteAccountActivity({ accountId: fixture.account.id }), true);
    assert.equal(
      (
        await db
          .select({ state: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0]?.state,
      AccountState.DISABLED,
    );
    assert.deepEqual(
      (
        await db
          .select({
            displayName: Accounts.displayName,
            featureFlags: Accounts.featureFlags,
            oidcSubject: Accounts.oidcSubject,
          })
          .from(Accounts)
          .where(eq(Accounts.id, fixture.account.id))
      )[0],
      {
        displayName: fixture.account.displayName,
        featureFlags: fixture.account.featureFlags,
        oidcSubject: fixture.account.oidcSubject,
      },
    );
    assert.deepEqual(
      await db
        .select({ profileId: AccountProfiles.profileId, role: AccountProfiles.role })
        .from(AccountProfiles)
        .where(eq(AccountProfiles.accountId, fixture.account.id))
        .orderBy(AccountProfiles.profileId),
      fixture.profiles.map(({ id }) => ({ profileId: id, role: AccountProfileRole.OWNER })),
    );
    assert.deepEqual(
      await db
        .select({ id: Profiles.id, state: Profiles.state })
        .from(Profiles)
        .where(
          inArray(
            Profiles.id,
            fixture.profiles.map(({ id }) => id),
          ),
        )
        .orderBy(Profiles.id),
      fixture.profiles
        .map(({ id, state }) => ({ id, state }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
    assert.deepEqual(
      (
        await db
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.accountId, fixture.account.id))
          .orderBy(Sessions.token)
      ).map(({ state }) => state),
      [SessionState.REVOKED, SessionState.REVOKED, SessionState.REVOKED],
    );
    assert.ok(
      (
        await db
          .select({ revokedAt: ApplicationAuthorizations.revokedAt })
          .from(ApplicationAuthorizations)
          .where(eq(ApplicationAuthorizations.accountId, fixture.account.id))
      )[0]?.revokedAt,
    );
    assert.deepEqual(
      (
        await db
          .select({ revokedAt: OAuthTokens.revokedAt, state: OAuthTokens.state })
          .from(OAuthTokens)
          .where(eq(OAuthTokens.accountId, fixture.account.id))
          .orderBy(OAuthTokens.accessTokenHash)
      ).map(({ revokedAt, state }) => ({ revokedAt: Boolean(revokedAt), state })),
      [
        { revokedAt: true, state: OAuthTokenState.REVOKED },
        { revokedAt: true, state: OAuthTokenState.REVOKED },
      ],
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
    assert.equal(await deleteAccountActivity({ accountId: fixture.account.id }), true);
  } finally {
    await cleanupAccountDeletionFixture(fixture);
  }
});

test('Account deletion Activity transaction은 정리 중 실패하면 모든 변경을 rollback한다', async () => {
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.DISABLED] });
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const functionName = `test_account_deletion_failure_${suffix}`;
  const triggerName = `test_account_deletion_failure_${suffix}`;
  let triggerCreated = false;

  try {
    await pg.unsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'account deletion rollback';
      END;
      $$
    `);
    await pg.unsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE UPDATE ON "session"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);
    triggerCreated = true;

    await assert.rejects(
      deleteAccountActivity({ accountId: fixture.account.id }),
      (error: unknown) => {
        let current: unknown = error;
        while (current instanceof Error) {
          if (current.message.includes('account deletion rollback')) {
            return true;
          }
          current = current.cause;
        }
        return false;
      },
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
    assert.equal(await db.$count(Sessions, eq(Sessions.accountId, fixture.account.id)), 3);
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
    if (triggerCreated) {
      await pg.unsafe(`DROP TRIGGER "${triggerName}" ON "session"`);
    }
    await pg.unsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    await cleanupAccountDeletionFixture(fixture);
  }
});

test('missing Post와 root Post는 Notification을 만들지 않는다', async () => {
  const author = await createProfile();
  const root = await createPost(author.id);

  await createReplyNotificationActivity(crypto.randomUUID());
  await createReplyNotificationActivity(root.id);

  assert.equal(await db.$count(Notifications), 0);
});

test('visible Reply는 정확한 recipient/source Notification을 한 번만 만든다', async () => {
  const recipient = await createProfile();
  const author = await createProfile();
  const parent = await createPost(recipient.id);
  const reply = await createPost(author.id, { replyParentId: parent.id });

  await createReplyNotificationActivity(reply.id);
  await createReplyNotificationActivity(reply.id);

  const notifications = await db.select().from(Notifications);
  assert.equal(notifications.length, 1);
  assert.deepEqual(
    notifications.map(({ data, kind, recipientProfileId, sourceId }) => ({
      data,
      kind,
      recipientProfileId,
      sourceId,
    })),
    [
      {
        data: {},
        kind: NotificationKind.REPLY,
        recipientProfileId: recipient.id,
        sourceId: reply.id,
      },
    ],
  );
});

test('Followers Reply는 recipient가 author를 follow할 때만 Notification을 만든다', async () => {
  const recipient = await createProfile();
  const author = await createProfile();
  const parent = await createPost(recipient.id);
  const reply = await createPost(author.id, {
    replyParentId: parent.id,
    visibility: PostVisibility.FOLLOWERS,
  });

  await createReplyNotificationActivity(reply.id);
  assert.equal(await db.$count(Notifications), 0);

  await db.insert(ProfileFollows).values({
    followeeProfileId: author.id,
    followerProfileId: recipient.id,
  });
  await createReplyNotificationActivity(reply.id);

  assert.equal(await db.$count(Notifications), 1);
});

test('자기 Reply는 Notification을 만들지 않는다', async () => {
  const author = await createProfile();
  const parent = await createPost(author.id);
  const reply = await createPost(author.id, { replyParentId: parent.id });

  await createReplyNotificationActivity(reply.id);

  assert.equal(await db.$count(Notifications), 0);
});

test('Reply 알림은 Recipient Mute와 양방향 Block이 있으면 생성하지 않는다', async () => {
  const recipient = await createProfile();
  const author = await createProfile();
  const parent = await createPost(recipient.id);
  const reply = await createPost(author.id, { replyParentId: parent.id });

  await db.insert(ProfileMutes).values({
    ownerProfileId: recipient.id,
    targetProfileId: author.id,
    expiresAt: null,
  });
  await createReplyNotificationActivity(reply.id);
  assert.equal(await db.$count(Notifications), 0);

  await db.delete(ProfileMutes).where(eq(ProfileMutes.ownerProfileId, recipient.id));
  await db.insert(ProfileBlocks).values({
    ownerProfileId: author.id,
    targetProfileId: recipient.id,
  });
  await createReplyNotificationActivity(reply.id);
  assert.equal(await db.$count(Notifications), 0);

  await db.delete(ProfileBlocks).where(eq(ProfileBlocks.ownerProfileId, author.id));
  await createReplyNotificationActivity(reply.id);
  assert.equal(await db.$count(Notifications), 1);
});

test('Quote Notification Activity는 source author에게 한 건만 생성한다', async () => {
  const recipient = await createProfile();
  const author = await createProfile();
  const { post: source } = await createCorePost({
    document: postContentDocumentFromText('Quote source'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: quote } = await createCorePost({
    document: postContentDocumentFromText('Quote body'),
    origin: 'LOCAL',
    profileId: author.id,
    repostSourceId: source.id,
    visibility: PostVisibility.PUBLIC,
  });

  await createQuoteNotificationActivity(quote.id);
  await createQuoteNotificationActivity(quote.id);

  const notifications = await db.select().from(Notifications);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.QUOTE);
  assert.equal(notifications[0]?.recipientProfileId, recipient.id);
  assert.equal(notifications[0]?.sourceId, quote.id);
});

test('Quote와 Reply 판단이 경합해도 Reply가 대표가 된다', async () => {
  const recipient = await createProfile();
  const author = await createProfile();
  const { post: source } = await createCorePost({
    document: postContentDocumentFromText('Combined source'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: quote } = await createCorePost({
    document: postContentDocumentFromText('Combined quote'),
    origin: 'LOCAL',
    profileId: author.id,
    repostSourceId: source.id,
    visibility: PostVisibility.PUBLIC,
  });
  await db.update(Posts).set({ replyParentId: source.id }).where(eq(Posts.id, quote.id));

  const notificationIds = await Promise.all([
    createQuoteNotificationActivity(quote.id),
    createReplyNotificationActivity(quote.id),
  ]);

  const notifications = await db.select().from(Notifications);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.REPLY);
  assert.equal(notifications[0]?.sourceId, quote.id);
  assert.deepEqual(notificationIds, [null, notifications[0]?.id]);
});

test('Quote와 Reply의 recipient가 다르면 각 알림을 독립적으로 만든다', async () => {
  const quoteRecipient = await createProfile();
  const replyRecipient = await createProfile();
  const author = await createProfile();
  const { post: quoteSource } = await createCorePost({
    document: postContentDocumentFromText('Quote source'),
    origin: 'LOCAL',
    profileId: quoteRecipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const replyParent = await createPost(replyRecipient.id);
  const { post: quote } = await createCorePost({
    document: postContentDocumentFromText('Quote and reply'),
    origin: 'LOCAL',
    profileId: author.id,
    repostSourceId: quoteSource.id,
    visibility: PostVisibility.PUBLIC,
  });
  await db.update(Posts).set({ replyParentId: replyParent.id }).where(eq(Posts.id, quote.id));

  const notificationIds = await Promise.all([
    createQuoteNotificationActivity(quote.id),
    createReplyNotificationActivity(quote.id),
  ]);

  const notifications = await db.select().from(Notifications);
  assert.deepEqual(
    new Set(notifications.map(({ kind, recipientProfileId }) => `${kind}:${recipientProfileId}`)),
    new Set([
      `${NotificationKind.QUOTE}:${quoteRecipient.id}`,
      `${NotificationKind.REPLY}:${replyRecipient.id}`,
    ]),
  );
  assert.deepEqual(new Set(notificationIds), new Set(notifications.map(({ id }) => id)));
});

test('공통 Notification Activity는 저장된 ID로 Push Workflow를 시작하고 전달 완료는 기다리지 않는다', async (t) => {
  const recipient = await createProfile();
  const author = await createProfile();
  const parent = await createPost(recipient.id);
  const reply = await createPost(author.id, { replyParentId: parent.id });
  let releaseStart!: (handle: unknown) => void;
  const startAcknowledgement = new Promise<unknown>((resolve) => {
    releaseStart = resolve;
  });
  let signalStartEntered!: () => void;
  const startEntered = new Promise<void>((resolve) => {
    signalStartEntered = resolve;
  });
  let workflowResultCalled = false;
  const start = t.mock.method(temporalClient.workflow, 'start', async () => {
    assert.equal(await db.$count(Notifications), 1);
    signalStartEntered();
    return (await startAcknowledgement) as never;
  });
  const execute = t.mock.method(temporalClient.workflow, 'execute', async () => {
    throw new Error('Push delivery must remain detached');
  });

  const activityRun = new MockActivityEnvironment().run(createNotificationActivity, {
    kind: NotificationKind.REPLY,
    sourceId: reply.id,
  });
  let activitySettled = false;
  void activityRun.then(
    () => {
      activitySettled = true;
    },
    () => {
      activitySettled = true;
    },
  );
  await startEntered;
  assert.equal(activitySettled, false);

  const handle = {
    workflowId: 'push-notification:test',
    firstExecutionRunId: 'test-run',
    result: async () => {
      workflowResultCalled = true;
    },
  };
  releaseStart(handle);
  await activityRun;

  assert.equal(start.mock.calls.length, 1);
  assert.equal(execute.mock.calls.length, 0);
  assert.equal(workflowResultCalled, false);
  const notification = (await db.select().from(Notifications))[0];
  assert.ok(notification);
  const startCall = start.mock.calls[0];
  assert.ok(startCall);
  assert.equal(startCall.arguments[0], 'pushNotificationDeliveryWorkflow');
  const startOptions = startCall.arguments[1];
  assert.ok(startOptions);
  assert.deepEqual(startOptions.args, [{ notificationId: notification.id }]);
  assert.equal(startOptions.workflowId, `push-notification:${notification.id}`);
  assert.equal(startOptions.taskQueue, KOSMO_TASK_QUEUE);
  assert.equal(startOptions.workflowIdConflictPolicy, WorkflowIdConflictPolicy.USE_EXISTING);
  assert.equal(startOptions.workflowIdReusePolicy, WorkflowIdReusePolicy.REJECT_DUPLICATE);
});

test('공통 Notification Activity는 Notification이 materialize되지 않으면 Push를 시작하지 않는다', async (t) => {
  const start = t.mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  await new MockActivityEnvironment().run(createNotificationActivity, {
    kind: NotificationKind.REPLY,
    sourceId: crypto.randomUUID(),
  });

  assert.equal(await db.$count(Notifications), 0);
  assert.equal(start.mock.calls.length, 0);
});

test('공통 Notification Activity는 Core materialization 실패를 전파하고 Push를 시작하지 않는다', async (t) => {
  const recipient = await createProfile();
  const author = await createProfile();
  const parent = await createPost(recipient.id);
  const reply = await createPost(author.id, { replyParentId: parent.id });
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const functionName = `test_notification_materialization_failure_${suffix}`;
  const triggerName = `test_notification_materialization_failure_${suffix}`;
  let triggerCreated = false;
  const start = t.mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  try {
    await pg.unsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'notification materialization failed';
      END;
      $$
    `);
    await pg.unsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "notification"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);
    triggerCreated = true;

    await assert.rejects(
      new MockActivityEnvironment().run(createNotificationActivity, {
        kind: NotificationKind.REPLY,
        sourceId: reply.id,
      }),
    );
    assert.equal(await db.$count(Notifications), 0);
    assert.equal(start.mock.calls.length, 0);
  } finally {
    if (triggerCreated) {
      await pg.unsafe(`DROP TRIGGER "${triggerName}" ON "notification"`);
    }
    await pg.unsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
  }
});

test('공통 Notification Activity는 Push start 실패 뒤 저장된 알림을 보존하고 이미 시작된 Workflow를 허용한다', async (t) => {
  const recipient = await createProfile();
  const author = await createProfile();
  const parent = await createPost(recipient.id);
  const reply = await createPost(author.id, { replyParentId: parent.id });
  const startErrors = [new Error('temporary Temporal failure'), new Error('already started')];
  const duplicateStart = startErrors[1];
  assert.ok(duplicateStart);
  duplicateStart.name = 'WorkflowExecutionAlreadyStartedError';
  const start = t.mock.method(temporalClient.workflow, 'start', async () => {
    const error = startErrors.shift();
    assert.ok(error);
    throw error;
  });
  const input = { kind: NotificationKind.REPLY, sourceId: reply.id } as const;

  await new MockActivityEnvironment().run(createNotificationActivity, input);
  await new MockActivityEnvironment().run(createNotificationActivity, input);

  const notifications = await db.select().from(Notifications);
  assert.equal(notifications.length, 1);
  assert.equal(start.mock.calls.length, 2);
  const workflowIds = start.mock.calls.map((call) => call.arguments[1]?.workflowId);
  assert.deepEqual(workflowIds, [
    `push-notification:${notifications[0]?.id}`,
    `push-notification:${notifications[0]?.id}`,
  ]);
});

test('Reaction Notification Activities는 create와 delete retry에 멱등이다', async () => {
  const recipient = await createProfile();
  const actor = await createProfile();
  const post = await createPost(recipient.id);
  const reaction = await db
    .insert(Reactions)
    .values({ postId: post.id, profileId: actor.id, type: '❤️' })
    .returning()
    .then(firstOrThrow);

  await createReactionNotificationActivity(reaction.id);
  await createReactionNotificationActivity(reaction.id);

  const notifications = await db.select().from(Notifications);
  assert.deepEqual(
    notifications.map(({ kind, recipientProfileId, sourceId }) => ({
      kind,
      recipientProfileId,
      sourceId,
    })),
    [
      {
        kind: NotificationKind.REACTION,
        recipientProfileId: recipient.id,
        sourceId: reaction.id,
      },
    ],
  );

  await deleteReactionNotificationActivity(reaction.id);
  await deleteReactionNotificationActivity(reaction.id);
  assert.equal(await db.$count(Notifications), 0);
});

test('Repost Notification Activities는 create와 delete retry에 멱등이다', async () => {
  const recipient = await createProfile();
  const actor = await createProfile();
  const { post: source } = await createCorePost({
    document: postContentDocumentFromText('Repost source'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { repost } = await repostPost({
    actorProfileId: actor.id,
    origin: 'LOCAL',
    sourcePostId: source.id,
  });

  await createRepostNotificationActivity(repost.id);
  await createRepostNotificationActivity(repost.id);

  const notifications = await db.select().from(Notifications);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.REPOST);
  assert.equal(notifications[0]?.recipientProfileId, recipient.id);
  assert.equal(notifications[0]?.sourceId, repost.id);

  await deleteRepostNotificationActivity(repost.id);
  await deleteRepostNotificationActivity(repost.id);
  assert.equal(await db.$count(Notifications), 0);
});

test('Create Activity 전에 Repost가 Tombstone이면 성공한 no-op이다', async () => {
  const recipient = await createProfile();
  const actor = await createProfile();
  const { post: source } = await createCorePost({
    document: postContentDocumentFromText('Deleted Repost source'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { repost } = await repostPost({
    actorProfileId: actor.id,
    origin: 'LOCAL',
    sourcePostId: source.id,
  });
  await deletePost({
    actorProfileId: actor.id,
    origin: 'LOCAL',
    postId: repost.id,
  });

  await assert.doesNotReject(createRepostNotificationActivity(repost.id));
  assert.equal(await db.$count(Notifications), 0);
});

const createProfile = async ({
  instanceKind = InstanceKind.LOCAL,
  state = ProfileState.ACTIVE,
}: { instanceKind?: InstanceKind; state?: ProfileState } = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  return db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state,
    })
    .returning()
    .then(firstOrThrow);
};

const createAccountDeletionFixture = async ({
  profileStates,
}: {
  readonly profileStates: ReadonlyArray<ProfileState>;
}) => {
  const suffix = crypto.randomUUID();
  const profiles = await Promise.all(profileStates.map((state) => createProfile({ state })));
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
  if (profiles.length > 0) {
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
  await db.insert(OAuthTokens).values([
    {
      accessTokenHash: `access-${suffix}`,
      accountId: account.id,
      applicationId: application.id,
      expiresAt: now.add({ hours: 1 }),
      issuedAt: now,
      lastUsedAt: now,
      profileId: profiles[0]?.id,
      scopes: ['read'],
      state: OAuthTokenState.ACTIVE,
    },
    {
      accessTokenHash: `expired-${suffix}`,
      accountId: account.id,
      applicationId: application.id,
      expiresAt: now.subtract({ hours: 1 }),
      issuedAt: now.subtract({ hours: 2 }),
      lastUsedAt: now.subtract({ hours: 1 }),
      profileId: profiles[0]?.id,
      scopes: ['read'],
      state: OAuthTokenState.EXPIRED,
    },
  ]);
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

  return { account, application, profiles };
};

const cleanupAccountDeletionFixture = async (
  fixture: Awaited<ReturnType<typeof createAccountDeletionFixture>>,
) => {
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
  if (fixture.profiles.length > 0) {
    await db.delete(Profiles).where(
      inArray(
        Profiles.id,
        fixture.profiles.map(({ id }) => id),
      ),
    );
    await db.delete(Instances).where(
      inArray(
        Instances.id,
        fixture.profiles.map(({ instanceId }) => instanceId),
      ),
    );
  }
};

const createPost = (
  profileId: string,
  {
    replyParentId,
    repostSourceId,
    visibility = PostVisibility.PUBLIC,
  }: { replyParentId?: string; repostSourceId?: string; visibility?: PostVisibility } = {},
) =>
  db
    .insert(Posts)
    .values({
      profileId,
      replyParentId,
      repostSourceId,
      state: PostState.ACTIVE,
      visibility,
    })
    .returning()
    .then(firstOrThrow);

test('Push Notification Activity는 앱 payload의 plain-text preview, 경로, CW와 민감 미디어 마스킹을 유지한다', async (t) => {
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = 'kosmo-push-test';
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.ACTIVE] });
  let postId: string | null = null;

  try {
    const recipient = fixture.profiles[0]!;
    const actor = await createProfile();
    const document = {
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Read the ' },
              {
                type: 'text',
                text: 'article',
                marks: [{ type: 'link', attrs: { href: 'https://example.com/article' } }],
              },
            ],
          },
        ],
      },
    } as const;
    const { post } = await createCorePost({
      document,
      origin: 'LOCAL',
      profileId: recipient.id,
      visibility: PostVisibility.PUBLIC,
    });
    postId = post.id;
    const reaction = await db
      .insert(Reactions)
      .values({ postId: post.id, profileId: actor.id, type: '❤️' })
      .returning()
      .then(firstOrThrow);
    const notificationId = await createReactionNotificationActivity(reaction.id);
    assert.ok(notificationId);

    const installationRows = await db
      .select({ id: PushInstallations.id, token: PushInstallations.token })
      .from(PushInstallations)
      .where(eq(PushInstallations.accountId, fixture.account.id));
    const { listPushNotificationInstallationsActivity, sendPushNotificationActivity } =
      await import('./activities');

    const installationIds = await listPushNotificationInstallationsActivity(notificationId);
    assert.deepEqual([...installationIds].sort(), installationRows.map(({ id }) => id).sort());
    assert.equal(
      installationIds.some((id) => installationRows.some(({ token }) => token === id)),
      false,
    );

    const { applicationDefault, getApps, initializeApp } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app =
      getApps().find(({ name }) => name === '[DEFAULT]') ??
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    const messaging = getMessaging(app);
    type FcmMessage = Parameters<typeof messaging.send>[0];
    const sent: FcmMessage[] = [];
    t.mock.method(messaging, 'send', async (message: FcmMessage) => {
      sent.push(message);
      return 'projects/kosmo-push-test/messages/push-test';
    });

    await sendPushNotificationActivity(notificationId, installationIds[0]!);
    const payload = sent[0];
    assert.ok(payload);
    const { encodeGlobalId } = await import('@kosmo/core/global-id');
    assert.deepEqual(payload.notification, {
      title: actor.displayName,
      body: '이 게시글에 반응했습니다: Read the article',
    });
    assert.deepEqual(payload.data, {
      notificationId: encodeGlobalId('ReactionNotification', notificationId),
      recipientProfileId: encodeGlobalId('Profile', recipient.id),
      href: `/@${recipient.handle}/${encodeGlobalId('Post', post.id)}`,
    });
    assert.ok((payload.android?.ttl ?? 0) > 0);
    assert.ok((payload.android?.ttl ?? Number.POSITIVE_INFINITY) <= 24 * 60 * 60 * 1000);

    const contentId = post.currentContentId;
    assert.ok(contentId);
    const warningDocument = { ...document, summary: 'Private warning text' };
    await db
      .update(PostContents)
      .set({ document: warningDocument })
      .where(eq(PostContents.id, contentId));
    await sendPushNotificationActivity(notificationId, installationIds[0]!);
    assert.equal(sent[1]?.notification?.body, '이 게시글에 반응했습니다');
    assert.equal(sent[1]?.notification?.body.includes('Private warning text'), false);

    const sensitiveDocument = {
      ...document,
      body: { ...document.body, attrs: { sensitiveMedia: true } },
    };
    await db
      .update(PostContents)
      .set({ document: sensitiveDocument })
      .where(eq(PostContents.id, contentId));
    await sendPushNotificationActivity(notificationId, installationIds[0]!);
    assert.equal(sent[2]?.notification?.body, '이 게시글에 반응했습니다');
    assert.equal(sent[2]?.notification?.body.includes('Read the article'), false);
  } finally {
    if (postId) {
      await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
      await db.delete(PostContents).where(eq(PostContents.postId, postId));
      await db.delete(Posts).where(eq(Posts.id, postId));
    }
    await cleanupAccountDeletionFixture(fixture);
    if (previousProjectId === undefined) {
      delete process.env.FIREBASE_PROJECT_ID;
    } else {
      process.env.FIREBASE_PROJECT_ID = previousProjectId;
    }
  }
});

test('Mention Push Notification은 원인 Post의 Mention 타입·경로·안전한 preview를 사용한다', async (t) => {
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = 'kosmo-push-test';
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.ACTIVE] });
  let postId: string | null = null;

  try {
    const recipient = fixture.profiles[0]!;
    const author = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
    const publishedAt = Temporal.Now.instant();
    const createdPost = await createCorePost({
      document: postContentDocumentFromText('Mention source preview'),
      mentionProfileIds: [recipient.id],
      objectUri: `https://${author.handle}.example/posts/${crypto.randomUUID()}`,
      origin: 'ACTIVITYPUB',
      profileId: author.id,
      publishedAt,
      receivedAt: publishedAt,
      visibility: PostVisibility.PUBLIC,
    });
    if (!createdPost.created) {
      throw new Error('Expected a new ActivityPub Mention source post');
    }
    const { post } = createdPost;
    postId = post.id;
    const {
      createMentionNotificationActivity,
      listPushNotificationInstallationsActivity,
      sendPushNotificationActivity,
    } = await import('./activities');
    const [notificationId] = await createMentionNotificationActivity(post.id);
    assert.ok(notificationId);

    const installationIds = await listPushNotificationInstallationsActivity(notificationId);
    assert.ok(installationIds[0]);
    const { applicationDefault, getApps, initializeApp } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app =
      getApps().find(({ name }) => name === '[DEFAULT]') ??
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    const messaging = getMessaging(app);
    type FcmMessage = Parameters<typeof messaging.send>[0];
    const sent: FcmMessage[] = [];
    t.mock.method(messaging, 'send', async (message: FcmMessage) => {
      sent.push(message);
      return 'projects/kosmo-push-test/messages/mention-test';
    });

    await sendPushNotificationActivity(notificationId, installationIds[0]);
    const payload = sent[0];
    assert.ok(payload);
    const { encodeGlobalId } = await import('@kosmo/core/global-id');
    assert.deepEqual(payload.notification, {
      title: author.displayName,
      body: '회원님을 언급했습니다: Mention source preview',
    });
    assert.deepEqual(payload.data, {
      notificationId: encodeGlobalId('MentionNotification', notificationId),
      recipientProfileId: encodeGlobalId('Profile', recipient.id),
      href: `/@${author.handle}@${author.handle}.example/${encodeGlobalId('Post', post.id)}`,
    });
  } finally {
    if (postId) {
      await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
      await db.delete(PostContents).where(eq(PostContents.postId, postId));
      await db.delete(Posts).where(eq(Posts.id, postId));
    }
    await cleanupAccountDeletionFixture(fixture);
    if (previousProjectId === undefined) {
      delete process.env.FIREBASE_PROJECT_ID;
    } else {
      process.env.FIREBASE_PROJECT_ID = previousProjectId;
    }
  }
});

test('Push Notification Activity는 등록되지 않은 token만 정확히 제거한다', async (t) => {
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = 'kosmo-push-test';
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.ACTIVE] });
  let postId: string | null = null;

  try {
    const recipient = fixture.profiles[0]!;
    const actor = await createProfile();
    const { post } = await createCorePost({
      document: postContentDocumentFromText('Token cleanup'),
      origin: 'LOCAL',
      profileId: recipient.id,
      visibility: PostVisibility.PUBLIC,
    });
    postId = post.id;
    const reaction = await db
      .insert(Reactions)
      .values({ postId: post.id, profileId: actor.id, type: '❤️' })
      .returning()
      .then(firstOrThrow);
    const notificationId = await createReactionNotificationActivity(reaction.id);
    assert.ok(notificationId);

    const { applicationDefault, FirebaseError, getApps, initializeApp } =
      await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app =
      getApps().find(({ name }) => name === '[DEFAULT]') ??
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    const messaging = getMessaging(app);
    t.mock.method(messaging, 'send', async () => {
      throw new FirebaseError({
        code: 'messaging/registration-token-not-registered',
        message: 'Registration token is no longer registered',
      });
    });

    const { listPushNotificationInstallationsActivity, sendPushNotificationActivity } =
      await import('./activities');
    const installationIds = await listPushNotificationInstallationsActivity(notificationId);
    const invalidInstallationId = installationIds[0]!;
    await sendPushNotificationActivity(notificationId, invalidInstallationId);
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.id, invalidInstallationId)),
      0,
    );
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.accountId, fixture.account.id)),
      1,
    );
  } finally {
    if (postId) {
      await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
      await db.delete(PostContents).where(eq(PostContents.postId, postId));
      await db.delete(Posts).where(eq(Posts.id, postId));
    }
    await cleanupAccountDeletionFixture(fixture);
    if (previousProjectId === undefined) {
      delete process.env.FIREBASE_PROJECT_ID;
    } else {
      process.env.FIREBASE_PROJECT_ID = previousProjectId;
    }
  }
});
