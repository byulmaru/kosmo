import {
  AccountProfiles,
  db,
  Instances,
  Notifications,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  Reactions,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  ProfileState,
} from '@kosmo/core/enums';
import { and, eq, exists, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias, unionAll } from 'drizzle-orm/pg-core';
import { postVisibilityAccessCondition } from '@/graphql/resolvers/post/access/visibility';
import { visibleProfileWhere } from '@/profile/visibility';
import type { Database } from '@kosmo/core/db';
import type { UserContext } from '@/context';

export const NotificationRecipientProfiles = alias(Profiles, 'notification_recipient_profile');
export const NotificationRelatedProfiles = alias(Profiles, 'notification_related_profile');
export const NotificationRelatedInstances = alias(Instances, 'notification_related_instance');
export const NotificationFollowRequestRecipientInstances = alias(
  Instances,
  'notification_follow_request_recipient_instance',
);
export const NotificationReactionRecipientInstances = alias(
  Instances,
  'notification_reaction_recipient_instance',
);
export const NotificationSourceReposts = alias(Posts, 'notification_source_repost');
export const NotificationRepostRelatedPosts = alias(Posts, 'notification_repost_related_post');
export const NotificationRepostRecipientInstances = alias(
  Instances,
  'notification_repost_recipient_instance',
);
const NotificationReplyPosts = alias(Posts, 'notification_reply_post');
const NotificationReplyParents = alias(Posts, 'notification_reply_parent');
const NotificationReplyRecipientProfiles = alias(Profiles, 'notification_reply_recipient_profile');
const NotificationReplyRecipientInstances = alias(
  Instances,
  'notification_reply_recipient_instance',
);
const NotificationReplyAuthors = alias(Profiles, 'notification_reply_author');
const NotificationReplyAuthorInstances = alias(Instances, 'notification_reply_author_instance');

export const notificationMembershipWhere = (accountId: string, database: Database) =>
  exists(
    database
      .select({ id: AccountProfiles.id })
      .from(AccountProfiles)
      .where(
        and(
          eq(AccountProfiles.accountId, accountId),
          eq(AccountProfiles.profileId, Notifications.recipientProfileId),
        ),
      ),
  );

