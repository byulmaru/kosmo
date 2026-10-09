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
  MediaSource,
  MediaState,
  NotificationKind,
  OAuthTokenState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileMediaKind,
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
let Media: typeof CoreDb.Media;
let NotificationQuoteJudgments: typeof CoreDb.NotificationQuoteJudgments;
let Notifications: typeof CoreDb.Notifications;
let OAuthAuthorizationCodes: typeof CoreDb.OAuthAuthorizationCodes;
let OAuthTokens: typeof CoreDb.OAuthTokens;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileMutes: typeof CoreDb.ProfileMutes;
let ProfileMedia: typeof CoreDb.ProfileMedia;
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
    Media,
    NotificationQuoteJudgments,
    Notifications,
    OAuthAuthorizationCodes,
    OAuthTokens,
    pg,
    PostContents,
    Posts,
    ProfileBlocks,
    ProfileFollows,
    ProfileFollowRequests,
    ProfileMutes,
    ProfileMedia,
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
  let actorId: string | null = null;
  let avatarId: string | null = null;

  try {
    const recipient = fixture.profiles[0]!;
    const actor = await createProfile();
    actorId = actor.id;
    await db
      .update(Profiles)
      .set({ displayName: '예은', handle: 'yeeun', normalizedHandle: 'yeeun' })
      .where(eq(Profiles.id, recipient.id));
    await db
      .update(Profiles)
      .set({ displayName: '혜주', handle: 'hyeju', normalizedHandle: 'hyeju' })
      .where(eq(Profiles.id, actor.id));
    const avatar = await db
      .insert(Media)
      .values({
        mediaType: 'image/webp',
        profileId: actor.id,
        source: MediaSource.REMOTE,
        state: MediaState.READY,
        url: 'https://media.example/avatar.webp',
      })
      .returning()
      .then(firstOrThrow);
    avatarId = avatar.id;
    await db.insert(ProfileMedia).values({
      kind: ProfileMediaKind.AVATAR,
      mediaId: avatar.id,
      profileId: actor.id,
    });
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
      .values({ postId: post.id, profileId: actor.id, type: '😂' })
      .returning()
      .then(firstOrThrow);
    const notificationId = await createReactionNotificationActivity(reaction.id);
    assert.ok(notificationId);

    const installationRows = await db
      .select({
        id: PushInstallations.id,
        platform: PushInstallations.platform,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.accountId, fixture.account.id));
    const nativeAndroid = installationRows.find(
      ({ platform }) => platform === PushInstallationPlatform.ANDROID,
    );
    const ios = installationRows.find(({ platform }) => platform === PushInstallationPlatform.IOS);
    assert.ok(nativeAndroid);
    assert.ok(ios);
    await db
      .update(PushInstallations)
      .set({ presentationVersion: 1 })
      .where(eq(PushInstallations.id, nativeAndroid.id));
    const notificationCreatedAt = await db
      .select({ createdAt: Notifications.createdAt })
      .from(Notifications)
      .where(eq(Notifications.id, notificationId))
      .then(firstOrThrow)
      .then(({ createdAt }) => createdAt);
    const legacySession = await db
      .select({ id: Sessions.id })
      .from(Sessions)
      .where(eq(Sessions.accountId, fixture.account.id))
      .limit(1)
      .then(firstOrThrow);
    const legacyAndroid = await db
      .insert(PushInstallations)
      .values({
        accountId: fixture.account.id,
        platform: PushInstallationPlatform.ANDROID,
        presentationVersion: 0,
        registrationEpoch: notificationCreatedAt,
        sessionId: legacySession.id,
        token: `legacy-${crypto.randomUUID()}`,
      })
      .returning({ id: PushInstallations.id })
      .then(firstOrThrow);
    const { listPushNotificationInstallationsActivity, sendPushNotificationActivity } =
      await import('./activities');

    const installationIds = await listPushNotificationInstallationsActivity(notificationId);
    assert.deepEqual(
      [...installationIds].sort(),
      [...installationRows.map(({ id }) => id), legacyAndroid.id].sort(),
    );
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

    await sendPushNotificationActivity(notificationId, nativeAndroid.id);
    await sendPushNotificationActivity(notificationId, legacyAndroid.id);
    await sendPushNotificationActivity(notificationId, ios.id);
    const nativePayload = sent[0];
    assert.ok(nativePayload);
    assert.equal(nativePayload.notification, undefined);
    assert.equal(nativePayload.android?.priority, 'high');
    assert.equal(nativePayload.apns?.payload?.aps?.category, undefined);
    assert.equal(nativePayload.data?.title, '혜주');
    assert.equal(nativePayload.data?.message, '혜주 님이 예은(@yeeun) 님에게 😂를 남겼습니다.');
    const payload = sent[1];
    assert.ok(payload);
    const { encodeGlobalId } = await import('@kosmo/core/global-id');
    assert.deepEqual(payload.notification, {
      title: '혜주',
      body: '혜주 님이 예은(@yeeun) 님에게 😂를 남겼습니다.',
    });
    assert.equal(payload.apns?.payload?.aps?.category, undefined);
    assert.equal(payload.android?.priority, undefined);
    assert.deepEqual(sent[2]?.notification, payload.notification);
    assert.equal(sent[2]?.apns?.payload?.aps?.category, 'KOSMO_PUSH_PRESENTATION_V1');
    assert.deepEqual(payload.data, {
      actorAvatarUrl: 'https://media.example/avatar.webp',
      actorHandle: '@hyeju',
      actorName: '혜주',
      href: `/@yeeun/${encodeGlobalId('Post', post.id)}`,
      kind: NotificationKind.REACTION,
      notificationId: encodeGlobalId('ReactionNotification', notificationId),
      postText: 'Read the article',
      presentationVersion: '1',
      reaction: '😂',
      recipientHandle: '@yeeun',
      recipientName: '예은',
      recipientProfileId: encodeGlobalId('Profile', recipient.id),
    });
    assert.ok((payload.android?.ttl ?? 0) > 0);
    assert.ok((payload.android?.ttl ?? Number.POSITIVE_INFINITY) <= 24 * 60 * 60 * 1000);

    const contentId = post.currentContentId;
    assert.ok(contentId);
    const emojiText = '😀'.repeat(160);
    const emojiDocument = {
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: emojiText }],
          },
        ],
      },
    } as const;
    await db
      .update(PostContents)
      .set({ document: emojiDocument })
      .where(eq(PostContents.id, contentId));
    await db
      .update(Media)
      .set({ url: `https://media.example/${'x'.repeat(4000)}` })
      .where(eq(Media.id, avatarId));
    await sendPushNotificationActivity(notificationId, nativeAndroid.id);
    const oversizedAvatarPayload = sent[3];
    assert.ok(oversizedAvatarPayload);
    assert.equal(oversizedAvatarPayload.data?.actorAvatarUrl, undefined);
    assert.equal(oversizedAvatarPayload.data?.href, `/@yeeun/${encodeGlobalId('Post', post.id)}`);
    assert.equal(oversizedAvatarPayload.data?.postText, emojiText);
    assert.equal(oversizedAvatarPayload.notification, undefined);
    const serializedWithoutToken = {
      android: oversizedAvatarPayload.android,
      apns: oversizedAvatarPayload.apns,
      data: oversizedAvatarPayload.data,
      notification: oversizedAvatarPayload.notification,
    };
    assert.ok(new TextEncoder().encode(JSON.stringify(serializedWithoutToken)).byteLength < 4096);

    const warningDocument = { ...document, summary: 'Private warning text' };
    await db
      .update(PostContents)
      .set({ document: warningDocument })
      .where(eq(PostContents.id, contentId));
    await sendPushNotificationActivity(notificationId, nativeAndroid.id);
    assert.equal(sent[4]?.notification, undefined);
    assert.equal(sent[4]?.data?.postText, undefined);
    assert.equal(sent[4]?.data?.message, '혜주 님이 예은(@yeeun) 님에게 😂를 남겼습니다.');
    assert.equal(sent[4]?.data?.message?.includes('Private warning text'), false);

    const sensitiveDocument = {
      ...document,
      body: { ...document.body, attrs: { sensitiveMedia: true } },
    };
    await db
      .update(PostContents)
      .set({ document: sensitiveDocument })
      .where(eq(PostContents.id, contentId));
    await sendPushNotificationActivity(notificationId, nativeAndroid.id);
    assert.equal(sent[5]?.notification, undefined);
    assert.equal(sent[5]?.data?.postText, undefined);
    assert.equal(sent[5]?.data?.message, '혜주 님이 예은(@yeeun) 님에게 😂를 남겼습니다.');
    assert.equal(sent[5]?.data?.message?.includes('Read the article'), false);
  } finally {
    if (postId) {
      await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
      await db.delete(PostContents).where(eq(PostContents.postId, postId));
      await db.delete(Posts).where(eq(Posts.id, postId));
    }
    if (actorId) {
      await db.delete(ProfileMedia).where(eq(ProfileMedia.profileId, actorId));
    }
    if (avatarId) {
      await db.delete(Media).where(eq(Media.id, avatarId));
    }
    await cleanupAccountDeletionFixture(fixture);
    if (previousProjectId === undefined) {
      delete process.env.FIREBASE_PROJECT_ID;
    } else {
      process.env.FIREBASE_PROJECT_ID = previousProjectId;
    }
  }
});

