import { db, Notifications } from '@kosmo/core/db';
import { notificationPubSub } from '@kosmo/core/notification/events';
import { initContextCache } from '@pothos/core';
import { and, eq, getColumns } from 'drizzle-orm';
import { filter, pipe } from 'graphql-yoga';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleViewerNotificationWhere } from '../access/visibility';
import { Notification } from '../ref';
import type { NotificationAddedPayload } from '@kosmo/core/notification/events';

const NotificationAdded = builder
  .objectRef<NotificationAddedPayload>('NotificationAdded')
  .implement({
    fields: (t) => ({
      notification: t.field({
        type: Notification,
        nullable: true,
        resolve: async ({ notificationId }, _args, ctx) => {
          const [notification] = await db
            .select(getColumns(Notifications))
            .from(Notifications)
            .where(
              and(
                eq(Notifications.id, notificationId),
                visibleViewerNotificationWhere({
                  ctx,
                  profileId: ctx.session?.profile?.id ?? null,
                }),
              ),
            )
            .limit(1);

          return notification ?? null;
        },
      }),
      profile: t.field({
        type: Profile,
        nullable: true,
        resolve: (_event, _args, ctx) => ctx.session?.profile?.id ?? null,
      }),
    }),
  });

const NotificationEvent = builder.unionType('NotificationEvent', {
  types: [NotificationAdded],
  resolveType: () => 'NotificationAdded',
});

builder.subscriptionField('notifications', (t) =>
  t.withAuth({ login: true }).field({
    type: NotificationEvent,
    nullable: true,
    subscribe: (_parent, _args, ctx) =>
      pipe(
        notificationPubSub.subscribe('notificationAdded', ctx.session.accountId),
        filter(
          ({ recipientProfileId }) =>
            recipientProfileId === null || recipientProfileId === ctx.session.profile?.id,
        ),
      ),
    resolve: (event, _args, ctx) => {
      Object.assign(ctx, initContextCache());
      return event;
    },
  }),
);
