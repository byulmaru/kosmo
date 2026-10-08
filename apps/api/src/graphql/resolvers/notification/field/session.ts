import { db, Notifications } from '@kosmo/core/db';
import { and, count, isNull } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Session } from '@/graphql/resolvers/session/ref';
import { visibleSessionNotificationWhere } from '../access/visibility';
import { Notification, NotificationConnection } from '../ref';
import { resolveNotificationPage } from './notification-page';

builder.objectField(Session, 'notifications', (t) =>
  t.withAuth({ login: true }).connection(
    {
      type: Notification,
      resolve: async (_, args, ctx) =>
        resolveNotificationPage(
          args,
          visibleSessionNotificationWhere({
            ctx,
            profileId: ctx.session?.profile?.id ?? null,
          }),
        ),
    },
    NotificationConnection as never,
  ),
);

builder.objectField(Session, 'unreadNotificationCount', (t) =>
  t.withAuth({ login: true }).field({
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
