import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Instances,
  NotificationQuoteJudgments,
  Notifications,
  pg,
  PostContents,
  PostMentions,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  ProfileMutes,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import {
  postContentDocumentFromText,
  postContentDocumentFromTextAndMedia,
} from '../post-content/server';
import { notificationSourceAvailabilityWhere } from '../visibility/notification';
import { createReplyNotification } from './create-reply-notification';
import { createMentionNotification } from './mention-notification';
import { createPostPersisted } from './post';
import { createQuoteNotification } from './quote-notification';

const instanceIds: string[] = [];
const profileIds: string[] = [];
const postIds: string[] = [];
const accountIds: string[] = [];
const accountIdsByProfile = new Map<string, string>();

const createProfile = async (kind: InstanceKind = InstanceKind.LOCAL) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind, state: InstanceState.ACTIVE })
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
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);
  if (kind === InstanceKind.LOCAL) {
    const account = await db
      .insert(Accounts)
      .values({ displayName: suffix, oidcSubject: `subject-${suffix}`, state: AccountState.ACTIVE })
      .returning()
      .then(firstOrThrow);
    accountIds.push(account.id);
    accountIdsByProfile.set(profile.id, account.id);
    await db.insert(AccountProfiles).values({
      accountId: account.id,
      profileId: profile.id,
      role: AccountProfileRole.OWNER,
    });
  }
  return profile;
};

const createTestPost = async ({
  authorProfileId,
  mentionProfileIds = [],
  replyParentId,
  visibility = PostVisibility.PUBLIC,
}: {
  readonly authorProfileId: string;
  readonly mentionProfileIds?: readonly string[];
  readonly replyParentId?: string;
  readonly visibility?: PostVisibility;
}) => {
  const result = await createPostPersisted({
    document: postContentDocumentFromText(`mention ${crypto.randomUUID()}`),
    mentionProfileIds,
    objectUri: `https://remote.example/notes/${crypto.randomUUID()}`,
    origin: 'ACTIVITYPUB',
    profileId: authorProfileId,
    publishedAt: null,
    receivedAt: Temporal.Now.instant(),
    replyParentId,
    visibility,
  });
  if (!result.created) {
    throw new Error('Expected inbound ActivityPub Post to be created.');
  }
  postIds.push(result.post.id);
  return result.post;
};

const createPostForLocal = async (
  profileId: string,
  {
    mentionProfileIds = [],
    replyParentId,
    repostSourceId,
    visibility = PostVisibility.PUBLIC,
  }: {
    readonly mentionProfileIds?: readonly string[];
    readonly replyParentId?: string;
    readonly repostSourceId?: string;
    readonly visibility?: PostVisibility;
  } = {},
) => {
  const uniqueMentionProfileIds = [...new Set(mentionProfileIds)];
  const mentionedProfiles =
    uniqueMentionProfileIds.length === 0
      ? []
      : await db
          .select({ id: Profiles.id, handle: Profiles.handle })
          .from(Profiles)
          .where(inArray(Profiles.id, uniqueMentionProfileIds));
  const mentionProfilesById = new Map(mentionedProfiles.map((profile) => [profile.id, profile]));
  let bodyText = `local mention ${crypto.randomUUID()}`;
  const mentions = uniqueMentionProfileIds.map((mentionProfileId) => {
    const profile = mentionProfilesById.get(mentionProfileId);
    if (!profile) {
      throw new Error(`Mention fixture Profile ${mentionProfileId} does not exist`);
    }
    const relativeHandle = `@${profile.handle}`;
    bodyText += ` ${relativeHandle}`;
    const end = bodyText.length;
    return {
      end,
      handle: relativeHandle,
      profileId: profile.id,
      relativeHandle,
      start: end - relativeHandle.length,
    };
  });

  const result = await createPostPersisted({
    accountId: accountIdsByProfile.get(profileId),
    bodyText,
    mentions,
    origin: 'LOCAL',
    profileId,
    replyParentId,
    repostSourceId,
    visibility,
  });
  if (!result.created) {
    throw new Error('Expected local Post to be created.');
  }
  postIds.push(result.post.id);
  return result.post;
};

