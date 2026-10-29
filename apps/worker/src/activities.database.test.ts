import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, afterEach, before, beforeEach, test } from 'node:test';
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
  ProfileState,
  PushInstallationPlatform,
  SessionState,
} from '@kosmo/core/enums';
import {
  postContentDocumentFromText,
  postContentDocumentToText,
} from '@kosmo/core/post-content/server';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  ApplicationFailure,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { MockActivityEnvironment } from '@temporalio/testing';
import { eq, inArray } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';
import type {
  createPost as CreatePost,
  deletePost as DeletePost,
  repostPost as RepostPost,
} from '@kosmo/core/services';
import type { temporalClient as TemporalClient } from '@kosmo/core/temporal/client';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';
import type { Workflow, WorkflowStartOptions } from '@temporalio/client';
import type {
  captureOperationalNotificationAudienceActivity as CaptureOperationalNotificationAudienceActivity,
  createNotificationActivity as CreateNotificationActivity,
  createQuoteNotificationActivity as CreateQuoteNotificationActivity,
  createReactionNotificationActivity as CreateReactionNotificationActivity,
  createReplyNotificationActivity as CreateReplyNotificationActivity,
  createRepostNotificationActivity as CreateRepostNotificationActivity,
  deleteAccountActivity as DeleteAccountActivity,
  deletePostRelatedNotificationsActivity as DeletePostRelatedNotificationsActivity,
  deleteReactionNotificationActivity as DeleteReactionNotificationActivity,
  deleteRepostNotificationActivity as DeleteRepostNotificationActivity,
} from './activities';
import type {
  finalizeMediaUploadActivity as FinalizeMediaUploadActivity,
  prepareMediaUploadActivity as PrepareMediaUploadActivity,
} from './activities/media-upload';
import type {
  loadLocalPostsForContentReprocessingActivity as LoadLocalPostsForContentReprocessingActivity,
  reprocessLocalPostContentActivity as ReprocessLocalPostContentActivity,
} from './activities/post-content-reprocessing';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ApplicationAuthorizations: typeof CoreDb.ApplicationAuthorizations;
let Applications: typeof CoreDb.Applications;
let Hashtags: typeof CoreDb.Hashtags;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let NotificationQuoteJudgments: typeof CoreDb.NotificationQuoteJudgments;
let Notifications: typeof CoreDb.Notifications;
let OAuthAuthorizationCodes: typeof CoreDb.OAuthAuthorizationCodes;
let OAuthTokens: typeof CoreDb.OAuthTokens;
let pg: typeof CoreDb.pg;
let PostContentHashtags: typeof CoreDb.PostContentHashtags;
let PostContents: typeof CoreDb.PostContents;
let PostMentions: typeof CoreDb.PostMentions;
let Posts: typeof CoreDb.Posts;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
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
let captureOperationalNotificationAudienceActivity: typeof CaptureOperationalNotificationAudienceActivity;
let deletePostRelatedNotificationsActivity: typeof DeletePostRelatedNotificationsActivity;
let finalizeMediaUploadActivity: typeof FinalizeMediaUploadActivity;
let prepareMediaUploadActivity: typeof PrepareMediaUploadActivity;
let loadLocalPostsForContentReprocessingActivity: typeof LoadLocalPostsForContentReprocessingActivity;
let reprocessLocalPostContentActivity: typeof ReprocessLocalPostContentActivity;
let temporalClient: typeof TemporalClient;
let activityTestAccountId: string | undefined;
let activityTestAccountPromise: Promise<string> | undefined;

before(async () => {
  ({
    AccountProfiles,
    Accounts,
    ApplicationAuthorizations,
    Applications,
    db,
    firstOrThrow,
    Hashtags,
    Instances,
    Media,
    NotificationQuoteJudgments,
    Notifications,
    OAuthAuthorizationCodes,
    OAuthTokens,
    pg,
    PostContentHashtags,
    PostContents,
    PostMentions,
    Posts,
    ProfileBlocks,
    ProfileFollows,
    ProfileFollowRequests,
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
    captureOperationalNotificationAudienceActivity,
    deleteAccountActivity,
    deletePostRelatedNotificationsActivity,
    deleteReactionNotificationActivity,
    deleteRepostNotificationActivity,
  } = await import('./activities'));
  ({ finalizeMediaUploadActivity, prepareMediaUploadActivity } =
    await import('./activities/media-upload'));
  ({ loadLocalPostsForContentReprocessingActivity, reprocessLocalPostContentActivity } =
    await import('./activities/post-content-reprocessing'));
  ({ temporalClient } = await import('@kosmo/core/temporal/client'));
  ({ createPost: createCorePost, deletePost, repostPost } = await import('@kosmo/core/services'));
});

beforeEach(async () => {
  await db.delete(NotificationQuoteJudgments);
  await db.delete(Notifications);
  await db.delete(ProfileFollows);
  await db.update(Posts).set({ currentContentId: null, repostSourceId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Profiles);
  await db.delete(Instances);
});

afterEach(async () => {
  const accountId =
    activityTestAccountId ??
    (activityTestAccountPromise
      ? await activityTestAccountPromise.catch(() => undefined)
      : undefined);
  if (accountId) {
    await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, accountId));
    await db.delete(Accounts).where(eq(Accounts.id, accountId));
  }
  activityTestAccountId = undefined;
  activityTestAccountPromise = undefined;
});

after(async () => {
  await pg.end();
});

test('Operational audience capture is stable across retries, payload mismatches, and later signups', async () => {
  const active = await createAccountDeletionFixture({ profileStates: [] });
  const anotherActive = await createAccountDeletionFixture({ profileStates: [] });
  const disabled = await createAccountDeletionFixture({ profileStates: [] });
  const sendId = crypto.randomUUID();
  const data = { href: '/maintenance', title: 'Scheduled maintenance' };
  let lateSignup: Awaited<ReturnType<typeof createAccountDeletionFixture>> | undefined;

  try {
    await db
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(eq(Accounts.id, disabled.account.id));
    assert.deepEqual(
      await Promise.all([
        captureOperationalNotificationAudienceActivity({ sendId, data }),
        captureOperationalNotificationAudienceActivity({ sendId, data }),
      ]),
      [true, true],
    );

    const notifications = await db
      .select()
      .from(Notifications)
      .where(eq(Notifications.sourceId, sendId));
    assert.equal(notifications.length, 2);
    assert.deepEqual(
      notifications.map(({ recipientAccountId }) => recipientAccountId).sort(),
      [active.account.id, anotherActive.account.id].sort(),
    );
    for (const notification of notifications) {
      assert.equal(notification.recipientProfileId, null);
      assert.equal(notification.kind, NotificationKind.OPERATIONAL);
      assert.deepEqual(notification.data, data);
    }
    const notificationIds = notifications.map(({ id }) => id).sort();

    const readAt = Temporal.Instant.from('2026-10-02T01:23:45.123456Z');
    const readNotificationId = notifications[0]!.id;
    await db.update(Notifications).set({ readAt }).where(eq(Notifications.id, readNotificationId));
    lateSignup = await createAccountDeletionFixture({ profileStates: [] });

    assert.equal(await captureOperationalNotificationAudienceActivity({ sendId, data }), true);
    const retriedNotifications = await db
      .select({
        id: Notifications.id,
        recipientAccountId: Notifications.recipientAccountId,
        readAt: Notifications.readAt,
      })
      .from(Notifications)
      .where(eq(Notifications.sourceId, sendId));
    assert.equal(retriedNotifications.length, 2);
    assert.deepEqual(retriedNotifications.map(({ id }) => id).sort(), notificationIds);
    assert.deepEqual(
      retriedNotifications.map(({ recipientAccountId }) => recipientAccountId).sort(),
      [active.account.id, anotherActive.account.id].sort(),
    );
    assert.equal(
      retriedNotifications.find(({ id }) => id === readNotificationId)?.readAt?.toString(),
      readAt.toString(),
    );
    assert.equal(retriedNotifications.find(({ id }) => id !== readNotificationId)?.readAt, null);
    await assert.rejects(
      captureOperationalNotificationAudienceActivity({
        sendId,
        data: { ...data, title: 'Different message' },
      }),
      /Operational notification send ID already exists with different data/,
    );
  } finally {
    if (lateSignup) {
      await cleanupAccountDeletionFixture(lateSignup);
    }
    await cleanupAccountDeletionFixture(active);
    await cleanupAccountDeletionFixture(anotherActive);
    await cleanupAccountDeletionFixture(disabled);
  }
});

