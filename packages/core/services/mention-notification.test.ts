import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
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
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import {
  canonicalizePostContentDocument,
  postContentDocumentFromText,
} from '../post-content/server';
import { notificationSourceAvailabilityWhere } from '../visibility/notification';
import { createReplyNotification } from './create-reply-notification';
import { createMentionNotification } from './mention-notification';
import { createPost as persistPost } from './post';
import { createQuoteNotification } from './quote-notification';

const instanceIds: string[] = [];
const profileIds: string[] = [];
const postIds: string[] = [];

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
  const result = await persistPost({
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
  const result = await persistPost({
    document: postContentDocumentFromText(`local mention ${crypto.randomUUID()}`),
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
  if (mentionProfileIds.length === 0) {
    return result.post;
  }

  // Seed the persisted typed-relation state directly; Local Mention input is not implemented.
  const content = await db
    .insert(PostContents)
    .values({
      document: canonicalizePostContentDocument({
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `local mention ${crypto.randomUUID()} ` },
                ...mentionProfileIds.map((mentionProfileId) => ({
                  type: 'mention',
                  attrs: { profileId: mentionProfileId },
                })),
              ],
            },
          ],
        },
      }),
      postId: result.post.id,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(PostMentions).values(
    [...new Set(mentionProfileIds)].map((profileId) => ({
      postContentId: content.id,
      profileId,
    })),
  );
  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, result.post.id))
    .returning()
    .then(firstOrThrow);
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
    if (instanceIds.length > 0) {
      await db.delete(Instances).where(inArray(Instances.id, instanceIds));
    }
  } finally {
    await pg.end();
  }
});

test('inbound typed Mention is per visible local Profile and concurrent retries return the stored IDs', async () => {
  const author = await createProfile(InstanceKind.ACTIVITYPUB);
  const follower = await createProfile();
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

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.MENTION);
  assert.equal(notifications[0]?.recipientProfileId, follower.id);
  assert.deepEqual(new Set(firstIds), new Set([notifications[0]?.id]));
  assert.deepEqual(new Set(retryIds), new Set([notifications[0]?.id]));
  assert.equal(notifications[0]?.readAt, null);

  const readAt = Temporal.Instant.from('2026-10-02T01:23:45.123456Z');
  await db.update(Notifications).set({ readAt }).where(eq(Notifications.id, notifications[0]!.id));
  assert.deepEqual(await createMentionNotification(post.id), [notifications[0]!.id]);
  const [preserved] = await readSourceNotifications(post.id);
  assert.equal(preserved?.readAt?.toString(), readAt.toString());
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

test('an eligible Quote wins over Mention from either start order and during concurrent generation', async () => {
  const recipient = await createProfile();
  const quoteAuthor = await createProfile();

  const quoteFirstSource = await createPostForLocal(recipient.id);
  const quoteFirst = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: quoteFirstSource.id,
  });
  const quoteFirstId = await createQuoteNotification(quoteFirst.id);
  assert.ok(quoteFirstId);
  assert.deepEqual(await createMentionNotification(quoteFirst.id), []);
  const quoteFirstNotifications = await readSourceNotifications(quoteFirst.id);
  assert.equal(quoteFirstNotifications.length, 1);
  const [quoteFirstNotification] = quoteFirstNotifications;
  assert.equal(quoteFirstNotification?.kind, NotificationKind.QUOTE);
  assert.equal(quoteFirstNotification?.id, quoteFirstId);

  const mentionFirstSource = await createPostForLocal(recipient.id);
  const mentionFirst = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: mentionFirstSource.id,
  });
  assert.deepEqual(await createMentionNotification(mentionFirst.id), []);
  const mentionFirstId = await createQuoteNotification(mentionFirst.id);
  assert.ok(mentionFirstId);
  const mentionFirstNotifications = await readSourceNotifications(mentionFirst.id);
  assert.equal(mentionFirstNotifications.length, 1);
  const [mentionFirstNotification] = mentionFirstNotifications;
  assert.equal(mentionFirstNotification?.kind, NotificationKind.QUOTE);
  assert.equal(mentionFirstNotification?.id, mentionFirstId);

  const concurrentSource = await createPostForLocal(recipient.id);
  const concurrent = await createPostForLocal(quoteAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: concurrentSource.id,
  });
  const [concurrentQuoteId, concurrentMentionIds] = await Promise.all([
    createQuoteNotification(concurrent.id),
    createMentionNotification(concurrent.id),
  ]);
  assert.ok(concurrentQuoteId);
  assert.deepEqual(concurrentMentionIds, []);
  const concurrentNotifications = await readSourceNotifications(concurrent.id);
  assert.equal(concurrentNotifications.length, 1);
  const [concurrentNotification] = concurrentNotifications;
  assert.equal(concurrentNotification?.kind, NotificationKind.QUOTE);
  assert.equal(concurrentNotification?.id, concurrentQuoteId);
});

