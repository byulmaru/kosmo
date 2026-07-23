import { db, ProfileFollowRequests } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { profileFollowRequestAccessWhere } from '../access/follow-request';
import type { UserContext } from '@/context';

export type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

export const viewerFollowRequestLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowRequestRow, string, true>({
    name: 'profileFollowRequest.viewerFollowRequest',
    nullable: true,
    load: async (ids) => {
      if (!ctx.session?.profileId) {
        return [];
      }

      return db
        .select(getColumns(ProfileFollowRequests))
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, ctx.session.profileId),
            inArray(ProfileFollowRequests.followeeProfileId, ids),
          ),
        );
    },
    key: (request) => request?.followeeProfileId ?? null,
  });

export const profileFollowRequestByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowRequestRow, string, true>({
    name: 'profileFollowRequest.byId',
    nullable: true,
    load: async (ids) => {
      const accessWhere = profileFollowRequestAccessWhere(ctx);
      if (!accessWhere) {
        return [];
      }

      return db
        .select(getColumns(ProfileFollowRequests))
        .from(ProfileFollowRequests)
        .where(and(inArray(ProfileFollowRequests.id, ids), accessWhere));
    },
    key: (request) => request?.id ?? null,
  });