test('Operational audience capture leaves no marker for an empty audience', async () => {
  const disabled = await createAccountDeletionFixture({ profileStates: [] });
  const sendId = crypto.randomUUID();
  const data = { href: '/maintenance', title: 'Scheduled maintenance' };
  let lateSignup: Awaited<ReturnType<typeof createAccountDeletionFixture>> | undefined;

  try {
    await db
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(eq(Accounts.id, disabled.account.id));
    assert.equal(await captureOperationalNotificationAudienceActivity({ sendId, data }), false);
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, sendId)), 0);

    lateSignup = await createAccountDeletionFixture({ profileStates: [] });
    assert.equal(await captureOperationalNotificationAudienceActivity({ sendId, data }), true);
    const notification = await db
      .select({ recipientAccountId: Notifications.recipientAccountId })
      .from(Notifications)
      .where(eq(Notifications.sourceId, sendId))
      .then(firstOrThrow);
    assert.equal(notification.recipientAccountId, lateSignup.account.id);
  } finally {
    if (lateSignup) {
      await cleanupAccountDeletionFixture(lateSignup);
    }
    await cleanupAccountDeletionFixture(disabled);
  }
});

test('Operational dispatch pages 51 stored recipients and retries failed Push starts from the same cursor', async (t) => {
  const sendId = crypto.randomUUID();
  const data = { href: '/maintenance', title: 'Scheduled maintenance' };
  const accounts = await db
    .insert(Accounts)
    .values(
      Array.from({ length: 51 }, () => {
        const suffix = crypto.randomUUID();
        return {
          displayName: suffix,
          oidcSubject: `subject-${suffix}`,
          state: AccountState.ACTIVE,
        };
      }),
    )
    .returning({ id: Accounts.id });
  const accountIds = accounts.map(({ id }) => id);

  try {
    await db.insert(Notifications).values(
      accounts.map(({ id }) => ({
        data,
        kind: NotificationKind.OPERATIONAL,
        recipientAccountId: id,
        sourceId: sendId,
      })),
    );
    const expectedIds = await db
      .select({ id: Notifications.id })
      .from(Notifications)
      .where(eq(Notifications.sourceId, sendId))
      .orderBy(Notifications.id)
      .then((rows) => rows.map(({ id }) => id));
    const startCalls: Array<{
      readonly notificationId: string;
      readonly workflowId: string | undefined;
    }> = [];
    const started = new Set<string>();
    const { dispatchOperationalNotificationPageActivity } = await import('./activities');
    let injectedFailure = false;
    const start = t.mock.method(
      temporalClient.workflow,
      'start',
      async (workflow: string | Workflow, options: WorkflowStartOptions) => {
        assert.equal(workflow, 'pushNotificationDeliveryWorkflow');
        assert.equal(options.taskQueue, KOSMO_TASK_QUEUE);
        const args = options.args as [{ readonly notificationId: string }];
        const notificationId = args[0]?.notificationId;
        assert.ok(notificationId);
        startCalls.push({ notificationId, workflowId: options.workflowId });

        if (!injectedFailure && notificationId === expectedIds[0]) {
          injectedFailure = true;
          throw new Error('temporary Push workflow start failure');
        }
        if (started.has(notificationId)) {
          const duplicate = new Error('Push workflow already started');
          duplicate.name = 'WorkflowExecutionAlreadyStartedError';
          throw duplicate;
        }
        started.add(notificationId);
        return { workflowId: options.workflowId } as never;
      },
    );

    await assert.rejects(
      dispatchOperationalNotificationPageActivity({ sendId }),
      /temporary Push workflow start failure/,
    );
    assert.equal(startCalls.length, 50);
    assert.deepEqual(
      startCalls.slice(0, 50).map(({ notificationId }) => notificationId),
      expectedIds.slice(0, 50),
    );

    const firstPage = await dispatchOperationalNotificationPageActivity({ sendId });
    assert.deepEqual(firstPage, { afterNotificationId: expectedIds[49], hasMore: true });
    assert.deepEqual(
      startCalls.slice(50, 100).map(({ notificationId }) => notificationId),
      expectedIds.slice(0, 50),
    );
    assert.ok(
      startCalls
        .slice(50, 100)
        .every(
          ({ notificationId, workflowId }) => workflowId === `push-notification:${notificationId}`,
        ),
    );

    const secondPage = await dispatchOperationalNotificationPageActivity({
      sendId,
      afterNotificationId: firstPage.afterNotificationId ?? undefined,
    });
    assert.deepEqual(secondPage, {
      afterNotificationId: expectedIds[50],
      hasMore: false,
    });
    assert.deepEqual(
      startCalls.slice(100).map(({ notificationId }) => notificationId),
      [expectedIds[50]],
    );
    assert.equal(start.mock.calls.length, 101);
    assert.equal(await db.$count(Notifications, eq(Notifications.sourceId, sendId)), 51);
  } finally {
    await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
  }
});

test('Operational dispatch stops on exact 50 and 100 recipient page boundaries', async (t) => {
  const startCalls: string[] = [];
  const { dispatchOperationalNotificationPageActivity } = await import('./activities');
  t.mock.method(
    temporalClient.workflow,
    'start',
    async (_workflow: string | Workflow, options: WorkflowStartOptions) => {
      const args = options.args as [{ readonly notificationId: string }];
      startCalls.push(args[0]!.notificationId);
      return { workflowId: options.workflowId } as never;
    },
  );

  for (const recipientCount of [50, 100]) {
    const sendId = crypto.randomUUID();
    const data = { href: '/maintenance', title: 'Scheduled maintenance' };
    const accounts = await db
      .insert(Accounts)
      .values(
        Array.from({ length: recipientCount }, () => {
          const suffix = crypto.randomUUID();
          return {
            displayName: suffix,
            oidcSubject: `subject-${suffix}`,
            state: AccountState.ACTIVE,
          };
        }),
      )
      .returning({ id: Accounts.id });
    const accountIds = accounts.map(({ id }) => id);

    try {
      await db.insert(Notifications).values(
        accounts.map(({ id }) => ({
          data,
          kind: NotificationKind.OPERATIONAL,
          recipientAccountId: id,
          sourceId: sendId,
        })),
      );
      const expectedIds = await db
        .select({ id: Notifications.id })
        .from(Notifications)
        .where(eq(Notifications.sourceId, sendId))
        .orderBy(Notifications.id)
        .then((rows) => rows.map(({ id }) => id));
      const startIndex = startCalls.length;

      const firstPage = await dispatchOperationalNotificationPageActivity({ sendId });
      assert.deepEqual(firstPage, {
        afterNotificationId: expectedIds[49],
        hasMore: recipientCount > 50,
      });

      if (recipientCount === 100) {
        const secondPage = await dispatchOperationalNotificationPageActivity({
          sendId,
          afterNotificationId: firstPage.afterNotificationId ?? undefined,
        });
        assert.deepEqual(secondPage, {
          afterNotificationId: expectedIds[99],
          hasMore: false,
        });
      }

      assert.deepEqual(startCalls.slice(startIndex), expectedIds);
    } finally {
      await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
    }
  }
});