const addAccountToProfile = async (profileId: string) => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: `subject-${suffix}`, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  accountIds.push(account.id);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId,
    role: AccountProfileRole.MEMBER,
  });
  return account.id;
};

const readSourceNotifications = (sourceId: string) =>
  db.select().from(Notifications).where(eq(Notifications.sourceId, sourceId));

const isAvailable = async (notificationId: string, includeRecipientAvailability: boolean) =>
  (
    await db
      .select({ id: Notifications.id })
      .from(Notifications)
      .where(
        and(
          eq(Notifications.id, notificationId),
          notificationSourceAvailabilityWhere(db, { includeRecipientAvailability }),
        ),
      )
  ).length > 0;

after(async () => {
  try {
    if (postIds.length > 0) {
      await db
        .delete(NotificationQuoteJudgments)
        .where(inArray(NotificationQuoteJudgments.quotePostId, postIds));
      await db.delete(Notifications).where(inArray(Notifications.sourceId, postIds));
      await db
        .update(Posts)
        .set({ currentContentId: null, replyParentId: null, repostSourceId: null })
        .where(inArray(Posts.id, postIds));
      await db.delete(PostContents).where(inArray(PostContents.postId, postIds));
      await db.delete(Posts).where(inArray(Posts.id, postIds));
    }
    if (profileIds.length > 0) {
      await db
        .delete(ProfileFollows)
        .where(
          or(
            inArray(ProfileFollows.followerProfileId, profileIds),
            inArray(ProfileFollows.followeeProfileId, profileIds),
          ),
        );
      await db
        .delete(ProfileBlocks)
        .where(
          or(
            inArray(ProfileBlocks.ownerProfileId, profileIds),
            inArray(ProfileBlocks.targetProfileId, profileIds),
          ),
        );
      await db
        .delete(ProfileMutes)
        .where(
          or(
            inArray(ProfileMutes.ownerProfileId, profileIds),
            inArray(ProfileMutes.targetProfileId, profileIds),
          ),
        );
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

test('Operational notification visibility follows recipient Account state while cleanup bypasses it', async () => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: `subject-${suffix}`, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  accountIds.push(account.id);
  const notification = await db
    .insert(Notifications)
    .values({
      data: { href: '/maintenance', title: 'Scheduled maintenance' },
      kind: NotificationKind.OPERATIONAL,
      recipientAccountId: account.id,
      sourceId: crypto.randomUUID(),
    })
    .returning()
    .then(firstOrThrow);

  assert.equal(await isAvailable(notification.id, true), true);

  await db
    .update(Accounts)
    .set({ state: AccountState.SUSPENDED })
    .where(eq(Accounts.id, account.id));
  assert.equal(await isAvailable(notification.id, true), false);

  await db
    .update(Accounts)
    .set({ state: AccountState.DISABLED })
    .where(eq(Accounts.id, account.id));
  assert.equal(await isAvailable(notification.id, true), false);
  assert.equal(await isAvailable(notification.id, false), true);
});

test('social Notifications store Account and Profile recipients while Operational rows are Account-only', async () => {
  const profile = await createProfile();
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: `subject-${suffix}`, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  accountIds.push(account.id);

  const insertNotification = (
    recipientProfileId: string | null,
    recipientAccountId: string,
    kind: NotificationKind = NotificationKind.MENTION,
  ) =>
    db
      .insert(Notifications)
      .values({ kind, recipientAccountId, recipientProfileId, sourceId: crypto.randomUUID() })
      .returning()
      .then(firstOrThrow);
  const socialAccountId = accountIdsByProfile.get(profile.id)!;
  const profileNotification = await insertNotification(profile.id, socialAccountId);
  const accountNotification = await insertNotification(
    null,
    account.id,
    NotificationKind.OPERATIONAL,
  );
  assert.equal(profileNotification.kind, NotificationKind.MENTION);
  assert.equal(profileNotification.recipientProfileId, profile.id);
  assert.equal(profileNotification.recipientAccountId, socialAccountId);
  assert.equal(accountNotification.kind, NotificationKind.OPERATIONAL);
  assert.equal(accountNotification.recipientAccountId, account.id);
});

test('inbound typed Mention is per visible local Profile and concurrent retries return the stored IDs', async () => {
  const author = await createProfile(InstanceKind.ACTIVITYPUB);
  const follower = await createProfile();
  const followerAccountIds = [
    accountIdsByProfile.get(follower.id)!,
    await addAccountToProfile(follower.id),
  ];
  const nonFollower = await createProfile();
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: author.id,
  });
  const post = await createTestPost({
    authorProfileId: author.id,
    mentionProfileIds: [follower.id, nonFollower.id],
    visibility: PostVisibility.FOLLOWERS,
  });

  const [firstIds, retryIds] = await Promise.all([
    createMentionNotification(post.id),
    createMentionNotification(post.id),
  ]);
  const notifications = await readSourceNotifications(post.id);

  assert.equal(notifications.length, 2);
  assert.ok(
    notifications.every(
      ({ kind, recipientProfileId }) =>
        kind === NotificationKind.MENTION && recipientProfileId === follower.id,
    ),
  );
  assert.deepEqual(
    notifications.map(({ recipientAccountId }) => recipientAccountId).sort(),
    [...followerAccountIds].sort(),
  );
  const expectedIds = notifications.map(({ id }) => id).sort();
  assert.deepEqual(firstIds.slice().sort(), expectedIds);
  assert.deepEqual(retryIds.slice().sort(), expectedIds);
  assert.ok(notifications.every(({ readAt }) => readAt === null));

  const readAt = Temporal.Instant.from('2026-10-02T01:23:45.123456Z');
  await db.update(Notifications).set({ readAt }).where(inArray(Notifications.id, expectedIds));
  assert.deepEqual((await createMentionNotification(post.id)).slice().sort(), expectedIds);
  const retried = await readSourceNotifications(post.id);
  assert.deepEqual(
    retried
      .map(({ id, createdAt, readAt: persistedReadAt }) => ({
        id,
        createdAt: createdAt.toString(),
        readAt: persistedReadAt?.toString(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    notifications
      .map(({ id, createdAt }) => ({
        id,
        createdAt: createdAt.toString(),
        readAt: readAt.toString(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
});

test('a valid parent-author Reply represents only its own recipient; an ineligible Reply does not consume another Mention', async () => {
  const author = await createProfile(InstanceKind.ACTIVITYPUB);
  const parentAuthor = await createProfile();
  const otherMentioned = await createProfile();
  const parent = await createPostForLocal(parentAuthor.id);
  const reply = await createTestPost({
    authorProfileId: author.id,
    mentionProfileIds: [parentAuthor.id, otherMentioned.id],
    replyParentId: parent.id,
  });

  const mentionIds = await createMentionNotification(reply.id);
  const notifications = await readSourceNotifications(reply.id);
  assert.equal(
    notifications.find(({ recipientProfileId }) => recipientProfileId === parentAuthor.id)?.kind,
    NotificationKind.REPLY,
  );
  assert.equal(
    notifications.find(({ recipientProfileId }) => recipientProfileId === otherMentioned.id)?.kind,
    NotificationKind.MENTION,
  );
  assert.equal(notifications.length, 2);
  assert.equal(mentionIds.length, 1);
  assert.equal(
    notifications.find(({ kind }) => kind === NotificationKind.MENTION)?.id,
    mentionIds[0],
  );

  const remoteParentAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const remoteParent = await createTestPost({ authorProfileId: remoteParentAuthor.id });
  const localMentioned = await createProfile();
  const replyToRemotePost = await createTestPost({
    authorProfileId: author.id,
    mentionProfileIds: [localMentioned.id],
    replyParentId: remoteParent.id,
  });

  assert.equal((await createMentionNotification(replyToRemotePost.id)).length, 1);
  const fallthrough = await readSourceNotifications(replyToRemotePost.id);
  assert.equal(fallthrough.length, 1);
  assert.equal(fallthrough[0]?.kind, NotificationKind.MENTION);
  assert.equal(fallthrough[0]?.recipientProfileId, localMentioned.id);
});

test('a tombstoned Reply parent does not suppress its typed Mention', async () => {
  const author = await createProfile(InstanceKind.ACTIVITYPUB);
  const recipient = await createProfile();
  const parent = await createPostForLocal(recipient.id);
  const reply = await createTestPost({
    authorProfileId: author.id,
    mentionProfileIds: [recipient.id],
    replyParentId: parent.id,
  });

  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, parent.id));

  assert.deepEqual(await createReplyNotification(reply.id), []);
  assert.deepEqual(await readSourceNotifications(reply.id), []);

  const mentionIds = await createMentionNotification(reply.id);
  const notifications = await readSourceNotifications(reply.id);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.MENTION);
  assert.equal(notifications[0]?.recipientProfileId, recipient.id);
  assert.deepEqual(mentionIds, [notifications[0]?.id]);
});

test('a local typed Mention materializes idempotently while a local Post without the relation is a no-op', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const localMention = await createPostForLocal(author.id, { mentionProfileIds: [recipient.id] });
  const localPostWithoutMention = await createPostForLocal(author.id);

  const [notificationId] = await createMentionNotification(localMention.id);
  assert.ok(notificationId);
  assert.deepEqual(await createMentionNotification(localMention.id), [notificationId]);
  assert.deepEqual(await createMentionNotification(localPostWithoutMention.id), []);

  const notifications = await readSourceNotifications(localMention.id);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.MENTION);
  assert.equal(notifications[0]?.recipientProfileId, recipient.id);
  assert.deepEqual(await readSourceNotifications(localPostWithoutMention.id), []);

  const readAt = Temporal.Instant.from('2026-10-02T01:23:45.123456Z');
  await db.update(Notifications).set({ readAt }).where(eq(Notifications.id, notificationId));
  assert.deepEqual(await createMentionNotification(localMention.id), [notificationId]);
  const [preserved] = await readSourceNotifications(localMention.id);
  assert.equal(preserved?.readAt?.toString(), readAt.toString());
});

test('a self-Mention does not notify its sole posting Account', async () => {
  const profile = await createProfile();
  const actorAccountId = accountIdsByProfile.get(profile.id)!;
  const post = await createPostForLocal(profile.id, { mentionProfileIds: [profile.id] });

  const [storedPost] = await db
    .select({ actorAccountId: Posts.actorAccountId })
    .from(Posts)
    .where(eq(Posts.id, post.id));

  assert.equal(storedPost?.actorAccountId, actorAccountId);
  assert.deepEqual(await createMentionNotification(post.id), []);
  assert.deepEqual(await readSourceNotifications(post.id), []);
});

test('a self-Mention excludes the posting Account but keeps another Account on that Profile', async () => {
  const profile = await createProfile();
  const actorAccountId = accountIdsByProfile.get(profile.id)!;
  const otherAccountId = await addAccountToProfile(profile.id);
  const post = await createPostForLocal(profile.id, { mentionProfileIds: [profile.id] });

  const notificationIds = await createMentionNotification(post.id);
  const notifications = await readSourceNotifications(post.id);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.MENTION);
  assert.equal(notifications[0]?.recipientProfileId, profile.id);
  assert.equal(notifications[0]?.recipientAccountId, otherAccountId);
  assert.ok(!notifications.some(({ recipientAccountId }) => recipientAccountId === actorAccountId));
  assert.deepEqual(notificationIds, [notifications[0]?.id]);
});

test('an eligible Mention wins over Quote from either start order and during concurrent generation', async () => {
  const recipient = await createProfile();
  const quoteAuthor = await createProfile();

  const quoteFirstSource = await createPostForLocal(recipient.id);
  const quoteFirst = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: quoteFirstSource.id,
  });
  const quoteFirstId = await createQuoteNotification(quoteFirst.id);
  assert.deepEqual(quoteFirstId, []);
  const quoteFirstNotifications = await readSourceNotifications(quoteFirst.id);
  assert.equal(quoteFirstNotifications.length, 1);
  const [quoteFirstNotification] = quoteFirstNotifications;
  assert.equal(quoteFirstNotification?.kind, NotificationKind.MENTION);
  assert.deepEqual(await createMentionNotification(quoteFirst.id), [quoteFirstNotification!.id]);

  const mentionFirstSource = await createPostForLocal(recipient.id);
  const mentionFirst = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: mentionFirstSource.id,
  });
  const [mentionFirstMentionId] = await createMentionNotification(mentionFirst.id);
  assert.ok(mentionFirstMentionId);
  const mentionFirstQuoteId = await createQuoteNotification(mentionFirst.id);
  assert.deepEqual(mentionFirstQuoteId, []);
  const mentionFirstNotifications = await readSourceNotifications(mentionFirst.id);
  assert.equal(mentionFirstNotifications.length, 1);
  const [mentionFirstNotification] = mentionFirstNotifications;
  assert.equal(mentionFirstNotification?.kind, NotificationKind.MENTION);
  assert.equal(mentionFirstNotification?.id, mentionFirstMentionId);

  const concurrentSource = await createPostForLocal(recipient.id);
  const concurrent = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: concurrentSource.id,
  });
  const [concurrentQuoteId, concurrentMentionIds] = await Promise.all([
    createQuoteNotification(concurrent.id),
    createMentionNotification(concurrent.id),
  ]);
  assert.deepEqual(concurrentQuoteId, []);
  assert.equal(concurrentMentionIds.length, 1);
  const concurrentNotifications = await readSourceNotifications(concurrent.id);
  assert.equal(concurrentNotifications.length, 1);
  const [concurrentNotification] = concurrentNotifications;
  assert.equal(concurrentNotification?.kind, NotificationKind.MENTION);
  assert.equal(concurrentNotification?.id, concurrentMentionIds[0]);
});