test('Push Notification Activity는 모든 Notification 종류의 접힌 행동 요약과 recipient를 표시한다', async (t) => {
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = 'kosmo-push-test';
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.ACTIVE] });
  const postIds: string[] = [];

  try {
    const recipient = fixture.profiles[0]!;
    const actor = await createProfile();
    await db
      .update(Profiles)
      .set({ displayName: '수신자', handle: 'recipient', normalizedHandle: 'recipient' })
      .where(eq(Profiles.id, recipient.id));
    await db
      .update(Profiles)
      .set({ displayName: '행위자', handle: 'actor', normalizedHandle: 'actor' })
      .where(eq(Profiles.id, actor.id));

    const { post: target } = await createCorePost({
      document: postContentDocumentFromText('target'),
      origin: 'LOCAL',
      profileId: recipient.id,
      visibility: PostVisibility.PUBLIC,
    });
    postIds.push(target.id);
    const { post: reply } = await createCorePost({
      document: postContentDocumentFromText('reply'),
      origin: 'LOCAL',
      profileId: actor.id,
      replyParentId: target.id,
      visibility: PostVisibility.PUBLIC,
    });
    postIds.push(reply.id);
    const { post: quote } = await createCorePost({
      document: postContentDocumentFromText('quote'),
      origin: 'LOCAL',
      profileId: actor.id,
      repostSourceId: target.id,
      visibility: PostVisibility.PUBLIC,
    });
    postIds.push(quote.id);
    const { repost } = await repostPost({
      actorProfileId: actor.id,
      origin: 'LOCAL',
      sourcePostId: target.id,
    });
    postIds.push(repost.id);
    const { post: mention } = await createCorePost({
      document: {
        body: {
          content: [
            {
              content: [
                { text: 'mention ', type: 'text' },
                { attrs: { profileId: recipient.id }, type: 'mention' },
              ],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
        summary: null,
        version: 1,
      },
      authoredBodyText: 'mention @recipient',
      origin: 'LOCAL',
      profileId: actor.id,
      visibility: PostVisibility.PUBLIC,
    });
    postIds.push(mention.id);
    const { listPushNotificationInstallationsActivity, sendPushNotificationActivity } =
      await import('./activities');

    const follow = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: actor.id, followeeProfileId: recipient.id })
      .returning()
      .then(firstOrThrow);
    const followRequest = await db
      .insert(ProfileFollowRequests)
      .values({ followerProfileId: actor.id, followeeProfileId: recipient.id })
      .returning()
      .then(firstOrThrow);
    const reaction = await db
      .insert(Reactions)
      .values({ postId: target.id, profileId: actor.id, type: '😂' })
      .returning()
      .then(firstOrThrow);
    const notificationSources = [
      [NotificationKind.FOLLOW, follow.id],
      [NotificationKind.FOLLOW_REQUEST, followRequest.id],
      [NotificationKind.REACTION, reaction.id],
      [NotificationKind.REPOST, repost.id],
      [NotificationKind.REPLY, reply.id],
      [NotificationKind.QUOTE, quote.id],
      [NotificationKind.MENTION, mention.id],
    ] as const;
    const notifications = await Promise.all(
      notificationSources.map(([kind, sourceId]) =>
        db
          .insert(Notifications)
          .values({ kind, recipientProfileId: recipient.id, sourceId })
          .returning({ id: Notifications.id })
          .then(firstOrThrow),
      ),
    );

    const installationIds = await listPushNotificationInstallationsActivity(notifications[0]!.id);
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
      return 'projects/kosmo-push-test/messages/summary-test';
    });

    for (const notification of notifications) {
      await sendPushNotificationActivity(notification.id, installationIds[0]);
    }

    assert.deepEqual(
      sent.map(({ data, notification }) => ({
        body: notification?.body,
        data: {
          actorName: data?.actorName,
          kind: data?.kind,
          recipientHandle: data?.recipientHandle,
          recipientName: data?.recipientName,
          reaction: data?.reaction,
        },
      })),
      [
        {
          body: '행위자 님이 수신자(@recipient) 님을 팔로우했습니다.',
          data: {
            actorName: '행위자',
            kind: NotificationKind.FOLLOW,
            recipientHandle: '@recipient',
            recipientName: '수신자',
            reaction: undefined,
          },
        },
        {
          body: '행위자 님이 수신자(@recipient) 님에게 팔로우를 요청했습니다.',
          data: {
            actorName: '행위자',
            kind: NotificationKind.FOLLOW_REQUEST,
            recipientHandle: '@recipient',
            recipientName: '수신자',
            reaction: undefined,
          },
        },
        {
          body: '행위자 님이 수신자(@recipient) 님에게 😂를 남겼습니다.',
          data: {
            actorName: '행위자',
            kind: NotificationKind.REACTION,
            recipientHandle: '@recipient',
            recipientName: '수신자',
            reaction: '😂',
          },
        },
        {
          body: '행위자 님이 수신자(@recipient) 님의 게시글을 재게시했습니다.',
          data: {
            actorName: '행위자',
            kind: NotificationKind.REPOST,
            recipientHandle: '@recipient',
            recipientName: '수신자',
            reaction: undefined,
          },
        },
        {
          body: '행위자 님이 수신자(@recipient) 님의 게시글에 답글을 달았습니다.',
          data: {
            actorName: '행위자',
            kind: NotificationKind.REPLY,
            recipientHandle: '@recipient',
            recipientName: '수신자',
            reaction: undefined,
          },
        },
        {
          body: '행위자 님이 수신자(@recipient) 님의 게시글을 인용했습니다.',
          data: {
            actorName: '행위자',
            kind: NotificationKind.QUOTE,
            recipientHandle: '@recipient',
            recipientName: '수신자',
            reaction: undefined,
          },
        },
        {
          body: '행위자 님이 수신자(@recipient) 님을 언급했습니다.',
          data: {
            actorName: '행위자',
            kind: NotificationKind.MENTION,
            recipientHandle: '@recipient',
            recipientName: '수신자',
            reaction: undefined,
          },
        },
      ],
    );
    assert.equal(
      sent.every(({ notification }) => !notification?.body?.includes('target')),
      true,
    );
  } finally {
    for (const postId of [...postIds].reverse()) {
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

test('공통 Notification Activity는 저장된 Mention ID마다 Push를 시작하고 한 번의 실패를 격리한다', async (t) => {
  const fixture = await createAccountDeletionFixture({
    profileStates: [ProfileState.ACTIVE, ProfileState.ACTIVE],
  });
  let postId: string | null = null;

  try {
    const [recipient, secondRecipient] = fixture.profiles;
    assert.ok(recipient);
    assert.ok(secondRecipient);
    const author = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
    const publishedAt = Temporal.Now.instant();
    const createdPost = await createCorePost({
      document: postContentDocumentFromText('Mention source preview'),
      mentionProfileIds: [recipient.id, secondRecipient.id],
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
    postId = createdPost.post.id;

    let startAttempts = 0;
    const start = t.mock.method(temporalClient.workflow, 'start', async () => {
      startAttempts += 1;
      if (startAttempts === 1) {
        throw new Error('temporary Push workflow start failure');
      }
      return undefined as never;
    });

    await new MockActivityEnvironment().run(createNotificationActivity, {
      kind: NotificationKind.MENTION,
      sourceId: postId,
    });

    const notifications = await db
      .select()
      .from(Notifications)
      .where(eq(Notifications.sourceId, postId));
    assert.equal(notifications.length, 2);
    assert.ok(notifications.every(({ kind }) => kind === NotificationKind.MENTION));
    assert.deepEqual(
      new Set(notifications.map(({ recipientProfileId }) => recipientProfileId)),
      new Set([recipient.id, secondRecipient.id]),
    );
    assert.equal(start.mock.calls.length, 2);

    const workflowIds = start.mock.calls.map((call) => call.arguments[1]?.workflowId);
    assert.deepEqual(
      new Set(workflowIds),
      new Set(notifications.map(({ id }) => `push-notification:${id}`)),
    );
  } finally {
    if (postId) {
      await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
      await db.delete(PostContents).where(eq(PostContents.postId, postId));
      await db.delete(Posts).where(eq(Posts.id, postId));
    }
    await cleanupAccountDeletionFixture(fixture);
  }
});

test('공통 Notification Activity는 Mention materialization이 빈 배열이면 Push를 시작하지 않는다', async (t) => {
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.ACTIVE] });
  let postId: string | null = null;

  try {
    const recipient = fixture.profiles[0];
    assert.ok(recipient);
    const author = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
    const createdPost = await createCorePost({
      document: postContentDocumentFromText('No Mention recipients'),
      mentionProfileIds: [],
      objectUri: `https://${author.handle}.example/posts/${crypto.randomUUID()}`,
      origin: 'ACTIVITYPUB',
      profileId: author.id,
      publishedAt: null,
      receivedAt: Temporal.Now.instant(),
      visibility: PostVisibility.PUBLIC,
    });
    if (!createdPost.created) {
      throw new Error('Expected a new ActivityPub source post');
    }
    postId = createdPost.post.id;
    const start = t.mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    await new MockActivityEnvironment().run(createNotificationActivity, {
      kind: NotificationKind.MENTION,
      sourceId: postId,
    });

    assert.equal(await db.$count(Notifications), 0);
    assert.equal(start.mock.calls.length, 0);
  } finally {
    if (postId) {
      await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
      await db.delete(PostContents).where(eq(PostContents.postId, postId));
      await db.delete(Posts).where(eq(Posts.id, postId));
    }
    await cleanupAccountDeletionFixture(fixture);
  }
});

test('Operational Push는 Account recipient와 저장된 제목·본문·링크를 전달한다', async (t) => {
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = 'kosmo-push-test';
  const fixture = await createAccountDeletionFixture({ profileStates: [] });
  const data = {
    body: 'Maintenance starts soon',
    href: '/account/settings?tab=security#top',
    title: 'Scheduled maintenance',
  };

  try {
    const notification = await db
      .insert(Notifications)
      .values({
        data,
        kind: NotificationKind.OPERATIONAL,
        recipientAccountId: fixture.account.id,
        sourceId: crypto.randomUUID(),
      })
      .returning()
      .then(firstOrThrow);
    const readAt = Temporal.Now.instant();
    await db.update(Notifications).set({ readAt }).where(eq(Notifications.id, notification.id));

    const { listPushNotificationInstallationsActivity, sendPushNotificationActivity } =
      await import('./activities');
    const installationIds = await listPushNotificationInstallationsActivity(notification.id);
    assert.equal(installationIds.length, 2);

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
      return 'projects/kosmo-push-test/messages/operational-test';
    });

    await sendPushNotificationActivity(notification.id, installationIds[0]!);

    assert.equal(sent.length, 1);
    const payload = sent[0];
    assert.ok(payload);
    const { encodeGlobalId } = await import('@kosmo/core/global-id');
    assert.deepEqual(payload.notification, { body: data.body, title: data.title });
    assert.deepEqual(payload.data, {
      href: data.href,
      notificationId: encodeGlobalId('OperationalNotification', notification.id),
      recipientAccountId: encodeGlobalId('Account', fixture.account.id),
    });
    assert.ok((payload.android?.ttl ?? 0) > 0);
    assert.ok((payload.android?.ttl ?? Number.POSITIVE_INFINITY) <= 24 * 60 * 60 * 1000);
    assert.equal(
      (
        await db
          .select({ readAt: Notifications.readAt })
          .from(Notifications)
          .where(eq(Notifications.id, notification.id))
      )[0]?.readAt?.toString(),
      readAt.toString(),
    );
  } finally {
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
      body: `${author.displayName} 님이 ${recipient.displayName}(@${recipient.handle}) 님을 언급했습니다.`,
    });
    assert.deepEqual(payload.data, {
      actorHandle: `@${author.handle}@${author.handle}.example`,
      actorName: author.displayName,
      href: `/@${author.handle}@${author.handle}.example/${encodeGlobalId('Post', post.id)}`,
      kind: NotificationKind.MENTION,
      notificationId: encodeGlobalId('MentionNotification', notificationId),
      postText: 'Mention source preview',
      presentationVersion: '1',
      recipientHandle: `@${recipient.handle}`,
      recipientName: recipient.displayName,
      recipientProfileId: encodeGlobalId('Profile', recipient.id),
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