test('Account deletion Activity는 ACTIVE Profile이 있으면 아무것도 변경하지 않는다', async () => {
  const fixture = await createAccountDeletionFixture({
    profileStates: [ProfileState.ACTIVE, ProfileState.DISABLED, ProfileState.SUSPENDED],
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

test('Account deletion Activity는 SUSPENDED Profile만 있거나 DISABLED Profile과 함께 있어도 탈퇴를 허용한다', async () => {
  for (const profileStates of [
    [ProfileState.SUSPENDED],
    [ProfileState.SUSPENDED, ProfileState.DISABLED],
  ]) {
    const fixture = await createAccountDeletionFixture({ profileStates });

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
        await db
          .select({ profileId: AccountProfiles.profileId, role: AccountProfiles.role })
          .from(AccountProfiles)
          .where(eq(AccountProfiles.accountId, fixture.account.id))
          .orderBy(AccountProfiles.profileId),
        fixture.profiles
          .map(({ id }) => ({ profileId: id, role: AccountProfileRole.OWNER }))
          .sort((left, right) => left.profileId.localeCompare(right.profileId)),
      );
    } finally {
      await cleanupAccountDeletionFixture(fixture);
    }
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
    notifications.map(({ data, kind, recipientAccountId, recipientProfileId, sourceId }) => ({
      data,
      kind,
      recipientAccountId,
      recipientProfileId,
      sourceId,
    })),
    [
      {
        data: {},
        kind: NotificationKind.REPLY,
        recipientAccountId: activityTestAccountId,
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
    bodyText: 'Quote source',
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: quote } = await createCorePost({
    bodyText: 'Quote body',
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
    bodyText: 'Combined source',
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: quote } = await createCorePost({
    bodyText: 'Combined quote',
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
  assert.deepEqual(notificationIds.flat(), [notifications[0]?.id]);
});

test('Quote와 Reply의 recipient가 다르면 각 알림을 독립적으로 만든다', async () => {
  const quoteRecipient = await createProfile();
  const replyRecipient = await createProfile();
  const author = await createProfile();
  const { post: quoteSource } = await createCorePost({
    bodyText: 'Quote source',
    origin: 'LOCAL',
    profileId: quoteRecipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const replyParent = await createPost(replyRecipient.id);
  const { post: quote } = await createCorePost({
    bodyText: 'Quote and reply',
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
  assert.deepEqual(new Set(notificationIds.flat()), new Set(notifications.map(({ id }) => id)));
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
    notifications.map(({ kind, recipientAccountId, recipientProfileId, sourceId }) => ({
      kind,
      recipientAccountId,
      recipientProfileId,
      sourceId,
    })),
    [
      {
        kind: NotificationKind.REACTION,
        recipientAccountId: activityTestAccountId,
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
    bodyText: 'Repost source',
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
  assert.equal(notifications[0]?.recipientAccountId, activityTestAccountId);
  assert.equal(notifications[0]?.recipientProfileId, recipient.id);
  assert.equal(notifications[0]?.sourceId, repost.id);

  await deleteRepostNotificationActivity(repost.id);
  await deleteRepostNotificationActivity(repost.id);
  assert.equal(await db.$count(Notifications), 0);
});

test('Post deletion Notification Activity removes exact related rows and is idempotent', async () => {
  const recipientAccountId = await getActivityTestAccountId();
  const author = await createProfile();
  const mentionRecipient = await createProfile();
  const independentMentionRecipient = await createProfile();
  const actor = await createProfile();
  const mentionContent = (profile: { handle: string; id: string }) => {
    const relativeHandle = `@${profile.handle}`;
    const bodyText = `Mention ${relativeHandle}`;
    const start = bodyText.indexOf(relativeHandle);
    return {
      bodyText,
      mentions: [
        {
          end: start + relativeHandle.length,
          handle: relativeHandle,
          profileId: profile.id,
          relativeHandle,
          start,
        },
      ],
    };
  };
  const { post } = await createCorePost({
    ...mentionContent(mentionRecipient),
    origin: 'LOCAL',
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });
  const reaction = await db
    .insert(Reactions)
    .values({ postId: post.id, profileId: actor.id, type: '🌈' })
    .returning()
    .then(firstOrThrow);
  const { post: reply } = await createCorePost({
    ...mentionContent(independentMentionRecipient),
    origin: 'LOCAL',
    profileId: actor.id,
    replyParentId: post.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: quote } = await createCorePost({
    bodyText: 'Quote body',
    origin: 'LOCAL',
    profileId: actor.id,
    repostSourceId: post.id,
    visibility: PostVisibility.UNLISTED,
  });
  const { repost } = await repostPost({
    actorProfileId: actor.id,
    origin: 'LOCAL',
    sourcePostId: post.id,
  });
  const { post: unrelatedPost } = await createCorePost({
    ...mentionContent(independentMentionRecipient),
    origin: 'LOCAL',
    profileId: actor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const readAt = Temporal.Now.instant();
  const deletedNotifications = await db
    .insert(Notifications)
    .values([
      {
        kind: NotificationKind.MENTION,
        recipientAccountId,
        recipientProfileId: mentionRecipient.id,
        sourceId: post.id,
      },
      {
        kind: NotificationKind.REACTION,
        recipientAccountId,
        recipientProfileId: author.id,
        sourceId: reaction.id,
      },
      {
        kind: NotificationKind.REPLY,
        recipientAccountId,
        recipientProfileId: author.id,
        sourceId: reply.id,
      },
      {
        kind: NotificationKind.QUOTE,
        recipientAccountId,
        recipientProfileId: author.id,
        sourceId: quote.id,
      },
      {
        kind: NotificationKind.REPOST,
        recipientAccountId,
        recipientProfileId: author.id,
        sourceId: repost.id,
      },
    ])
    .returning();
  const mentionOnReply = await db
    .insert(Notifications)
    .values({
      kind: NotificationKind.MENTION,
      readAt,
      recipientAccountId,
      recipientProfileId: independentMentionRecipient.id,
      sourceId: reply.id,
    })
    .returning()
    .then(firstOrThrow);
  const unrelatedMention = await db
    .insert(Notifications)
    .values({
      kind: NotificationKind.MENTION,
      readAt,
      recipientAccountId,
      recipientProfileId: independentMentionRecipient.id,
      sourceId: unrelatedPost.id,
    })
    .returning()
    .then(firstOrThrow);

  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, post.id));

  await deletePostRelatedNotificationsActivity(post.id);
  await deletePostRelatedNotificationsActivity(post.id);

  const remaining = await db
    .select({ id: Notifications.id, readAt: Notifications.readAt })
    .from(Notifications);
  assert.deepEqual(
    new Set(remaining.map(({ id }) => id)),
    new Set([mentionOnReply.id, unrelatedMention.id]),
  );
  assert.equal(
    remaining.find(({ id }) => id === mentionOnReply.id)?.readAt?.toString(),
    readAt.toString(),
  );
  assert.equal(
    remaining.find(({ id }) => id === unrelatedMention.id)?.readAt?.toString(),
    readAt.toString(),
  );
  assert.equal(deletedNotifications.length, 5);
  assert.equal(await db.$count(Reactions, eq(Reactions.id, reaction.id)), 1);
});

test('Post deletion Notification Activity removes direct Reply, Quote, and Repost notifications', async () => {
  const recipientAccountId = await getActivityTestAccountId();
  const replyRecipient = await createProfile();
  const quoteRecipient = await createProfile();
  const repostRecipient = await createProfile();
  const actor = await createProfile();
  const { post: replyParent } = await createCorePost({
    bodyText: 'Reply parent',
    origin: 'LOCAL',
    profileId: replyRecipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: reply } = await createCorePost({
    bodyText: 'Reply body',
    origin: 'LOCAL',
    profileId: actor.id,
    replyParentId: replyParent.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: quoteSource } = await createCorePost({
    bodyText: 'Quote source',
    origin: 'LOCAL',
    profileId: quoteRecipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: quote } = await createCorePost({
    bodyText: 'Quote body',
    origin: 'LOCAL',
    profileId: actor.id,
    repostSourceId: quoteSource.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { post: repostSource } = await createCorePost({
    bodyText: 'Repost source',
    origin: 'LOCAL',
    profileId: repostRecipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { repost } = await repostPost({
    actorProfileId: actor.id,
    origin: 'LOCAL',
    sourcePostId: repostSource.id,
  });
  const deletedPosts = [reply, quote, repost];
  const directNotifications = await db
    .insert(Notifications)
    .values([
      {
        kind: NotificationKind.REPLY,
        recipientAccountId,
        recipientProfileId: replyRecipient.id,
        sourceId: reply.id,
      },
      {
        kind: NotificationKind.QUOTE,
        recipientAccountId,
        recipientProfileId: quoteRecipient.id,
        sourceId: quote.id,
      },
      {
        kind: NotificationKind.REPOST,
        recipientAccountId,
        recipientProfileId: repostRecipient.id,
        sourceId: repost.id,
      },
    ])
    .returning();

  await db
    .update(Posts)
    .set({ state: PostState.DELETED })
    .where(
      inArray(
        Posts.id,
        deletedPosts.map(({ id }) => id),
      ),
    );

  for (const { id } of deletedPosts) {
    await deletePostRelatedNotificationsActivity(id);
    await deletePostRelatedNotificationsActivity(id);
  }

  assert.equal(directNotifications.length, 3);
  assert.equal(await db.$count(Notifications), 0);
});

test('Create Activity 전에 Repost가 Tombstone이면 성공한 no-op이다', async () => {
  const recipient = await createProfile();
  const actor = await createProfile();
  const { post: source } = await createCorePost({
    bodyText: 'Deleted Repost source',
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

const getActivityTestAccountId = () => {
  if (!activityTestAccountPromise) {
    const suffix = crypto.randomUUID();
    activityTestAccountPromise = db
      .insert(Accounts)
      .values({
        displayName: `Notification activity tests ${suffix}`,
        oidcSubject: `notification-activity-tests-${suffix}`,
        state: AccountState.ACTIVE,
      })
      .returning({ id: Accounts.id })
      .then(firstOrThrow)
      .then(({ id }) => {
        activityTestAccountId = id;
        return id;
      });
  }
  return activityTestAccountPromise;
};

const createProfile = async ({
  accountId,
  instanceKind = InstanceKind.LOCAL,
  state = ProfileState.ACTIVE,
}: { accountId?: string | null; instanceKind?: InstanceKind; state?: ProfileState } = {}) => {
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

  const profile = await db
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
  const membershipAccountId =
    accountId === undefined ? await getActivityTestAccountId() : accountId;
  if (membershipAccountId) {
    await db.insert(AccountProfiles).values({
      accountId: membershipAccountId,
      profileId: profile.id,
      role: AccountProfileRole.OWNER,
    });
  }
  return profile;
};

const createAccountDeletionFixture = async ({
  profileStates,
}: {
  readonly profileStates: ReadonlyArray<ProfileState>;
}) => {
  const suffix = crypto.randomUUID();
  const profiles = await Promise.all(
    profileStates.map((state) => createProfile({ accountId: null, state })),
  );
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
    await db
      .update(Profiles)
      .set({ displayName: '예은', handle: 'yeeun', normalizedHandle: 'yeeun' })
      .where(eq(Profiles.id, recipient.id));
    await db
      .update(Profiles)
      .set({ displayName: '혜주', handle: 'hyeju', normalizedHandle: 'hyeju' })
      .where(eq(Profiles.id, actor.id));
    const { post } = await createCorePost({
      bodyText: 'Read the article',
      origin: 'LOCAL',
      profileId: recipient.id,
      visibility: PostVisibility.PUBLIC,
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
    postId = post.id;
    const reaction = await db
      .insert(Reactions)
      .values({ postId: post.id, profileId: actor.id, type: '😂' })
      .returning()
      .then(firstOrThrow);
    const [notificationId] = await createReactionNotificationActivity(reaction.id);
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

    const nativeInstallationId = installationIds[0]!;
    const webInstallationId = installationIds[1]!;
    await sendPushNotificationActivity(notificationId, nativeInstallationId);
    const payload = sent[0];
    assert.ok(payload);
    const { encodeGlobalId } = await import('@kosmo/core/global-id');
    assert.deepEqual(payload.notification, {
      title: '혜주',
      body: '혜주(@hyeju) 님이 예은(@yeeun) 님에게 😂를 남겼습니다. Read the article',
    });
    assert.deepEqual(payload.data, {
      notificationId: encodeGlobalId('ReactionNotification', notificationId),
      recipientProfileId: encodeGlobalId('Profile', recipient.id),
      href: `/@yeeun/${encodeGlobalId('Post', post.id)}`,
    });
    assert.ok('token' in payload);
    assert.equal('fid' in payload, false);
    assert.equal(
      payload.token,
      installationRows.find(({ id }) => id === nativeInstallationId)?.token,
    );
    assert.equal(payload.android?.priority, undefined);
    assert.equal(payload.apns?.payload, undefined);
    assert.ok((payload.android?.ttl ?? 0) > 0);
    assert.ok((payload.android?.ttl ?? Number.POSITIVE_INFINITY) <= 24 * 60 * 60 * 1000);

    await db
      .update(PushInstallations)
      .set({ platform: PushInstallationPlatform.WEB, token: 'web-fid-reaction' })
      .where(eq(PushInstallations.id, webInstallationId));
    await sendPushNotificationActivity(notificationId, webInstallationId);
    const webPayload = sent[1];
    assert.ok(webPayload);
    assert.ok('fid' in webPayload);
    assert.equal(webPayload.fid, 'web-fid-reaction');
    assert.equal('token' in webPayload, false);
    assert.equal(webPayload.notification, undefined);
    assert.equal(webPayload.android, undefined);
    assert.equal(webPayload.apns, undefined);
    assert.deepEqual(webPayload.data, {
      notificationId: encodeGlobalId('ReactionNotification', notificationId),
      recipientProfileId: encodeGlobalId('Profile', recipient.id),
      href: `/@yeeun/${encodeGlobalId('Post', post.id)}`,
      title: '혜주',
      body: '혜주(@hyeju) 님이 예은(@yeeun) 님에게 😂를 남겼습니다. Read the article',
    });
    const webTtl = webPayload.webpush?.headers?.TTL;
    assert.match(webTtl ?? '', /^\d+$/);
    assert.ok(Number(webTtl) <= 24 * 60 * 60);

    const contentId = post.currentContentId;
    assert.ok(contentId);
    const emojiText = '😀'.repeat(161);
    await db
      .update(PostContents)
      .set({
        document: {
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
        },
      })
      .where(eq(PostContents.id, contentId));
    await sendPushNotificationActivity(notificationId, nativeInstallationId);
    assert.equal(
      sent[2]?.notification?.body,
      `혜주(@hyeju) 님이 예은(@yeeun) 님에게 😂를 남겼습니다. ${'😀'.repeat(159)}…`,
    );
    assert.ok(
      new TextEncoder().encode(
        JSON.stringify({
          android: sent[2]?.android,
          apns: sent[2]?.apns,
          data: sent[2]?.data,
          notification: sent[2]?.notification,
        }),
      ).byteLength < 4096,
    );
    const warningDocument = { ...document, summary: 'Private warning text' };
    await db
      .update(PostContents)
      .set({ document: warningDocument })
      .where(eq(PostContents.id, contentId));
    await sendPushNotificationActivity(notificationId, nativeInstallationId);
    assert.equal(
      sent[3]?.notification?.body,
      '혜주(@hyeju) 님이 예은(@yeeun) 님에게 😂를 남겼습니다.',
    );
    assert.equal(sent[3]?.notification?.body.includes('Private warning text'), false);
    await sendPushNotificationActivity(notificationId, webInstallationId);
    assert.equal(sent[4]?.data?.body, '혜주(@hyeju) 님이 예은(@yeeun) 님에게 😂를 남겼습니다.');
    assert.equal(sent[4]?.data?.body.includes('Private warning text'), false);

    const sensitiveDocument = {
      ...document,
      body: { ...document.body, attrs: { sensitiveMedia: true } },
    };
    await db
      .update(PostContents)
      .set({ document: sensitiveDocument })
      .where(eq(PostContents.id, contentId));
    await sendPushNotificationActivity(notificationId, nativeInstallationId);
    assert.equal(
      sent[5]?.notification?.body,
      '혜주(@hyeju) 님이 예은(@yeeun) 님에게 😂를 남겼습니다.',
    );
    assert.equal(sent[5]?.notification?.body.includes('Read the article'), false);
    await sendPushNotificationActivity(notificationId, webInstallationId);
    assert.equal(sent[6]?.data?.body, '혜주(@hyeju) 님이 예은(@yeeun) 님에게 😂를 남겼습니다.');
    assert.equal(sent[6]?.data?.body.includes('Read the article'), false);

    await db.delete(AccountProfiles).where(eq(AccountProfiles.profileId, recipient.id));
    await sendPushNotificationActivity(notificationId, nativeInstallationId);
    await sendPushNotificationActivity(notificationId, webInstallationId);
    assert.equal(sent.length, 7);
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

test('Profile Notification의 유형별 기본 notification payload를 전달한다', async (t) => {
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
      bodyText: 'target',
      origin: 'LOCAL',
      profileId: recipient.id,
      visibility: PostVisibility.PUBLIC,
    });
    postIds.push(target.id);
    const { post: reply } = await createCorePost({
      bodyText: 'reply',
      origin: 'LOCAL',
      profileId: actor.id,
      replyParentId: target.id,
      visibility: PostVisibility.PUBLIC,
    });
    postIds.push(reply.id);
    const { post: quote } = await createCorePost({
      bodyText: 'quote',
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
    ] as const;
    const notifications = await Promise.all(
      notificationSources.map(([kind, sourceId]) =>
        db
          .insert(Notifications)
          .values({
            kind,
            recipientAccountId: fixture.account.id,
            recipientProfileId: recipient.id,
            sourceId,
          })
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
    const { encodeGlobalId } = await import('@kosmo/core/global-id');
    const dataFor = (kind: NotificationKind, id: string) =>
      encodeGlobalId(
        (
          {
            [NotificationKind.FOLLOW]: 'FollowNotification',
            [NotificationKind.FOLLOW_REQUEST]: 'FollowRequestNotification',
            [NotificationKind.REACTION]: 'ReactionNotification',
            [NotificationKind.REPOST]: 'RepostNotification',
            [NotificationKind.REPLY]: 'ReplyNotification',
            [NotificationKind.QUOTE]: 'QuoteNotification',
            [NotificationKind.MENTION]: 'MentionNotification',
            [NotificationKind.OPERATIONAL]: 'OperationalNotification',
          } satisfies Record<NotificationKind, string>
        )[kind],
        id,
      );
    const encodeProfileId = (id: string) => encodeGlobalId('Profile', id);
    const encodePostId = (id: string) => encodeGlobalId('Post', id);
    t.mock.method(messaging, 'send', async (message: FcmMessage) => {
      sent.push(message);
      return 'projects/kosmo-push-test/messages/summary-test';
    });

    for (const notification of notifications) {
      await sendPushNotificationActivity(notification.id, installationIds[0]);
    }

    assert.deepEqual(
      sent.map(({ notification, data }) => ({
        title: notification?.title,
        body: notification?.body,
        data,
      })),
      [
        {
          title: '행위자',
          body: '행위자(@actor) 님이 수신자(@recipient) 님을 팔로우했습니다.',
          data: {
            href: '/@actor',
            notificationId: dataFor(NotificationKind.FOLLOW, notifications[0]!.id),
            recipientProfileId: encodeProfileId(recipient.id),
          },
        },
        {
          title: '행위자',
          body: '행위자(@actor) 님이 수신자(@recipient) 님에게 팔로우를 요청했습니다.',
          data: {
            href: '/follow-requests',
            notificationId: dataFor(NotificationKind.FOLLOW_REQUEST, notifications[1]!.id),
            recipientProfileId: encodeProfileId(recipient.id),
          },
        },
        {
          title: '행위자',
          body: '행위자(@actor) 님이 수신자(@recipient) 님에게 😂를 남겼습니다. target',
          data: {
            href: `/@recipient/${encodePostId(target.id)}`,
            notificationId: dataFor(NotificationKind.REACTION, notifications[2]!.id),
            recipientProfileId: encodeProfileId(recipient.id),
          },
        },
        {
          title: '행위자',
          body: '행위자(@actor) 님이 수신자(@recipient) 님의 게시글을 재게시했습니다. target',
          data: {
            href: `/@recipient/${encodePostId(target.id)}`,
            notificationId: dataFor(NotificationKind.REPOST, notifications[3]!.id),
            recipientProfileId: encodeProfileId(recipient.id),
          },
        },
        {
          title: '행위자',
          body: '행위자(@actor) 님이 수신자(@recipient) 님의 게시글에 답글을 달았습니다. reply',
          data: {
            href: `/@actor/${encodePostId(reply.id)}`,
            notificationId: dataFor(NotificationKind.REPLY, notifications[4]!.id),
            recipientProfileId: encodeProfileId(recipient.id),
          },
        },
        {
          title: '행위자',
          body: '행위자(@actor) 님이 수신자(@recipient) 님의 게시글을 인용했습니다. quote',
          data: {
            href: `/@actor/${encodePostId(quote.id)}`,
            notificationId: dataFor(NotificationKind.QUOTE, notifications[5]!.id),
            recipientProfileId: encodeProfileId(recipient.id),
          },
        },
      ],
    );
    assert.ok(
      sent.every(
        ({ android, apns, data, notification }) =>
          android?.priority === undefined &&
          apns?.payload === undefined &&
          notification &&
          data &&
          new TextEncoder().encode(JSON.stringify({ android, apns, data, notification }))
            .byteLength < 4096,
      ),
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
    const authorInstance = await db
      .select({ domain: Instances.domain })
      .from(Instances)
      .where(eq(Instances.id, author.instanceId))
      .then(firstOrThrow);
    const actorLabel = `${author.displayName}(@${author.handle}@${authorInstance.domain})`;
    const recipientLabel = `${recipient.displayName}(@${recipient.handle})`;
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
      body: `${actorLabel} 님이 ${recipientLabel} 님을 언급했습니다. Mention source preview`,
    });
    assert.deepEqual(payload.data, {
      notificationId: encodeGlobalId('MentionNotification', notificationId),
      recipientProfileId: encodeGlobalId('Profile', recipient.id),
      href: `/@${author.handle}@${authorInstance.domain}/${encodeGlobalId('Post', post.id)}`,
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

test('Push Notification Activity는 등록되지 않은 FID만 제거하고 invalid-argument는 보존한다', async (t) => {
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = 'kosmo-push-test';
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.ACTIVE] });
  let postId: string | null = null;

  try {
    const recipient = fixture.profiles[0]!;
    const actor = await createProfile();
    const { post } = await createCorePost({
      bodyText: 'Token cleanup',
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
    const [notificationId] = await createReactionNotificationActivity(reaction.id);
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
    let providerCode = 'messaging/installation-id-not-registered';
    t.mock.method(messaging, 'send', async () => {
      throw new FirebaseError({
        code: providerCode,
        message: 'Push target is no longer registered',
      });
    });

    const { listPushNotificationInstallationsActivity, sendPushNotificationActivity } =
      await import('./activities');
    const installationIds = await listPushNotificationInstallationsActivity(notificationId);
    const webInstallationId = installationIds[0]!;
    const nativeInstallationId = installationIds[1]!;
    await db
      .update(PushInstallations)
      .set({ platform: PushInstallationPlatform.WEB, token: 'web-fid-stale' })
      .where(eq(PushInstallations.id, webInstallationId));
    await sendPushNotificationActivity(notificationId, webInstallationId);
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.id, webInstallationId)),
      0,
    );
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.accountId, fixture.account.id)),
      1,
    );

    providerCode = 'messaging/invalid-argument';
    await assert.rejects(() => sendPushNotificationActivity(notificationId, nativeInstallationId));
    assert.equal(
      await db.$count(PushInstallations, eq(PushInstallations.id, nativeInstallationId)),
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

test('Media Upload preparation은 소유자와 상태를 검증하고 staging source를 확인한다', async () => {
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.ACTIVE] });
  const mediaIds: string[] = [];
  const requests: { authorization: string | undefined; method: string; url: string }[] = [];
  let headResponseStatus = 200;
  const server = createServer((request, response) => {
    requests.push({
      authorization: request.headers.authorization,
      method: request.method ?? '',
      url: request.url ?? '',
    });
    if (request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    if (
      request.headers.authorization !== 'Bearer test-api-key' ||
      !/^\/v1\/uploads\/u_[0-9a-f-]{36}\?staging=true$/.test(request.url ?? '')
    ) {
      response.writeHead(400).end();
      return;
    }
    if (headResponseStatus !== 200) {
      response
        .writeHead(headResponseStatus, { 'Content-Type': 'application/xml' })
        .end(
          '<Error><Code>ServiceUnavailable</Code><Message>Transient staging failure</Message></Error>',
        );
      return;
    }
    response
      .writeHead(200, {
        'Content-Length': '128',
        'Content-Type': 'image/jpeg',
        'Last-Modified': new Date().toUTCString(),
      })
      .end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const stagingConfig = [
    ['MEDIA_STORAGE_SERVICE_ORIGIN', `http://127.0.0.1:${address.port}`],
    ['MEDIA_STORAGE_SERVICE_API_KEY', 'test-api-key'],
  ] as const;
  const previousStagingConfig = stagingConfig.map(([key]) => process.env[key]);
  for (const [key, value] of stagingConfig) {
    process.env[key] = value;
  }

  const createUploadingMedia = async (storageReference = `nexus:v1:${crypto.randomUUID()}`) => {
    const media = await db
      .insert(Media)
      .values({
        accountId: fixture.account.id,
        profileId: fixture.profiles[0]!.id,
        source: MediaSource.LOCAL,
        state: MediaState.UPLOADING,
        storageReference,
        uploadExpiresAt: Temporal.Now.instant().add({ minutes: 10 }),
      })
      .returning({ id: Media.id })
      .then(firstOrThrow);
    mediaIds.push(media.id);
    return { mediaId: media.id, accountId: fixture.account.id, storageReference };
  };
  const readMediaState = async (mediaId: string) => {
    const media = await db
      .select({
        accountId: Media.accountId,
        mediaType: Media.mediaType,
        readyAt: Media.readyAt,
        source: Media.source,
        state: Media.state,
        storageReference: Media.storageReference,
        url: Media.url,
      })
      .from(Media)
      .where(eq(Media.id, mediaId))
      .limit(1)
      .then(firstOrThrow);
    return { ...media, readyAt: media.readyAt?.toString() ?? null };
  };
  const hasFailureType = (type: string) => (error: unknown) =>
    error instanceof ApplicationFailure && error.nonRetryable && error.type === type;

  try {
    const uploading = await createUploadingMedia();
    const uploadingState = await readMediaState(uploading.mediaId);
    const uuid = uploading.storageReference.slice('nexus:v1:'.length);
    const uploadId = `u_${uuid}`;
    assert.deepEqual(await prepareMediaUploadActivity(uploading), {
      id: uploadId,
      sourceKey: `uploads/${uploadId}/${uuid}`,
      contentType: 'image/jpeg',
    });
    assert.deepEqual(requests, [
      {
        authorization: 'Bearer test-api-key',
        method: 'HEAD',
        url: `/v1/uploads/${uploadId}?staging=true`,
      },
    ]);
    assert.deepEqual(await readMediaState(uploading.mediaId), uploadingState);

    await assert.rejects(
      prepareMediaUploadActivity({ ...uploading, accountId: crypto.randomUUID() }),
      hasFailureType('MediaUploadSessionInvalid'),
    );
    assert.deepEqual(await readMediaState(uploading.mediaId), uploadingState);

    const ready = await createUploadingMedia();
    await db
      .update(Media)
      .set({
        mediaType: 'image/webp',
        readyAt: Temporal.Now.instant(),
        state: MediaState.READY,
        url: 'https://media.example/ready.webp',
      })
      .where(eq(Media.id, ready.mediaId));
    const readyState = await readMediaState(ready.mediaId);
    await assert.rejects(
      prepareMediaUploadActivity(ready),
      hasFailureType('MediaUploadSessionInvalid'),
    );
    assert.deepEqual(await readMediaState(ready.mediaId), readyState);

    const invalidSource = await createUploadingMedia('nexus:v1:invalid');
    const invalidSourceState = await readMediaState(invalidSource.mediaId);
    await assert.rejects(
      prepareMediaUploadActivity(invalidSource),
      hasFailureType('NexusMediaUploadSourceError'),
    );
    assert.deepEqual(await readMediaState(invalidSource.mediaId), invalidSourceState);
    assert.equal(requests.length, 1);

    const transientFailure = await createUploadingMedia();
    const transientFailureState = await readMediaState(transientFailure.mediaId);
    headResponseStatus = 503;
    await assert.rejects(
      prepareMediaUploadActivity(transientFailure),
      (error: unknown) =>
        error instanceof Error &&
        !(error instanceof ApplicationFailure) &&
        error.message === 'Media Storage Service rejected upload metadata (503)',
    );
    const transientUuid = transientFailure.storageReference.slice('nexus:v1:'.length);
    assert.deepEqual(requests[1], {
      authorization: 'Bearer test-api-key',
      method: 'HEAD',
      url: `/v1/uploads/u_${transientUuid}?staging=true`,
    });
    assert.deepEqual(await readMediaState(transientFailure.mediaId), transientFailureState);
  } finally {
    stagingConfig.forEach(([key], index) => {
      const value = previousStagingConfig[index];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
    if (mediaIds.length > 0) {
      await db.delete(Media).where(inArray(Media.id, mediaIds));
    }
    await cleanupAccountDeletionFixture(fixture);
  }
});

test('Media Upload finalization은 세션을 검증하고 중복 및 동시 완료를 수렴시킨다', async () => {
  const fixture = await createAccountDeletionFixture({ profileStates: [ProfileState.ACTIVE] });
  const mediaIds: string[] = [];

  const createUploadingMedia = async () => {
    const referenceId = crypto.randomUUID();
    const media = await db
      .insert(Media)
      .values({
        accountId: fixture.account.id,
        profileId: fixture.profiles[0]!.id,
        source: MediaSource.LOCAL,
        state: MediaState.UPLOADING,
        storageReference: `nexus:v1:${referenceId}`,
        uploadExpiresAt: Temporal.Now.instant().add({ minutes: 10 }),
      })
      .returning({ id: Media.id })
      .then(firstOrThrow);
    mediaIds.push(media.id);
    return { mediaId: media.id, remoteUploadId: `u_${referenceId}` };
  };

  try {
    const { mediaId, remoteUploadId } = await createUploadingMedia();
    const result: MediaUploadWorkflowResult = {
      id: remoteUploadId,
      url: 'https://media.example/ready.webp',
      mediaType: 'image/webp',
    };
    const input: MediaUploadWorkflowInput & {
      readonly remoteUploadId: string;
      readonly result: MediaUploadWorkflowResult;
    } = {
      mediaId,
      accountId: fixture.account.id,
      remoteUploadId,
      result,
    };
    const expectNonRetryableFailure = (error: unknown) =>
      error instanceof ApplicationFailure && error.nonRetryable === true;

    await assert.rejects(
      finalizeMediaUploadActivity({ ...input, accountId: crypto.randomUUID() }),
      expectNonRetryableFailure,
    );
    await assert.rejects(
      finalizeMediaUploadActivity({ ...input, remoteUploadId: `u_${crypto.randomUUID()}` }),
      expectNonRetryableFailure,
    );
    await assert.rejects(
      finalizeMediaUploadActivity({
        ...input,
        result: { ...result, url: 'javascript:alert(1)' } as MediaUploadWorkflowResult,
      }),
      expectNonRetryableFailure,
    );

    const stillUploading = await db
      .select({ state: Media.state })
      .from(Media)
      .where(eq(Media.id, mediaId))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(stillUploading.state, MediaState.UPLOADING);

    assert.deepEqual(await finalizeMediaUploadActivity(input), result);
    const firstReady = await db
      .select({
        readyAt: Media.readyAt,
        state: Media.state,
      })
      .from(Media)
      .where(eq(Media.id, mediaId))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(firstReady.state, MediaState.READY);
    assert.ok(firstReady.readyAt);

    assert.deepEqual(await finalizeMediaUploadActivity(input), result);
    const retriedReady = await db
      .select({
        readyAt: Media.readyAt,
        state: Media.state,
      })
      .from(Media)
      .where(eq(Media.id, mediaId))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(retriedReady.state, MediaState.READY);
    assert.equal(retriedReady.readyAt?.toString(), firstReady.readyAt.toString());
    await assert.rejects(
      finalizeMediaUploadActivity({ ...input, remoteUploadId: `u_${crypto.randomUUID()}` }),
      expectNonRetryableFailure,
    );

    const nightshade = await createUploadingMedia();
    const nightshadeResult: MediaUploadWorkflowResult = {
      ...result,
      id: nightshade.remoteUploadId,
      url: 'https://media.example/nightshade.webp',
    };
    const nightshadeInput = {
      mediaId: nightshade.mediaId,
      accountId: fixture.account.id,
      remoteUploadId: nightshade.remoteUploadId,
      applyNightshade: true,
      result: nightshadeResult,
    };
    assert.deepEqual(await finalizeMediaUploadActivity(nightshadeInput), nightshadeResult);
    const nightshadeReady = await db
      .select({ state: Media.state })
      .from(Media)
      .where(eq(Media.id, nightshade.mediaId))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(nightshadeReady.state, MediaState.READY);
    assert.deepEqual(
      await finalizeMediaUploadActivity({ ...nightshadeInput, applyNightshade: false }),
      nightshadeResult,
    );

    const concurrent = await createUploadingMedia();
    const concurrentResult: MediaUploadWorkflowResult = {
      ...result,
      id: concurrent.remoteUploadId,
      url: 'https://media.example/concurrent.webp',
    };
    const concurrentInput = {
      mediaId: concurrent.mediaId,
      accountId: fixture.account.id,
      remoteUploadId: concurrent.remoteUploadId,
      result: concurrentResult,
    };
    assert.deepEqual(
      await Promise.all([
        finalizeMediaUploadActivity(concurrentInput),
        finalizeMediaUploadActivity(concurrentInput),
      ]),
      [concurrentResult, concurrentResult],
    );
    const converged = await db
      .select({ readyAt: Media.readyAt, state: Media.state, url: Media.url })
      .from(Media)
      .where(eq(Media.id, concurrent.mediaId))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(converged.state, MediaState.READY);
    assert.equal(converged.url, concurrentResult.url);
    assert.ok(converged.readyAt);
  } finally {
    if (mediaIds.length > 0) {
      await db.delete(Media).where(inArray(Media.id, mediaIds));
    }
    await cleanupAccountDeletionFixture(fixture);
  }
});

test('Local PostContent hashtag processing dry-run plans changes without writing rows', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const hashtagName = `dryrun${suffix}`;
  const fixture = await createPostContentReprocessingFixture({
    document: () => postContentDocumentFromText(`#${hashtagName}`),
  });

  try {
    const result = await reprocessLocalPostContentActivity({
      postContentId: fixture.content.id,
      postId: fixture.post.id,
    });

    assert.deepEqual(result, { status: 'wouldUpdate' });
    assert.equal(await db.$count(PostContents, eq(PostContents.postId, fixture.post.id)), 1);
    assert.equal(await db.$count(Hashtags, eq(Hashtags.name, hashtagName)), 0);
    assert.equal(
      await db.$count(
        PostContentHashtags,
        eq(PostContentHashtags.postContentId, fixture.content.id),
      ),
      0,
    );
    const current = await db
      .select({ currentContentId: Posts.currentContentId })
      .from(Posts)
      .where(eq(Posts.id, fixture.post.id))
      .then(firstOrThrow);
    assert.equal(current.currentContentId, fixture.content.id);
  } finally {
    await cleanupPostContentReprocessingFixture(fixture);
  }
});

test('Local PostContent hashtag processing preserves document state, repairs relations, and converges on retry', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const [existingHashtag, orphanHashtag, missingRelationHashtag] = await db
    .insert(Hashtags)
    .values([
      { name: `old${suffix}`, displayName: `Old${suffix}` },
      { name: `orphan${suffix}`, displayName: `Orphan${suffix}` },
      { name: `missing${suffix}`, displayName: `Missing${suffix}` },
    ])
    .returning();
  assert.ok(existingHashtag);
  assert.ok(orphanHashtag);
  assert.ok(missingRelationHashtag);
  const document = (mentionProfileIds: readonly string[]): PostContentDocumentV1 => ({
    version: 1,
    summary: 'content warning',
    body: {
      type: 'doc',
      attrs: { sensitiveMedia: true },
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'before ' },
            {
              type: 'mention',
              attrs: { handle: '@mentioned', profileId: mentionProfileIds[0]! },
            },
            { type: 'text', text: `#adjacent #Ｆoo${suffix} #foo${suffix} and ` },
            {
              type: 'text',
              text: 'https://example.com/path/#url',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/path/#url' } }],
            },
            { type: 'text', text: ' and ' },
            {
              type: 'text',
              text: '#linked-label',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/label' } }],
            },
            { type: 'text', text: ' ' },
            {
              type: 'hashtag',
              attrs: { hashtagId: existingHashtag.id, token: `#old${suffix}` },
            },
            { type: 'text', text: ' ' },
            {
              type: 'hashtag',
              attrs: { hashtagId: missingRelationHashtag.id, token: `#missing${suffix}` },
            },
          ],
        },
        { type: 'media', attrs: { mediaId: crypto.randomUUID() } },
      ],
    },
  });
  const fixture = await createPostContentReprocessingFixture({
    document,
    hashtagIds: [existingHashtag.id, orphanHashtag.id],
    mentionCount: 2,
    visibility: PostVisibility.DIRECT,
  });

  try {
    const sourcePost = await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, fixture.post.id))
      .then(firstOrThrow);
    const sourceMentions = await db
      .select({ profileId: PostMentions.profileId })
      .from(PostMentions)
      .where(eq(PostMentions.postContentId, fixture.content.id));
    assert.equal(sourceMentions.length, 2);

    const result = await reprocessLocalPostContentActivity({
      dryRun: false,
      postContentId: fixture.content.id,
      postId: fixture.post.id,
    });
    assert.deepEqual(result, { status: 'updated' });

    const updatedPost = await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, fixture.post.id))
      .then(firstOrThrow);
    assert.notEqual(updatedPost.currentContentId, fixture.content.id);
    assert.deepEqual({ ...updatedPost, currentContentId: sourcePost.currentContentId }, sourcePost);
    const updatedContent = await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.id, updatedPost.currentContentId!))
      .then(firstOrThrow);
    assert.equal(updatedContent.postId, fixture.post.id);
    assert.ok(Temporal.Instant.compare(updatedContent.createdAt, fixture.content.createdAt) > 0);
    assert.equal(
      postContentDocumentToText(updatedContent.document),
      postContentDocumentToText(fixture.content.document),
    );
    assert.equal(updatedContent.document.summary, fixture.content.document.summary);
    assert.deepEqual(updatedContent.document.body.attrs, fixture.content.document.body.attrs);
    assert.deepEqual(
      updatedContent.document.body.content.at(-1),
      fixture.content.document.body.content.at(-1),
    );

    const hashtagNodes = updatedContent.document.body.content.flatMap((block) =>
      block.type === 'paragraph'
        ? (block.content ?? []).flatMap((node) =>
            node.type === 'hashtag'
              ? [{ hashtagId: node.attrs.hashtagId, token: node.attrs.token }]
              : [],
          )
        : [],
    );
    const foo = await db
      .select()
      .from(Hashtags)
      .where(eq(Hashtags.name, `foo${suffix}`))
      .then(firstOrThrow);
    assert.equal(foo.displayName, `Foo${suffix}`);
    assert.deepEqual(hashtagNodes, [
      { hashtagId: foo.id, token: `#Ｆoo${suffix}` },
      { hashtagId: foo.id, token: `#foo${suffix}` },
      { hashtagId: existingHashtag.id, token: `#old${suffix}` },
      { hashtagId: missingRelationHashtag.id, token: `#missing${suffix}` },
    ]);
    const updatedRelations = await db
      .select({ hashtagId: PostContentHashtags.hashtagId })
      .from(PostContentHashtags)
      .where(eq(PostContentHashtags.postContentId, updatedContent.id));
    assert.deepEqual(
      updatedRelations.map(({ hashtagId }) => hashtagId).sort(),
      [existingHashtag.id, missingRelationHashtag.id, foo.id].sort(),
    );
    assert.deepEqual(
      await db
        .select({ hashtagId: PostContentHashtags.hashtagId })
        .from(PostContentHashtags)
        .where(eq(PostContentHashtags.postContentId, fixture.content.id))
        .then((rows) => rows.map(({ hashtagId }) => hashtagId).sort()),
      [existingHashtag.id, orphanHashtag.id].sort(),
    );
    assert.deepEqual(
      await db
        .select({ profileId: PostMentions.profileId })
        .from(PostMentions)
        .where(eq(PostMentions.postContentId, updatedContent.id))
        .then((rows) => rows.map(({ profileId }) => profileId).sort()),
      sourceMentions.map(({ profileId }) => profileId).sort(),
    );

    assert.deepEqual(
      await reprocessLocalPostContentActivity({
        dryRun: false,
        postContentId: fixture.content.id,
        postId: fixture.post.id,
      }),
      { status: 'skipped' },
    );
    const contentCount = await db.$count(PostContents, eq(PostContents.postId, fixture.post.id));
    assert.deepEqual(
      await reprocessLocalPostContentActivity({
        dryRun: false,
        postContentId: updatedContent.id,
        postId: fixture.post.id,
      }),
      { status: 'unchanged' },
    );
    assert.equal(
      await db.$count(PostContents, eq(PostContents.postId, fixture.post.id)),
      contentCount,
    );
  } finally {
    await cleanupPostContentReprocessingFixture(fixture);
    await db.delete(Hashtags).where(eq(Hashtags.id, missingRelationHashtag.id));
  }
});

test('Local PostContent hashtag processing repairs relations without changing the document', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const hashtag = await db
    .insert(Hashtags)
    .values({ name: `relationonly${suffix}`, displayName: `Relationonly${suffix}` })
    .returning()
    .then(firstOrThrow);
  const document: PostContentDocumentV1 = {
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'hashtag', attrs: { hashtagId: hashtag.id, token: `#relationonly${suffix}` } },
          ],
        },
      ],
    },
  };
  const fixture = await createPostContentReprocessingFixture({ document: () => document });

  try {
    const sourceRelationRows = await db
      .select({ hashtagId: PostContentHashtags.hashtagId })
      .from(PostContentHashtags)
      .where(eq(PostContentHashtags.postContentId, fixture.content.id));
    assert.deepEqual(sourceRelationRows, []);

    assert.deepEqual(
      await reprocessLocalPostContentActivity({
        postContentId: fixture.content.id,
        postId: fixture.post.id,
      }),
      { status: 'wouldUpdate' },
    );
    assert.equal(await db.$count(PostContents, eq(PostContents.postId, fixture.post.id)), 1);
    assert.deepEqual(
      await db
        .select({ hashtagId: PostContentHashtags.hashtagId })
        .from(PostContentHashtags)
        .where(eq(PostContentHashtags.postContentId, fixture.content.id)),
      sourceRelationRows,
    );
    const dryRunPost = await db
      .select({ currentContentId: Posts.currentContentId })
      .from(Posts)
      .where(eq(Posts.id, fixture.post.id))
      .then(firstOrThrow);
    assert.equal(dryRunPost.currentContentId, fixture.content.id);

    assert.deepEqual(
      await reprocessLocalPostContentActivity({
        dryRun: false,
        postContentId: fixture.content.id,
        postId: fixture.post.id,
      }),
      { status: 'updated' },
    );
    const updatedPost = await db
      .select({ currentContentId: Posts.currentContentId })
      .from(Posts)
      .where(eq(Posts.id, fixture.post.id))
      .then(firstOrThrow);
    assert.notEqual(updatedPost.currentContentId, fixture.content.id);
    const updatedContent = await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.id, updatedPost.currentContentId!))
      .then(firstOrThrow);
    assert.deepEqual(updatedContent.document, fixture.content.document);
    const oldContent = await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.id, fixture.content.id))
      .then(firstOrThrow);
    assert.deepEqual(oldContent.document, fixture.content.document);
    assert.deepEqual(
      await db
        .select({ hashtagId: PostContentHashtags.hashtagId })
        .from(PostContentHashtags)
        .where(eq(PostContentHashtags.postContentId, updatedContent.id)),
      [{ hashtagId: hashtag.id }],
    );
    assert.deepEqual(
      await db
        .select({ hashtagId: PostContentHashtags.hashtagId })
        .from(PostContentHashtags)
        .where(eq(PostContentHashtags.postContentId, fixture.content.id)),
      sourceRelationRows,
    );
    assert.equal(await db.$count(PostContents, eq(PostContents.postId, fixture.post.id)), 2);

    assert.deepEqual(
      await reprocessLocalPostContentActivity({
        dryRun: false,
        postContentId: updatedContent.id,
        postId: fixture.post.id,
      }),
      { status: 'unchanged' },
    );
    assert.equal(await db.$count(PostContents, eq(PostContents.postId, fixture.post.id)), 2);
  } finally {
    await cleanupPostContentReprocessingFixture(fixture);
    await db.delete(Hashtags).where(eq(Hashtags.id, hashtag.id));
  }
});

test('Local PostContent reprocessing and candidate paging include only active Local Posts', async () => {
  const local = await createPostContentReprocessingFixture({
    document: () => postContentDocumentFromText('local'),
  });
  const remote = await createPostContentReprocessingFixture({
    document: () => postContentDocumentFromText('remote'),
    kind: InstanceKind.ACTIVITYPUB,
  });
  const deleted = await createPostContentReprocessingFixture({
    document: () => postContentDocumentFromText('deleted'),
    postState: PostState.DELETED,
  });

  try {
    const page = await loadLocalPostsForContentReprocessingActivity({ limit: 50 });
    assert.equal(page.maxPostId, local.post.id);
    assert.deepEqual(page.posts, [{ postContentId: local.content.id, postId: local.post.id }]);
    assert.deepEqual(
      await reprocessLocalPostContentActivity({
        dryRun: false,
        postContentId: remote.content.id,
        postId: remote.post.id,
      }),
      { status: 'skipped' },
    );
    assert.deepEqual(
      await reprocessLocalPostContentActivity({
        dryRun: false,
        postContentId: deleted.content.id,
        postId: deleted.post.id,
      }),
      { status: 'skipped' },
    );
    assert.equal(await db.$count(PostContents, eq(PostContents.postId, remote.post.id)), 1);
    assert.equal(await db.$count(PostContents, eq(PostContents.postId, deleted.post.id)), 1);
  } finally {
    await cleanupPostContentReprocessingFixture(local);
    await cleanupPostContentReprocessingFixture(remote);
    await cleanupPostContentReprocessingFixture(deleted);
  }
});

test('Local PostContent reprocessing rolls back all writes after losing the current-content CAS', async () => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const hashtagName = `race${suffix}`;
  const fixture = await createPostContentReprocessingFixture({
    document: () => postContentDocumentFromText(`#${hashtagName}`),
  });
  const competingContent = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText('competing revision'),
      postId: fixture.post.id,
    })
    .returning()
    .then(firstOrThrow);
  const concurrentUpdate = await pg.reserve();
  let transactionHeld = false;
  let activity: ReturnType<typeof reprocessLocalPostContentActivity> | undefined;

  try {
    await concurrentUpdate`BEGIN`;
    transactionHeld = true;
    const [{ pid }] = await concurrentUpdate<{ pid: number }[]>`
      SELECT pg_backend_pid()::int AS pid
    `;
    await concurrentUpdate`
      UPDATE post SET current_content_id = ${competingContent.id} WHERE id = ${fixture.post.id}
    `;
    activity = reprocessLocalPostContentActivity({
      dryRun: false,
      postContentId: fixture.content.id,
      postId: fixture.post.id,
    });

    let blocked = false;
    for (let attempt = 0; attempt < 250; attempt += 1) {
      const [activityState] = await pg<{ blocked: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE ${pid} = ANY(pg_blocking_pids(pid))
        ) AS blocked
      `;
      if (activityState?.blocked) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(blocked, 'PostContent reprocessing must reach the competing pointer update');
    await concurrentUpdate`COMMIT`;
    transactionHeld = false;

    assert.deepEqual(await activity, { status: 'skipped' });
    const current = await db
      .select({ currentContentId: Posts.currentContentId })
      .from(Posts)
      .where(eq(Posts.id, fixture.post.id))
      .then(firstOrThrow);
    assert.equal(current.currentContentId, competingContent.id);
    assert.equal(await db.$count(PostContents, eq(PostContents.postId, fixture.post.id)), 2);
    assert.equal(await db.$count(Hashtags, eq(Hashtags.name, hashtagName)), 0);
    assert.equal(
      await db.$count(
        PostContentHashtags,
        eq(PostContentHashtags.postContentId, competingContent.id),
      ),
      0,
    );
  } finally {
    if (transactionHeld) {
      await concurrentUpdate`ROLLBACK`;
    }
    if (activity) {
      await Promise.allSettled([activity]);
    }
    concurrentUpdate.release();
    await cleanupPostContentReprocessingFixture(fixture);
  }
});

type PostContentReprocessingFixture = {
  readonly content: typeof CoreDb.PostContents.$inferSelect;
  readonly hashtagIds: readonly string[];
  readonly instanceId: string;
  readonly mentionProfileIds: readonly string[];
  readonly post: typeof CoreDb.Posts.$inferSelect;
  readonly profileId: string;
};

const createPostContentReprocessingFixture = async ({
  document,
  hashtagIds = [],
  kind = InstanceKind.LOCAL,
  mentionCount = 0,
  postState = PostState.ACTIVE,
  visibility = PostVisibility.DIRECT,
}: {
  readonly document: (mentionProfileIds: readonly string[]) => PostContentDocumentV1;
  readonly hashtagIds?: readonly string[];
  readonly kind?: InstanceKind;
  readonly mentionCount?: number;
  readonly postState?: PostState;
  readonly visibility?: PostVisibility;
}): Promise<PostContentReprocessingFixture> => {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const profile = await createProfile({ accountId: null, instanceKind: kind });
  const createMentionProfile = (handleSuffix: string) =>
    db
      .insert(Profiles)
      .values({
        displayName: handleSuffix,
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: handleSuffix,
        normalizedHandle: handleSuffix,
        instanceId: profile.instanceId,
        state: ProfileState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
  const mentionProfiles = await Promise.all(
    Array.from({ length: mentionCount }, (_, index) =>
      createMentionProfile(`${suffix}-mention-${index}`),
    ),
  );
  const content = await db
    .insert(PostContents)
    .values({ document: document(mentionProfiles.map(({ id }) => id)), postId: null })
    .returning()
    .then(firstOrThrow);
  const post = await db
    .insert(Posts)
    .values({
      currentContentId: content.id,
      profileId: profile.id,
      state: postState,
      visibility,
    })
    .returning()
    .then(firstOrThrow);
  await db.update(PostContents).set({ postId: post.id }).where(eq(PostContents.id, content.id));
  if (mentionProfiles.length > 0) {
    await db
      .insert(PostMentions)
      .values(mentionProfiles.map(({ id }) => ({ postContentId: content.id, profileId: id })));
  }
  if (hashtagIds.length > 0) {
    await db
      .insert(PostContentHashtags)
      .values(hashtagIds.map((hashtagId) => ({ hashtagId, postContentId: content.id })));
  }
  return {
    content,
    hashtagIds,
    instanceId: profile.instanceId,
    mentionProfileIds: mentionProfiles.map(({ id }) => id),
    post,
    profileId: profile.id,
  };
};

const cleanupPostContentReprocessingFixture = async (
  fixture: PostContentReprocessingFixture,
): Promise<void> => {
  const contents = await db
    .select({ id: PostContents.id })
    .from(PostContents)
    .where(eq(PostContents.postId, fixture.post.id));
  const contentIds = [...new Set([fixture.content.id, ...contents.map(({ id }) => id)])];
  const relatedHashtags =
    contentIds.length === 0
      ? []
      : await db
          .select({ hashtagId: PostContentHashtags.hashtagId })
          .from(PostContentHashtags)
          .where(inArray(PostContentHashtags.postContentId, contentIds))
          .then((rows) => rows.map(({ hashtagId }) => hashtagId));
  await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, fixture.post.id));
  await db.update(PostContents).set({ postId: null }).where(inArray(PostContents.id, contentIds));
  await db.delete(Posts).where(eq(Posts.id, fixture.post.id));
  await db.delete(PostContents).where(inArray(PostContents.id, contentIds));
  await db
    .delete(Profiles)
    .where(inArray(Profiles.id, [fixture.profileId, ...fixture.mentionProfileIds]));
  await db.delete(Instances).where(eq(Instances.id, fixture.instanceId));
  const hashtagIds = [...new Set([...fixture.hashtagIds, ...relatedHashtags])];
  if (hashtagIds.length > 0) {
    await db.delete(Hashtags).where(inArray(Hashtags.id, hashtagIds));
  }
};
