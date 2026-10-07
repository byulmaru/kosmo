import { db, Notifications, ProfileFollowRequests } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, count, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Session } from '@/graphql/resolvers/session/ref';
import { visibleSessionNotificationWhere } from '../access/visibility';
import {
  Notification,
  NotificationConnection,
  notificationRowFromSelection,
  notificationRowSelection,
} from '../ref';
import type { NotificationRow } from '../ref';

builder.objectField(Session, 'notifications', (t) =>
  t.withAuth({ operationalSession: true }).connection(
    {
      type: Notification,
      resolve: async (_, args, ctx) =>
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
                  visibleSessionNotificationWhere({
                    ctx,
                    profileId: ctx.session?.profile?.id ?? null,
                  }),
                  before ? gt(Notifications.id, before) : undefined,
                  after ? lt(Notifications.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Notifications.id) : desc(Notifications.id))
              .limit(limit)
              .then((rows) => rows.map(notificationRowFromSelection)),
        ),
    },
    NotificationConnection as never,
  ),
);

builder.objectField(Session, 'unreadNotificationCount', (t) =>
  t.withAuth({ operationalSession: true }).field({
    type: 'Int',
    resolve: async (_, __, ctx) => {
      const [result] = await db
        .select({ count: count() })
        .from(Notifications)
        .where(
          and(
            visibleSessionNotificationWhere({
              ctx,
              profileId: ctx.session?.profile?.id ?? null,
            }),
            isNull(Notifications.readAt),
          ),
        );

      return result?.count ?? 0;
    },
  }),
);
