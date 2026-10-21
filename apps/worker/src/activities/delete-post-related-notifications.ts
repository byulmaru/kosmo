import { getDatabaseConnection, Notifications, Posts, Reactions } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, inArray, or } from 'drizzle-orm';

export async function deletePostRelatedNotificationsActivity(postId: string): Promise<void> {
  const database = getDatabaseConnection();

  await database
    .delete(Notifications)
    .where(
      or(
        and(
          inArray(Notifications.kind, [
            NotificationKind.MENTION,
            NotificationKind.REPLY,
            NotificationKind.QUOTE,
            NotificationKind.REPOST,
          ]),
          eq(Notifications.sourceId, postId),
        ),
        and(
          eq(Notifications.kind, NotificationKind.REACTION),
          inArray(
            Notifications.sourceId,
            database
              .select({ id: Reactions.id })
              .from(Reactions)
              .where(eq(Reactions.postId, postId)),
          ),
        ),
        and(
          eq(Notifications.kind, NotificationKind.REPLY),
          inArray(
            Notifications.sourceId,
            database.select({ id: Posts.id }).from(Posts).where(eq(Posts.replyParentId, postId)),
          ),
        ),
        and(
          inArray(Notifications.kind, [NotificationKind.QUOTE, NotificationKind.REPOST]),
          inArray(
            Notifications.sourceId,
            database.select({ id: Posts.id }).from(Posts).where(eq(Posts.repostSourceId, postId)),
          ),
        ),
      ),
    );
}
