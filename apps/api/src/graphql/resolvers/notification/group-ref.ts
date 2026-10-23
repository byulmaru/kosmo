import {
  db,
  Notifications,
  ReactionNotificationGroupMembers,
  ReactionNotificationGroups,
  Reactions,
} from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, exists, getColumns, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';
import { visibleViewerNotificationWhere } from './access/visibility';

export type ReactionNotificationGroupRow = typeof ReactionNotificationGroups.$inferSelect;

export type ReactionNotificationGroupMemberRow = {
  readonly createdAt: Temporal.Instant;
  readonly groupId: string;
  readonly notificationId: string;
  readonly postId: string;
  readonly profileId: string;
  readonly reactionId: string;
  readonly reactionType: string;
  readonly readAt: Temporal.Instant | null;
};

export type ReactionNotificationGroupFeedRow = ReactionNotificationGroupRow & {
  readonly __typename: 'ReactionNotificationGroup';
  readonly latestAt: Temporal.Instant;
  readonly members: readonly ReactionNotificationGroupMemberRow[];
};

export const ReactionNotificationGroup = createObjectRef<ReactionNotificationGroupRow>(
  'ReactionNotificationGroup',
  (ids, ctx) =>
    db
      .select(getColumns(ReactionNotificationGroups))
      .from(ReactionNotificationGroups)
      .where(
        and(
          inArray(ReactionNotificationGroups.id, ids),
          exists(
            db
              .select({ id: ReactionNotificationGroupMembers.notificationId })
              .from(ReactionNotificationGroupMembers)
              .innerJoin(
                Notifications,
                eq(Notifications.id, ReactionNotificationGroupMembers.notificationId),
              )
              .innerJoin(Reactions, eq(Reactions.id, Notifications.sourceId))
              .where(
                and(
                  eq(ReactionNotificationGroupMembers.groupId, ReactionNotificationGroups.id),
                  eq(Notifications.kind, NotificationKind.REACTION),
                  visibleViewerNotificationWhere({ ctx }),
                ),
              ),
          ),
        ),
      ),
);

ReactionNotificationGroup.implement({});
