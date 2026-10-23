import { db, Notifications, ReactionNotificationGroupMembers, Reactions } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseHandle } from '@kosmo/core/db';
import type { UserContext } from '@/context';
import type { ReactionNotificationGroupMemberRow } from '../group-ref';

const loadMembers = async (groupIds: readonly string[], database: DatabaseHandle) =>
  database
    .select({
      createdAt: Notifications.createdAt,
      groupId: ReactionNotificationGroupMembers.groupId,
      notificationId: ReactionNotificationGroupMembers.notificationId,
      postId: Reactions.postId,
      profileId: Reactions.profileId,
      reactionId: Reactions.id,
      reactionType: Reactions.type,
      readAt: Notifications.readAt,
    })
    .from(ReactionNotificationGroupMembers)
    .innerJoin(Notifications, eq(Notifications.id, ReactionNotificationGroupMembers.notificationId))
    .innerJoin(Reactions, eq(Reactions.id, Notifications.sourceId))
    .where(
      and(
        inArray(ReactionNotificationGroupMembers.groupId, groupIds),
        eq(Notifications.kind, NotificationKind.REACTION),
      ),
    )
    .orderBy(desc(Notifications.createdAt), desc(Notifications.id));

export const reactionNotificationGroupMembersLoader = (ctx: UserContext) =>
  ctx.loader<string, ReactionNotificationGroupMemberRow, string, false, true>({
    name: 'notification.reactionGroupMembers',
    many: true,
    load: (groupIds) => loadMembers(groupIds, db),
    key: (member) => member.groupId,
  });

export { loadMembers as loadReactionNotificationGroupMembers };