test('a non-Source Author Mention does not displace the Quote', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const otherRecipient = await createProfile();
  const source = await createPostForLocal(sourceAuthor.id);
  const quote = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [otherRecipient.id],
    repostSourceId: source.id,
  });

  const [quoteId] = await createQuoteNotification(quote.id);
  assert.ok(quoteId);
  const afterQuote = await readSourceNotifications(quote.id);
  assert.deepEqual(
    afterQuote.map(({ kind, recipientProfileId }) => ({ kind, recipientProfileId })),
    [{ kind: NotificationKind.QUOTE, recipientProfileId: sourceAuthor.id }],
  );

  const [mentionId] = await createMentionNotification(quote.id);
  assert.ok(mentionId);
  const notifications = await readSourceNotifications(quote.id);
  assert.equal(notifications.length, 2);
  assert.ok(
    notifications.some(
      ({ kind, recipientProfileId }) =>
        kind === NotificationKind.QUOTE && recipientProfileId === sourceAuthor.id,
    ),
  );
  assert.ok(
    notifications.some(
      ({ kind, recipientProfileId }) =>
        kind === NotificationKind.MENTION && recipientProfileId === otherRecipient.id,
    ),
  );
});

test('a Direct Quote materializes its eligible Source Author Mention', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createPostForLocal(sourceAuthor.id);
  const quote = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [sourceAuthor.id],
    repostSourceId: source.id,
  });
  await db.update(Posts).set({ visibility: PostVisibility.DIRECT }).where(eq(Posts.id, quote.id));

  assert.deepEqual(await createQuoteNotification(quote.id), []);
  const [notification] = await readSourceNotifications(quote.id);
  assert.equal(notification?.kind, NotificationKind.MENTION);
  assert.equal(notification?.recipientProfileId, sourceAuthor.id);
  assert.ok(notification);
  assert.deepEqual(await createMentionNotification(quote.id), [notification.id]);
  const [judgment] = await db
    .select()
    .from(NotificationQuoteJudgments)
    .where(eq(NotificationQuoteJudgments.quotePostId, quote.id));
  assert.equal(judgment?.outcome, 'REPRESENTED_BY_EXISTING');
  assert.equal(judgment?.representativeKind, NotificationKind.MENTION);
  assert.equal(judgment?.representativeNotificationId, notification.id);
});

