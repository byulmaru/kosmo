import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  getDatabaseConnection,
  Instances,
  Notifications,
  PostContents,
  PostMentions,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, NotificationKind, ProfileState } from '../enums';
import { postVisibilityCondition } from '../visibility/post';
import { materializeNotification } from './notification-policy';
import {
  captureNotificationRecipients,
  getNotificationRecipientSnapshot,
} from './notification-recipient-snapshot';
import { materializeReplyNotificationIfEligible } from './quote-notification-coordination';
import type { Database, Transaction } from '../db';

const MentionAuthors = alias(Profiles, 'mention_notification_author');
const MentionAuthorInstances = alias(Instances, 'mention_notification_author_instance');
const MentionRecipients = alias(Profiles, 'mention_notification_recipient');
const MentionRecipientInstances = alias(Instances, 'mention_notification_recipient_instance');

type EligibleMentionCandidate = {
  readonly recipientProfileId: string;
  readonly relatedProfileId: string;
};

const findEligibleMentionCandidates = async (
  database: Transaction,
  postId: string,
  recipientProfileIds?: readonly string[],
): Promise<EligibleMentionCandidate[]> =>
  recipientProfileIds?.length === 0
    ? []
    : database
        .select({ recipientProfileId: PostMentions.profileId, relatedProfileId: Posts.profileId })
        .from(Posts)
        .innerJoin(
          PostContents,
          and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
        )
        .innerJoin(PostMentions, eq(PostMentions.postContentId, PostContents.id))
        .innerJoin(MentionAuthors, eq(MentionAuthors.id, Posts.profileId))
        .innerJoin(MentionAuthorInstances, eq(MentionAuthorInstances.id, MentionAuthors.instanceId))
        .innerJoin(MentionRecipients, eq(MentionRecipients.id, PostMentions.profileId))
        .innerJoin(
          MentionRecipientInstances,
          eq(MentionRecipientInstances.id, MentionRecipients.instanceId),
        )
        .leftJoin(
          ProfileFollows,
          and(
            eq(ProfileFollows.followerProfileId, MentionRecipients.id),
            eq(ProfileFollows.followeeProfileId, Posts.profileId),
          ),
        )
        .where(
          and(
            eq(Posts.id, postId),
            recipientProfileIds === undefined
              ? undefined
              : inArray(MentionRecipients.id, [...recipientProfileIds]),
            eq(MentionRecipients.state, ProfileState.ACTIVE),
            eq(MentionRecipientInstances.kind, InstanceKind.LOCAL),
            eq(MentionRecipientInstances.state, InstanceState.ACTIVE),
            postVisibilityCondition({
              columns: {
                authorProfileId: Posts.profileId,
                authorVisible: and(
                  eq(MentionAuthors.state, ProfileState.ACTIVE),
                  ne(MentionAuthorInstances.state, InstanceState.SUSPENDED),
                )!,
                postContentId: Posts.currentContentId,
                postState: Posts.state,
                postVisibility: Posts.visibility,
              },
              viewerFollowsAuthor: isNotNull(ProfileFollows.id),
              viewerProfileId: MentionRecipients.id,
            }),
          ),
        );

const getMentionRecipientSnapshot = async (database: Transaction, postId: string) => {
  const existing = await getNotificationRecipientSnapshot(
    database,
    NotificationKind.MENTION,
    postId,
  );
  if (existing) {
    return existing;
  }

  const rows = await database
    .select({
      createdAt: Posts.createdAt,
      recipientProfileId: PostMentions.profileId,
    })
    .from(Posts)
    .leftJoin(
      PostContents,
      and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
    )
    .leftJoin(PostMentions, eq(PostMentions.postContentId, PostContents.id))
    .where(eq(Posts.id, postId));

  const source = rows[0];
  if (!source) {
    return null;
  }

  return captureNotificationRecipients(database, {
    kind: NotificationKind.MENTION,
    legacyMembershipCutoff: source.createdAt,
    recipientProfileIds: rows.flatMap(({ recipientProfileId }) =>
      recipientProfileId ? [recipientProfileId] : [],
    ),
    sourceId: postId,
  });
};

const materializeMentionCandidateIfEligible = async (
  database: Transaction,
  postId: string,
  { recipientProfileId, relatedProfileId }: EligibleMentionCandidate,
  recipientAccountIds: readonly string[],
): Promise<string[]> => {
  const existingRepresentative = await database
    .select({ id: Notifications.id })
    .from(Notifications)
    .where(
      and(
        eq(Notifications.sourceId, postId),
        eq(Notifications.recipientProfileId, recipientProfileId),
        inArray(Notifications.kind, [NotificationKind.REPLY, NotificationKind.QUOTE]),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existingRepresentative) {
    return [];
  }

  return materializeNotification(database, {
    kind: NotificationKind.MENTION,
    recipientAccountIds,
    recipientProfileId,
    relatedProfileId,
    sourceId: postId,
  });
};

/** Materialize an eligible Mention for one recipient inside the caller's transaction. */
export const materializeMentionNotificationIfEligible = async (
  database: Transaction,
  postId: string,
  recipientProfileId: string,
): Promise<string[]> => {
  const snapshot = await getMentionRecipientSnapshot(database, postId);
  if (!snapshot || !Object.hasOwn(snapshot.recipients, recipientProfileId)) {
    return [];
  }

  const [candidate] = await findEligibleMentionCandidates(database, postId, [recipientProfileId]);
  return candidate
    ? materializeMentionCandidateIfEligible(
        database,
        postId,
        candidate,
        snapshot.recipients[recipientProfileId] ?? [],
      )
    : [];
};

/** Materialize Mention inbox rows for each eligible local Account recipient of a stored Post. */
export const createMentionNotification = async (
  postId: string,
  handle?: Database,
): Promise<string[]> =>
  getDatabaseConnection(handle).transaction(async (tx) => {
    const snapshot = await getMentionRecipientSnapshot(tx, postId);
    if (!snapshot) {
      return [];
    }

    const candidates = await findEligibleMentionCandidates(
      tx,
      postId,
      Object.keys(snapshot.recipients),
    );

    if (candidates.length === 0) {
      return [];
    }

    // Run the higher-priority Reply candidate in this same transaction. This
    // lets a Reply that is actually eligible represent the Post for its parent,
    // while an ineligible or suppressed Reply cannot hide another Mention.
    await materializeReplyNotificationIfEligible(tx, postId);

    const notificationIds: string[] = [];
    for (const candidate of candidates) {
      notificationIds.push(
        ...(await materializeMentionCandidateIfEligible(
          tx,
          postId,
          candidate,
          snapshot.recipients[candidate.recipientProfileId] ?? [],
        )),
      );
    }

    return notificationIds;
  });
