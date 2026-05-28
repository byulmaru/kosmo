import { db, ProfileFollows } from '@kosmo/core/db';
import { ProfileFollowState } from '@kosmo/core/enums';
import { and, count, eq, getColumns, inArray } from 'drizzle-orm';
import {
  profileFollowAccessWhere,
  ProfileFollowFolloweeProfiles,
  ProfileFollowFollowerProfiles,
} from '../access/follow';
import type { SQL } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

type ProfileFollowCountRow = {
  profileId: string;
  value: number;
};

const profileFollowQuery = (ctx: UserContext, where?: (SQL | undefined)[]) =>
  db
    .select(getColumns(ProfileFollows))
    .from(ProfileFollows)
    .innerJoin(
      ProfileFollowFollowerProfiles,
      eq(ProfileFollowFollowerProfiles.id, ProfileFollows.followerProfileId),
    )
    .innerJoin(
      ProfileFollowFolloweeProfiles,
      eq(ProfileFollowFolloweeProfiles.id, ProfileFollows.followeeProfileId),
    )
    .where(profileFollowAccessWhere(ctx, where));

export const acceptedProfileFollowersCountLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowCountRow, string, true>({
    name: 'profileFollow.acceptedFollowersCount',
    nullable: true,
    load: async (keys) => {
      const profileFollowRows = profileFollowQuery(ctx, [
        eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
        inArray(ProfileFollows.followeeProfileId, [...new Set(keys)]),
      ]).as('profile_follow_rows');

      return await db
        .select({
          profileId: profileFollowRows.followeeProfileId,
          value: count(),
        })
        .from(profileFollowRows)
        .groupBy(profileFollowRows.followeeProfileId);
    },
    key: (row) => row?.profileId ?? null,
  });

export const acceptedProfileFollowingCountLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowCountRow, string, true>({
    name: 'profileFollow.acceptedFollowingCount',
    nullable: true,
    load: async (keys) => {
      const profileFollowRows = profileFollowQuery(ctx, [
        eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
        inArray(ProfileFollows.followerProfileId, [...new Set(keys)]),
      ]).as('profile_follow_rows');

      return await db
        .select({
          profileId: profileFollowRows.followerProfileId,
          value: count(),
        })
        .from(profileFollowRows)
        .groupBy(profileFollowRows.followerProfileId);
    },
    key: (row) => row?.profileId ?? null,
  });

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
