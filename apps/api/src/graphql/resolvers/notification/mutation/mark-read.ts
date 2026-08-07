import { db, Notifications, ProfileFollowRequests } from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, getColumns, or, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleNotificationWhere } from '../access/visibility';
import {
  Notification,
  notificationKindForNodeType,
  notificationRowFromSelection,
  notificationRowSelection,
} from '../ref';

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

      return db.transaction(async (tx) => {
        const visible = await tx
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
              or(
                ...candidates.map(({ id, kind }) =>
                  and(eq(Notifications.id, id), eq(Notifications.kind, kind)),
                ),
              ),
              visibleNotificationWhere({ ctx }),
            ),
          );

        if (visible.length === 0) {
          return { notifications: [], recipientProfiles: [] };
        }

        const snapshots = new Map(
          visible.map((row) => {
            const notification = notificationRowFromSelection(row);
            return [`${notification.kind}:${notification.id}`, notification] as const;
          }),
        );
        const updated = await tx
          .update(Notifications)
          .set({ readAt: sql`coalesce(${Notifications.readAt}, now())` })
          .where(
            and(
              or(
                ...visible.map((notification) =>
                  and(
                    eq(Notifications.id, notification.id),
                    eq(Notifications.kind, notification.kind),
                  ),
                ),
              ),
              visibleNotificationWhere({ ctx }),
            ),
          )
          .returning(getColumns(Notifications));

        const notifications = updated.map((notification) => ({
          ...notification,
          followRequestSource: snapshots.get(`${notification.kind}:${notification.id}`)
            ?.followRequestSource,
        }));

        return {
          notifications,
          recipientProfiles: [
            ...new Set(notifications.map(({ recipientProfileId }) => recipientProfileId)),
          ],
        };
      });
    },
  }),
);
