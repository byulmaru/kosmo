import { AccountProfiles, db, Notifications } from '@kosmo/core/db';
import { and, eq, getColumns, or, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleViewerNotificationWhere } from '../access/visibility';
import { Notification, notificationKindForNodeType } from '../ref';
import type { NotificationKind } from '@kosmo/core/enums';

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
      const candidatesByKind = new Map<NotificationKind, string[]>();
      for (const id of input.ids) {
        const kind = notificationKindForNodeType(id.typename);
        if (kind) {
          const ids = candidatesByKind.get(kind) ?? [];
          ids.push(id.id);
          candidatesByKind.set(kind, ids);
        }
      }

      if (candidatesByKind.size === 0) {
        return {
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
              ...[...candidatesByKind].map(([kind, ids]) =>
                and(
                  eq(Notifications.kind, kind),
                  sql`${Notifications.id} = ANY(${sql.param(ids)}::uuid[])`,
                ),
              ),
            ),
            visibleViewerNotificationWhere({ ctx }),
          ),
        )
        .returning(getColumns(Notifications));

      const recipientProfileIds = new Set(
        notifications.flatMap(({ recipientProfileId }) =>
          recipientProfileId === null ? [] : [recipientProfileId],
        ),
      );
      if (notifications.some(({ recipientProfileId }) => recipientProfileId === null)) {
        const accountProfiles = await db
          .select({ profileId: AccountProfiles.profileId })
          .from(AccountProfiles)
          .where(eq(AccountProfiles.accountId, ctx.session.accountId));
        accountProfiles.forEach(({ profileId }) => recipientProfileIds.add(profileId));
      }

      const recipientProfiles = await Promise.all(
        [...recipientProfileIds].map((id) => Profile.getDataloader(ctx).load(id)),
      );

      return {
        notifications,
        recipientProfiles: recipientProfiles.filter((profile) => profile !== null),
      };
    },
  }),
);