test('an existing Quote stays representative when an eligible Mention arrives later', async () => {
  const recipient = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createPostForLocal(recipient.id);
  const quote = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: source.id,
  });
  const readAt = Temporal.Instant.from('2026-10-02T02:34:56.654321Z');
  const persistedQuote = await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.QUOTE,
      recipientAccountId: accountIdsByProfile.get(recipient.id)!,
      recipientProfileId: recipient.id,
      sourceId: quote.id,
      readAt,
    })
    .returning()
    .then(firstOrThrow);

  assert.deepEqual(await createMentionNotification(quote.id), []);
  const notifications = await readSourceNotifications(quote.id);
  assert.deepEqual(
    notifications.map(({ id, kind, readAt: notificationReadAt }) => ({
      id,
      kind,
      readAt: notificationReadAt?.toString(),
    })),
    [{ id: persistedQuote.id, kind: NotificationKind.QUOTE, readAt: readAt.toString() }],
  );
});

test('an eligible Mention can notify its author', async () => {
  const author = await createProfile();
  const actorAccountId = accountIdsByProfile.get(author.id)!;
  const recipientAccountId = await addAccountToProfile(author.id);
  const post = await createPostForLocal(author.id, { mentionProfileIds: [author.id] });

  const notificationIds = await createMentionNotification(post.id);
  const notifications = await readSourceNotifications(post.id);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.MENTION);
  assert.equal(notifications[0]?.recipientProfileId, author.id);
  assert.equal(notifications[0]?.recipientAccountId, recipientAccountId);
  assert.ok(!notifications.some(({ recipientAccountId: id }) => id === actorAccountId));
  assert.deepEqual(notificationIds, [notifications[0]?.id]);
});

