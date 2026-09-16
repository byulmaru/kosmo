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
import { eq, inArray } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type {
  createPost as CreatePost,
  deletePost as DeletePost,
  repostPost as RepostPost,
} from '@kosmo/core/services';
import type {
  createQuoteNotificationActivity as CreateQuoteNotificationActivity,
  createReactionNotificationActivity as CreateReactionNotificationActivity,
  createReplyNotificationActivity as CreateReplyNotificationActivity,
  createRepostNotificationActivity as CreateRepostNotificationActivity,
  deleteAccountActivity as DeleteAccountActivity,
  deleteReactionNotificationActivity as DeleteReactionNotificationActivity,
  deleteRepostNotificationActivity as DeleteRepostNotificationActivity,
} from './activities';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

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
    createReactionNotificationActivity,
    createQuoteNotificationActivity,
    createReplyNotificationActivity,
    createRepostNotificationActivity,
    deleteAccountActivity,
    deleteReactionNotificationActivity,
    deleteRepostNotificationActivity,
  } = await import('./activities'));
  ({ createPost: createCorePost, deletePost, repostPost } = await import('@kosmo/core/services'));
  await db
    .insert(NotificationRollouts)
    .values({ key: 'QUOTE_NOTIFICATION', activatedAt: Temporal.Now.instant() })
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

test('Quote가 Reply 관계도 가진 경우 먼저 확정된 Quote 대표를 Reply가 바꾸지 않는다', async () => {
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

  await createQuoteNotificationActivity(quote.id);
  await createReplyNotificationActivity(quote.id);

  const notifications = await db.select().from(Notifications);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.QUOTE);
  assert.equal(notifications[0]?.sourceId, quote.id);
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

const createProfile = async ({ state = ProfileState.ACTIVE }: { state?: ProfileState } = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
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