test('an eligible Reply wins over Quote and Mention concurrently and preserves its read state', async () => {
  const recipient = await createProfile();
  const replyAuthor = await createProfile();
  const parent = await createPostForLocal(recipient.id);
  const replyQuote = await createPostForLocal(replyAuthor.id, {
    mentionProfileIds: [recipient.id],
    repostSourceId: parent.id,
  });
  // The canonical Post model allows this stored shape, but createPost currently rejects the pair.
  await db.update(Posts).set({ replyParentId: parent.id }).where(eq(Posts.id, replyQuote.id));

  const [, quoteId, mentionIds] = await Promise.all([
    createReplyNotification(replyQuote.id),
    createQuoteNotification(replyQuote.id),
    createMentionNotification(replyQuote.id),
  ]);
  const notifications = await readSourceNotifications(replyQuote.id);
  assert.equal(notifications.length, 1);
  const [notification] = notifications;
  assert.equal(notification?.kind, NotificationKind.REPLY);
  assert.equal(notification?.recipientProfileId, recipient.id);
  assert.equal(quoteId, null);
  assert.deepEqual(mentionIds, []);

  assert.ok(notification);
  const readAt = Temporal.Instant.from('2026-10-02T02:34:56.654321Z');
  await db.update(Notifications).set({ readAt }).where(eq(Notifications.id, notification.id));
  await Promise.all([
    createReplyNotification(replyQuote.id),
    createQuoteNotification(replyQuote.id),
    createMentionNotification(replyQuote.id),
  ]);
  const retried = await readSourceNotifications(replyQuote.id);
  assert.equal(retried.length, 1);
  assert.equal(retried[0]?.kind, NotificationKind.REPLY);
  assert.equal(retried[0]?.id, notification.id);
  assert.equal(retried[0]?.readAt?.toString(), readAt.toString());
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

  assert.equal(await createQuoteNotification(quote.id), null);
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
  assert.equal(await createQuoteNotification(quote.id), null);
  const notifications = await readSourceNotifications(quote.id);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.MENTION);
  assert.equal(notifications[0]?.id, mentionId);
  assert.equal(notifications[0]?.readAt?.toString(), readAt.toString());
});

test('untyped, unavailable, muted, and either-direction blocked candidates are suppressed', async () => {
  const remoteAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const recipient = await createProfile();

  const untyped = await createTestPost({ authorProfileId: remoteAuthor.id });
  assert.deepEqual(await createMentionNotification(untyped.id), []);

  const privatePost = await createTestPost({
    authorProfileId: remoteAuthor.id,
    mentionProfileIds: [recipient.id],
    visibility: PostVisibility.DIRECT,
  });
  assert.deepEqual(await createMentionNotification(privatePost.id), []);

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
          inArray(Notifications.sourceId, [
            untyped.id,
            privatePost.id,
            suspendedInstancePost.id,
            mutedPost.id,
          ]),
          eq(Notifications.kind, NotificationKind.MENTION),
        ),
      ),
    [],
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
