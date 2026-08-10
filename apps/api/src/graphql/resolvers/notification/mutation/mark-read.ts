import { Notifications } from '@kosmo/core/db';
import { and, eq, getColumns, or, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleNotificationWhere } from '../access/visibility';
import { Notification, notificationKindForNodeType } from '../ref';

builder.mutationField('markNotificationRead', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('MarkNotificationReadPayload', {
      fields: (field) => ({
        notifications: field.field({ type: [Notification] }),
        recipientProfiles: field.field({ type: [Profile] }),
      }),
    }),
    input: {
      ids: t.input.globalIDList(),
    },
    resolve: async (_, { input }, ctx) => {
      const candidates = input.ids.flatMap((id) => {
        const kind = notificationKindForNodeType(id.typename);
        return kind ? [{ id: id.id, kind }] : [];
      });

      if (candidates.length === 0) {
        return { notifications: [], recipientProfiles: [] };
      }

      const notifications = await ctx.db
        .update(Notifications)
        .set({ readAt: sql`coalesce(${Notifications.readAt}, now())` })
        .where(
          and(
            or(
              ...candidates.map(({ id, kind }) =>
                and(eq(Notifications.id, id), eq(Notifications.kind, kind)),
              ),
            ),
            visibleNotificationWhere({ ctx }),
          ),
        )
        .returning(getColumns(Notifications));

      return {
        notifications,
        recipientProfiles: [
          ...new Set(notifications.map(({ recipientProfileId }) => recipientProfileId)),
        ],
      };
    },
  }),
);
