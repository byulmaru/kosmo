import { db, ProfileFollowRequests } from '@kosmo/core/db';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

export const viewerFollowRequestLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowRequestRow, string, true>({
    name: 'profileFollowRequest.viewerOutgoing',
    nullable: true,
    load: async (ids) => {
      if (!ctx.session?.profileId) {
        return [];
      }
      return db
        .select()
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
      if (!ctx.session?.profileId) {
        return [];
      }
      return db
        .select()
        .from(ProfileFollowRequests)
        .where(
          and(
            inArray(ProfileFollowRequests.id, ids),
            or(
              eq(ProfileFollowRequests.followerProfileId, ctx.session.profileId),
              eq(ProfileFollowRequests.followeeProfileId, ctx.session.profileId),
            ),
          ),
        );
    },
    key: (request) => request?.id ?? null,
  });
