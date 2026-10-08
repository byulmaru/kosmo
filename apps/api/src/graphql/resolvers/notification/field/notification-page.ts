import { db, Notifications, ProfileFollowRequests } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { notificationRowFromSelection, notificationRowSelection } from '../ref';
import type { SQL } from 'drizzle-orm';
import type { NotificationRow } from '../ref';

export const resolveNotificationPage = (
  args: Parameters<typeof resolveCursorConnection>[0]['args'],
  where: SQL,
) =>
  resolveCursorConnection<Promise<NotificationRow[]>>(
    {
      args,
      toCursor: (notification) => notification.id,
    },
    ({ before, after, limit, inverted }) =>
      db
        .select(notificationRowSelection)
        .from(Notifications)
        .leftJoin(
          ProfileFollowRequests,
          and(
            eq(ProfileFollowRequests.id, Notifications.sourceId),
            eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
          ),
        )
        .where(
          and(
            where,
            before ? gt(Notifications.id, before) : undefined,
            after ? lt(Notifications.id, after) : undefined,
          ),
        )
        .orderBy(inverted ? asc(Notifications.id) : desc(Notifications.id))
        .limit(limit)
        .then((rows) => rows.map(notificationRowFromSelection)),
  );
