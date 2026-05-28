import { db, ProfileFollows, Profiles } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { profileFollowAccessWhere } from '../access/follow';
import type { SQL } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

const FollowerProfiles = alias(Profiles, 'profile_follow_follower_profile');
const FolloweeProfiles = alias(Profiles, 'profile_follow_followee_profile');

const profileFollowQuery = (ctx: UserContext, where?: (SQL | undefined)[]) =>
  db
    .select(getColumns(ProfileFollows))
    .from(ProfileFollows)
    .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
    .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
    .where(
      and(
        ...(where ?? []),
        profileFollowAccessWhere({
          ctx,
          followerProfile: FollowerProfiles,
          followeeProfile: FolloweeProfiles,
        }),
      ),
    );

export const viewerFollowLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowRow, string, true>({
    name: 'profileFollow.viewerFollow',
    nullable: true,
    load: async (ids) => {
      if (!ctx.session?.profileId) {
        return [];
      }

      return await db
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, ctx.session.profileId),
            inArray(ProfileFollows.followeeProfileId, ids),
          ),
        );
    },
    key: (profileFollow) => profileFollow?.followeeProfileId ?? null,
  });

const profileFollowByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowRow, string, true>({
    name: 'profileFollow.byId',
    nullable: true,
    load: (ids) => profileFollowQuery(ctx, [inArray(ProfileFollows.id, ids)]),
    key: (profileFollow) => profileFollow?.id ?? null,
  });

export const loadProfileFollowsByIds = async (ids: string[], ctx: UserContext) => {
  const rows = await profileFollowByIdLoader(ctx).loadMany(ids);

  return rows.filter((row): row is ProfileFollowRow => row !== null && !(row instanceof Error));
};
