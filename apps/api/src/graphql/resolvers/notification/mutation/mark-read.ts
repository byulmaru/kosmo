import { db, Notifications } from '@kosmo/core/db';
import { and, eq, getColumns, or, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { Session } from '@/graphql/resolvers/session/ref';
import { visibleSessionNotificationWhere } from '../access/visibility';
import { Notification, notificationKindForNodeType } from '../ref';

builder.mutationField('markNotificationRead', (t) =>
  t.withAuth({ operationalSession: true }).fieldWithInput({
    type: builder.simpleObject('MarkNotificationReadPayload', {
      fields: (field) => ({
        currentSession: field.field({ type: Session }),
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
        return {
          currentSession: ctx.operationalSession.id,
          notifications: [],
          recipientProfiles: [],
        };
      }

      const notifications = await db
        .update(Notifications)
        .set({ readAt: sql`coalesce(${Notifications.readAt}, now())` })
        .where(
          and(
            or(
              ...candidates.map(({ id, kind }) =>
                and(eq(Notifications.id, id), eq(Notifications.kind, kind)),
              ),
            ),
            visibleSessionNotificationWhere({ ctx }),
          ),
        )
        .returning(getColumns(Notifications));

      return {
        currentSession: ctx.operationalSession.id,
        notifications,
        recipientProfiles: [
          ...new Set(
            notifications.flatMap(({ recipientProfileId }) =>
              recipientProfileId === null ? [] : [recipientProfileId],
            ),
          ),
        ],
      };
    },
  }),
);
