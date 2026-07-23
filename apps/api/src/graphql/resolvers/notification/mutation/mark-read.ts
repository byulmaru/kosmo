import { db, firstOrThrowWith, Notifications } from '@kosmo/core/db';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq, getColumns, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleNotificationWhere } from '../access/visibility';
import { Notification, notificationKindForNodeType } from '../ref';

builder.mutationField('markNotificationRead', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('MarkNotificationReadPayload', {
      fields: (field) => ({
        notification: field.field({ type: Notification }),
        recipientProfile: field.field({ type: Profile }),
      }),
    }),
    input: {
      id: t.input.globalID(),
    },
    resolve: async (_, { input }, ctx) => {
      const kind = notificationKindForNodeType(input.id.typename);
      if (!kind) {
        throw new NotFoundError('Notification not found');
      }

      const notification = await db
        .update(Notifications)
        .set({ readAt: sql`coalesce(${Notifications.readAt}, now())` })
        .where(
          and(
            eq(Notifications.id, input.id.id),
            eq(Notifications.kind, kind),
            visibleNotificationWhere({ ctx }),
          ),
        )
        .returning(getColumns(Notifications))
        .then(firstOrThrowWith(() => new NotFoundError('Notification not found')));

      return {
        notification,
        recipientProfile: notification.recipientProfileId,
      };
    },
  }),
);
