import { AccountProfiles, db, Instances, Notifications, Profiles } from '@kosmo/core/db';
import { and, eq, getColumns, or, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { visibleProfileWhere } from '@/profile/visibility';
import { visibleViewerNotificationWhere } from '../access/visibility';
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
              ...candidates.map(({ id, kind }) =>
                and(eq(Notifications.id, id), eq(Notifications.kind, kind)),
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
      if (notifications.some(({ recipientAccountId }) => recipientAccountId !== null)) {
        const accountProfiles = await db
          .select({ profileId: Profiles.id })
          .from(AccountProfiles)
          .innerJoin(Profiles, eq(Profiles.id, AccountProfiles.profileId))
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(
            and(
              eq(AccountProfiles.accountId, ctx.session.accountId),
              visibleProfileWhere({ profile: Profiles, instance: Instances }),
            ),
          );
        accountProfiles.forEach(({ profileId }) => recipientProfileIds.add(profileId));
      }

      return {
        notifications,
        recipientProfiles: [...recipientProfileIds],
      };
    },
  }),
);
