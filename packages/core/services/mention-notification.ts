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
import { materializeQuoteNotificationIfEligible } from './quote-notification';
import { materializeReplyNotificationIfEligible } from './quote-notification-coordination';
import type { Database } from '../db';

const MentionAuthors = alias(Profiles, 'mention_notification_author');
const MentionAuthorInstances = alias(Instances, 'mention_notification_author_instance');
const MentionRecipients = alias(Profiles, 'mention_notification_recipient');
const MentionRecipientInstances = alias(Instances, 'mention_notification_recipient_instance');

/** Materialize one Mention inbox row for each eligible local recipient of a stored Post. */
export const createMentionNotification = async (
  postId: string,
  handle?: Database,
): Promise<string[]> =>
  getDatabaseConnection(handle).transaction(async (tx) => {
    const candidates = await tx
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
              postState: Posts.state,
              postVisibility: Posts.visibility,
            },
            viewerFollowsAuthor: isNotNull(ProfileFollows.id),
            viewerProfileId: MentionRecipients.id,
          }),
        ),
      );

    if (candidates.length === 0) {
      return [];
    }

    // Run the higher-priority Reply candidate in this same transaction. This
    // lets a Reply that is actually eligible represent the Post for its parent,
    // while an ineligible or suppressed Reply cannot hide another Mention.
    await materializeReplyNotificationIfEligible(tx, postId);
    await materializeQuoteNotificationIfEligible(tx, postId);

    const notificationIds: string[] = [];
    for (const { recipientProfileId, relatedProfileId } of candidates) {
      const higherPriorityNotification = await tx
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

      if (higherPriorityNotification) {
        continue;
      }

      const notificationId = await materializeNotification(tx, {
        kind: NotificationKind.MENTION,
        recipientProfileId,
        relatedProfileId,
        sourceId: postId,
      });
      if (notificationId) {
        notificationIds.push(notificationId);
      }
    }

    return notificationIds;
  });