test('an emitted Quote judgment never returns its ID to a later Reply activity', async () => {
  const recipient = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createPostForLocal(recipient.id);
  const quote = await createPostForLocal(quoteAuthor.id, { repostSourceId: source.id });
  const [quoteId] = await createQuoteNotification(quote.id);
  assert.ok(quoteId);
  const readAt = Temporal.Instant.from('2026-10-02T03:45:56.765432Z');
  await db.update(Notifications).set({ readAt }).where(eq(Notifications.id, quoteId));
  await db.update(Posts).set({ replyParentId: source.id }).where(eq(Posts.id, quote.id));

  assert.deepEqual(await createReplyNotification(quote.id), []);
  const [notification] = await readSourceNotifications(quote.id);
  assert.equal(notification?.kind, NotificationKind.QUOTE);
  assert.equal(notification?.id, quoteId);
  assert.equal(notification?.readAt?.toString(), readAt.toString());
});

test('an eligible Reply wins over Quote and Mention concurrently and preserves its read state', async () => {
  const recipient = await createProfile();
  const recipientAccountIds = [
    accountIdsByProfile.get(recipient.id)!,
    await addAccountToProfile(recipient.id),
  ];
  const replyAuthor = await createProfile();
  const parent = await createPostForLocal(recipient.id);
  // Seed the unsupported stored Reply+Quote shape as a legacy row with no original snapshots.
  const relativeHandle = `@${recipient.handle}`;
  const authoredBodyText = `synthetic reply ${crypto.randomUUID()} ${relativeHandle}`;
  const end = authoredBodyText.length;
  const document = postContentDocumentFromTextAndMedia(authoredBodyText, [], false, null, [
    {
      end,
      handle: relativeHandle,
      profileId: recipient.id,
      relativeHandle,
      start: end - relativeHandle.length,
    },
  ]);
  const content = await db
    .insert(PostContents)
    .values({ document, postId: null })
    .returning()
    .then(firstOrThrow);
  const replyQuote = await db
    .insert(Posts)
    .values({
      currentContentId: content.id,
      profileId: replyAuthor.id,
      quoteConsentStatus: PostQuoteConsentStatus.APPROVED,
      repostSourceId: parent.id,
      replyParentId: parent.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  postIds.push(replyQuote.id);
  await db.insert(PostMentions).values({ postContentId: content.id, profileId: recipient.id });
  await db
    .update(PostContents)
    .set({ postId: replyQuote.id })
    .where(eq(PostContents.id, content.id));

  const [replyIds, quoteIds, mentionIds] = await Promise.all([
    createReplyNotification(replyQuote.id),
    createQuoteNotification(replyQuote.id),
    createMentionNotification(replyQuote.id),
  ]);
  const notifications = await readSourceNotifications(replyQuote.id);
  assert.equal(notifications.length, 2);
  assert.ok(
    notifications.every(
      ({ kind, recipientProfileId }) =>
        kind === NotificationKind.REPLY && recipientProfileId === recipient.id,
    ),
  );
  assert.deepEqual(
    notifications.map(({ recipientAccountId }) => recipientAccountId).sort(),
    [...recipientAccountIds].sort(),
  );
  const expectedIds = notifications.map(({ id }) => id).sort();
  assert.deepEqual(replyIds.slice().sort(), expectedIds);
  assert.deepEqual(quoteIds, []);
  assert.deepEqual(mentionIds, []);

  const readAt = Temporal.Instant.from('2026-10-02T02:34:56.654321Z');
  await db.update(Notifications).set({ readAt }).where(inArray(Notifications.id, expectedIds));
  const [replyRetryIds, quoteRetryIds, mentionRetryIds] = await Promise.all([
    createReplyNotification(replyQuote.id),
    createQuoteNotification(replyQuote.id),
    createMentionNotification(replyQuote.id),
  ]);
  assert.deepEqual(replyRetryIds.slice().sort(), expectedIds);
  assert.deepEqual(quoteRetryIds, []);
  assert.deepEqual(mentionRetryIds, []);
  const retried = await readSourceNotifications(replyQuote.id);
  assert.equal(retried.length, 2);
  assert.deepEqual(
    retried
      .map(({ id, createdAt, readAt: persistedReadAt }) => ({
        id,
        createdAt: createdAt.toString(),
        readAt: persistedReadAt?.toString(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    notifications
      .map(({ id, createdAt }) => ({
        id,
        createdAt: createdAt.toString(),
        readAt: readAt.toString(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
});

test('an ineligible Quote does not suppress an eligible typed Mention', async () => {
  const recipient = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createPostForLocal(recipient.id);
  const quote = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: source.id,
  });
  await db
    .update(Posts)
    .set({ visibility: PostVisibility.FOLLOWERS })
    .where(eq(Posts.id, source.id));

  assert.deepEqual(await createQuoteNotification(quote.id), []);
  const [mentionId] = await createMentionNotification(quote.id);
  assert.ok(mentionId);
  const notifications = await readSourceNotifications(quote.id);
  assert.equal(notifications.length, 1);
  const [notification] = notifications;
  assert.equal(notification?.kind, NotificationKind.MENTION);
  assert.equal(notification?.recipientProfileId, recipient.id);
});

test('an existing Mention and its read state survive later Quote eligibility', async () => {
  const recipient = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createPostForLocal(recipient.id);
  const quote = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: source.id,
  });
  await db
    .update(Posts)
    .set({ visibility: PostVisibility.FOLLOWERS })
    .where(eq(Posts.id, source.id));

  const [mentionId] = await createMentionNotification(quote.id);
  assert.ok(mentionId);
  const readAt = Temporal.Instant.from('2026-10-02T03:45:56.765432Z');
  await db.update(Notifications).set({ readAt }).where(eq(Notifications.id, mentionId));

  await db.update(Posts).set({ visibility: PostVisibility.PUBLIC }).where(eq(Posts.id, source.id));
  assert.deepEqual(await createQuoteNotification(quote.id), []);
  const notifications = await readSourceNotifications(quote.id);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.MENTION);
  assert.equal(notifications[0]?.id, mentionId);
  assert.equal(notifications[0]?.readAt?.toString(), readAt.toString());
});

test('stored Direct mentions remain eligible while unavailable, muted, and blocked candidates are suppressed', async () => {
  const remoteAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const recipient = await createProfile();

  const untyped = await createTestPost({ authorProfileId: remoteAuthor.id });
  assert.deepEqual(await createMentionNotification(untyped.id), []);

  const privatePost = await createTestPost({
    authorProfileId: remoteAuthor.id,
    mentionProfileIds: [recipient.id],
    visibility: PostVisibility.DIRECT,
  });
  const [privateMentionId] = await createMentionNotification(privatePost.id);
  assert.ok(privateMentionId);

  const suspendedInstancePost = await createTestPost({
    authorProfileId: remoteAuthor.id,
    mentionProfileIds: [recipient.id],
  });
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, remoteAuthor.instanceId));
  assert.deepEqual(await createMentionNotification(suspendedInstancePost.id), []);
  await db
    .update(Instances)
    .set({ state: InstanceState.ACTIVE })
    .where(eq(Instances.id, remoteAuthor.instanceId));

  const mutedPost = await createTestPost({
    authorProfileId: remoteAuthor.id,
    mentionProfileIds: [recipient.id],
  });
  await db.insert(ProfileMutes).values({
    ownerProfileId: recipient.id,
    targetProfileId: remoteAuthor.id,
  });
  assert.deepEqual(await createMentionNotification(mutedPost.id), []);
  await db
    .delete(ProfileMutes)
    .where(
      and(
        eq(ProfileMutes.ownerProfileId, recipient.id),
        eq(ProfileMutes.targetProfileId, remoteAuthor.id),
      ),
    );

  for (const blockDirection of ['recipient', 'author'] as const) {
    const blockedAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
    const blockedRecipient = await createProfile();
    await db.insert(ProfileBlocks).values({
      ownerProfileId: blockDirection === 'recipient' ? blockedRecipient.id : blockedAuthor.id,
      targetProfileId: blockDirection === 'recipient' ? blockedAuthor.id : blockedRecipient.id,
    });
    const blockedPost = await createTestPost({
      authorProfileId: blockedAuthor.id,
      mentionProfileIds: [blockedRecipient.id],
    });
    assert.deepEqual(await createMentionNotification(blockedPost.id), []);
  }

  assert.deepEqual(
    await db
      .select({ id: Notifications.id })
      .from(Notifications)
      .where(
        and(
          inArray(Notifications.sourceId, [untyped.id, suspendedInstancePost.id, mutedPost.id]),
          eq(Notifications.kind, NotificationKind.MENTION),
        ),
      ),
    [],
  );
  assert.deepEqual(
    await db
      .select({ recipientProfileId: Notifications.recipientProfileId })
      .from(Notifications)
      .where(
        and(
          eq(Notifications.sourceId, privatePost.id),
          eq(Notifications.kind, NotificationKind.MENTION),
        ),
      ),
    [{ recipientProfileId: recipient.id }],
  );
});

test('availability follows the exact current typed relation and excludes Recipient-only downtime from cleanup', async () => {
  const author = await createProfile(InstanceKind.ACTIVITYPUB);
  const recipient = await createProfile();
  const post = await createTestPost({
    authorProfileId: author.id,
    mentionProfileIds: [recipient.id],
  });
  const notification = await db
    .insert(Notifications)
    .values({
      data: {},
      kind: NotificationKind.MENTION,
      recipientAccountId: accountIdsByProfile.get(recipient.id)!,
      recipientProfileId: recipient.id,
      sourceId: post.id,
    })
    .returning()
    .then(firstOrThrow);

  assert.equal(await isAvailable(notification.id, true), true);
  assert.equal(await isAvailable(notification.id, false), true);

  await db
    .update(Profiles)
    .set({ state: ProfileState.SUSPENDED })
    .where(eq(Profiles.id, recipient.id));
  assert.equal(await isAvailable(notification.id, true), false);
  assert.equal(await isAvailable(notification.id, false), true);
  await db
    .update(Profiles)
    .set({ state: ProfileState.ACTIVE })
    .where(eq(Profiles.id, recipient.id));

  const replacementContent = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText(`replacement ${crypto.randomUUID()}`),
      postId: post.id,
    })
    .returning()
    .then(firstOrThrow);
  await db
    .update(Posts)
    .set({ currentContentId: replacementContent.id })
    .where(eq(Posts.id, post.id));

  assert.equal(await isAvailable(notification.id, true), false);
  assert.equal(await isAvailable(notification.id, false), false);
});