const visibleNotificationSourceWhere = (database: Database) =>
  exists(
    unionAll(
      database
        .select({ id: ProfileFollows.id })
        .from(ProfileFollows)
        .innerJoin(
          NotificationRecipientProfiles,
          eq(NotificationRecipientProfiles.id, ProfileFollows.followeeProfileId),
        )
        .innerJoin(
          NotificationRelatedProfiles,
          eq(NotificationRelatedProfiles.id, ProfileFollows.followerProfileId),
        )
        .innerJoin(
          NotificationRelatedInstances,
          eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
        )
        .where(
          and(
            eq(Notifications.kind, NotificationKind.FOLLOW),
            eq(ProfileFollows.id, Notifications.sourceId),
            eq(ProfileFollows.followeeProfileId, Notifications.recipientProfileId),
            eq(NotificationRecipientProfiles.state, ProfileState.ACTIVE),
            visibleProfileWhere({
              instance: NotificationRelatedInstances,
              profile: NotificationRelatedProfiles,
            }),
          ),
        ),
      database
        .select({ id: ProfileFollowRequests.id })
        .from(ProfileFollowRequests)
        .innerJoin(
          NotificationRecipientProfiles,
          eq(NotificationRecipientProfiles.id, ProfileFollowRequests.followeeProfileId),
        )
        .innerJoin(
          NotificationFollowRequestRecipientInstances,
          eq(
            NotificationFollowRequestRecipientInstances.id,
            NotificationRecipientProfiles.instanceId,
          ),
        )
        .innerJoin(
          NotificationRelatedProfiles,
          eq(NotificationRelatedProfiles.id, ProfileFollowRequests.followerProfileId),
        )
        .innerJoin(
          NotificationRelatedInstances,
          eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
        )
        .where(
          and(
            eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
            eq(ProfileFollowRequests.id, Notifications.sourceId),
            eq(ProfileFollowRequests.followeeProfileId, Notifications.recipientProfileId),
            eq(NotificationRecipientProfiles.state, ProfileState.ACTIVE),
            eq(NotificationFollowRequestRecipientInstances.kind, InstanceKind.LOCAL),
            eq(NotificationFollowRequestRecipientInstances.state, InstanceState.ACTIVE),
            visibleProfileWhere({
              instance: NotificationRelatedInstances,
              profile: NotificationRelatedProfiles,
            }),
          ),
        ),
      database
        .select({ id: Reactions.id })
        .from(Reactions)
        .innerJoin(Posts, eq(Posts.id, Reactions.postId))
        .innerJoin(
          NotificationRelatedProfiles,
          eq(NotificationRelatedProfiles.id, Reactions.profileId),
        )
        .innerJoin(
          NotificationRelatedInstances,
          eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
        )
        .innerJoin(
          NotificationRecipientProfiles,
          eq(NotificationRecipientProfiles.id, Posts.profileId),
        )
        .innerJoin(
          NotificationReactionRecipientInstances,
          eq(NotificationReactionRecipientInstances.id, NotificationRecipientProfiles.instanceId),
        )
        .where(
          and(
            eq(Notifications.kind, NotificationKind.REACTION),
            eq(Reactions.id, Notifications.sourceId),
            eq(Posts.profileId, Notifications.recipientProfileId),
            eq(Posts.state, PostState.ACTIVE),
            eq(NotificationRecipientProfiles.state, ProfileState.ACTIVE),
            eq(NotificationReactionRecipientInstances.kind, InstanceKind.LOCAL),
            eq(NotificationReactionRecipientInstances.state, InstanceState.ACTIVE),
            visibleProfileWhere({
              instance: NotificationRelatedInstances,
              profile: NotificationRelatedProfiles,
            }),
          ),
        ),
      database
        .select({ id: NotificationSourceReposts.id })
        .from(NotificationSourceReposts)
        .where(
          and(
            eq(Notifications.kind, NotificationKind.REPOST),
            eq(NotificationSourceReposts.id, Notifications.sourceId),
            eq(NotificationSourceReposts.state, PostState.ACTIVE),
            isNull(NotificationSourceReposts.currentContentId),
            isNull(NotificationSourceReposts.replyParentId),
            exists(
              database
                .select({ id: NotificationRelatedProfiles.id })
                .from(NotificationRelatedProfiles)
                .innerJoin(
                  NotificationRelatedInstances,
                  eq(NotificationRelatedInstances.id, NotificationRelatedProfiles.instanceId),
                )
                .where(
                  and(
                    eq(NotificationRelatedProfiles.id, NotificationSourceReposts.profileId),
                    visibleProfileWhere({
                      instance: NotificationRelatedInstances,
                      profile: NotificationRelatedProfiles,
                    }),
                  ),
                ),
            ),
            exists(
              database
                .select({ id: NotificationRepostRelatedPosts.id })
                .from(NotificationRepostRelatedPosts)
                .innerJoin(
                  NotificationRecipientProfiles,
                  eq(NotificationRecipientProfiles.id, NotificationRepostRelatedPosts.profileId),
                )
                .innerJoin(
                  NotificationRepostRecipientInstances,
                  eq(
                    NotificationRepostRecipientInstances.id,
                    NotificationRecipientProfiles.instanceId,
                  ),
                )
                .where(
                  and(
                    eq(NotificationRepostRelatedPosts.id, NotificationSourceReposts.repostSourceId),
                    eq(NotificationRepostRelatedPosts.profileId, Notifications.recipientProfileId),
                    isNotNull(NotificationRepostRelatedPosts.currentContentId),
                    eq(NotificationRepostRecipientInstances.kind, InstanceKind.LOCAL),
                    eq(NotificationRepostRecipientInstances.state, InstanceState.ACTIVE),
                    postVisibilityAccessCondition({
                      columns: {
                        postProfileId: NotificationRepostRelatedPosts.profileId,
                        postState: NotificationRepostRelatedPosts.state,
                        postVisibility: NotificationRepostRelatedPosts.visibility,
                        profileVisible: sql<boolean>`${visibleProfileWhere({
                          instance: NotificationRepostRecipientInstances,
                          profile: NotificationRecipientProfiles,
                        })}`,
                      },
                      viewerProfileId: Notifications.recipientProfileId,
                      db: database,
                    }),
                  ),
                ),
            ),
          ),
        ),
      database
        .select({ id: NotificationReplyPosts.id })
        .from(NotificationReplyPosts)
        .where(
          and(
            eq(Notifications.kind, NotificationKind.REPLY),
            eq(NotificationReplyPosts.id, Notifications.sourceId),
            exists(
              database
                .select({ id: NotificationReplyParents.id })
                .from(NotificationReplyParents)
                .innerJoin(
                  NotificationReplyRecipientProfiles,
                  eq(NotificationReplyRecipientProfiles.id, NotificationReplyParents.profileId),
                )
                .innerJoin(
                  NotificationReplyRecipientInstances,
                  eq(
                    NotificationReplyRecipientInstances.id,
                    NotificationReplyRecipientProfiles.instanceId,
                  ),
                )
                .where(
                  and(
                    eq(NotificationReplyParents.id, NotificationReplyPosts.replyParentId),
                    eq(NotificationReplyParents.profileId, Notifications.recipientProfileId),
                    eq(NotificationReplyRecipientProfiles.state, ProfileState.ACTIVE),
                    eq(NotificationReplyRecipientInstances.kind, InstanceKind.LOCAL),
                    eq(NotificationReplyRecipientInstances.state, InstanceState.ACTIVE),
                  ),
                ),
            ),
            exists(
              database
                .select({ id: NotificationReplyAuthors.id })
                .from(NotificationReplyAuthors)
                .innerJoin(
                  NotificationReplyAuthorInstances,
                  eq(NotificationReplyAuthorInstances.id, NotificationReplyAuthors.instanceId),
                )
                .where(
                  and(
                    eq(NotificationReplyAuthors.id, NotificationReplyPosts.profileId),
                    postVisibilityAccessCondition({
                      columns: {
                        postProfileId: NotificationReplyPosts.profileId,
                        postState: NotificationReplyPosts.state,
                        postVisibility: NotificationReplyPosts.visibility,
                        profileVisible: sql<boolean>`${visibleProfileWhere({
                          instance: NotificationReplyAuthorInstances,
                          profile: NotificationReplyAuthors,
                        })}`,
                      },
                      viewerProfileId: Notifications.recipientProfileId,
                      db: database,
                    }),
                  ),
                ),
            ),
          ),
        ),
    ),
  );

export const visibleNotificationWhere = ({ ctx }: { ctx: UserContext }) => {
  const accountId = ctx.session?.accountId;

  return and(
    accountId ? notificationMembershipWhere(accountId, db) : sql`1=0`,
    visibleNotificationSourceWhere(db),
  )!;
};
