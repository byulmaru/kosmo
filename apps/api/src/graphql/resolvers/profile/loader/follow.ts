import { db, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileFollowPolicy, ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { and, count, eq, getColumns, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type ProfileFollowConnectionDirection = 'followers' | 'following';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

type ProfileFollowCountKey = {
  direction: ProfileFollowConnectionDirection;
  profileId: string;
};

type ProfileFollowCountRow = ProfileFollowCountKey & {
  value: number;
};

type ProfileFollowPageKey = ProfileFollowCountKey & {
  limit: number;
  offset: number;
};

type ProfileFollowPageRow = ProfileFollowPageKey & ProfileFollowRow;

const FollowerProfiles = alias(Profiles, 'profile_follow_follower_profile');
const FolloweeProfiles = alias(Profiles, 'profile_follow_followee_profile');

const ownerProfileIdColumn = (direction: ProfileFollowConnectionDirection) =>
  direction === 'followers' ? ProfileFollows.followeeProfileId : ProfileFollows.followerProfileId;

const profileFollowAccessWhere = (
  ctx: UserContext,
  {
    acceptedOnly = false,
    where = [],
  }: { acceptedOnly?: boolean; where?: (SQL | undefined)[] } = {},
) => {
  const publicAcceptedWhere = and(
    eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
    eq(FollowerProfiles.followPolicy, ProfileFollowPolicy.OPEN),
    eq(FolloweeProfiles.followPolicy, ProfileFollowPolicy.OPEN),
  )!;
  const visibleWhere = ctx.session?.profileId
    ? or(
        eq(ProfileFollows.followerProfileId, ctx.session.profileId),
        eq(ProfileFollows.followeeProfileId, ctx.session.profileId),
        publicAcceptedWhere,
      )
    : publicAcceptedWhere;

  return and(
    ...where,
    acceptedOnly ? eq(ProfileFollows.state, ProfileFollowState.ACCEPTED) : undefined,
    eq(FollowerProfiles.state, ProfileState.ACTIVE),
    eq(FolloweeProfiles.state, ProfileState.ACTIVE),
    visibleWhere,
  )!;
};

const profileFollowQuery = (
  ctx: UserContext,
  options?: Parameters<typeof profileFollowAccessWhere>[1],
) =>
  db
    .select(getColumns(ProfileFollows))
    .from(ProfileFollows)
    .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
    .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
    .where(profileFollowAccessWhere(ctx, options));

export const acceptedProfileFollowCountLoader = (ctx: UserContext) =>
  ctx.loader<ProfileFollowCountKey, ProfileFollowCountRow, ProfileFollowCountKey, true>({
    name: 'profileFollow.acceptedCount',
    nullable: true,
    load: async (keys) => {
      const rows: ProfileFollowCountRow[] = [];

      for (const direction of ['followers', 'following'] as const) {
        const profileIds = keys
          .filter((key) => key.direction === direction)
          .map((key) => key.profileId);

        if (!profileIds.length) {
          continue;
        }

        const profileFollowRows = profileFollowQuery(ctx, {
          acceptedOnly: true,
          where: [inArray(ownerProfileIdColumn(direction), [...new Set(profileIds)])],
        }).as('profile_follow_rows');
        const ownerColumn =
          direction === 'followers'
            ? profileFollowRows.followeeProfileId
            : profileFollowRows.followerProfileId;
        const counts = await db
          .select({
            profileId: ownerColumn,
            value: count(),
          })
          .from(profileFollowRows)
          .groupBy(ownerColumn);

        rows.push(
          ...counts.map((row) => ({ direction, profileId: row.profileId, value: row.value })),
        );
      }

      return rows;
    },
    key: (row) => row && { direction: row.direction, profileId: row.profileId },
  });

export const acceptedProfileFollowPageLoader = (ctx: UserContext) =>
  ctx.loader<ProfileFollowPageKey, ProfileFollowPageRow, ProfileFollowPageKey, false, true>({
    name: 'profileFollow.acceptedPage',
    many: true,
    load: async (keys) => {
      const rows: ProfileFollowPageRow[] = [];
      const groups = new Map<string, ProfileFollowPageKey[]>();

      for (const key of keys) {
        const groupKey = `${key.direction}:${key.offset}:${key.limit}`;
        const group = groups.get(groupKey);
        if (group) {
          group.push(key);
        } else {
          groups.set(groupKey, [key]);
        }
      }

      for (const group of groups.values()) {
        const [{ direction, limit, offset }] = group;
        const profileFollowRows = profileFollowQuery(ctx, {
          acceptedOnly: true,
          where: [
            inArray(ownerProfileIdColumn(direction), [
              ...new Set(group.map((key) => key.profileId)),
            ]),
          ],
        }).as('profile_follow_rows');
        const ownerColumn =
          direction === 'followers'
            ? profileFollowRows.followeeProfileId
            : profileFollowRows.followerProfileId;
        const position = sql<number>`row_number() over (
          partition by ${ownerColumn}
          order by ${profileFollowRows.id} desc
        )`.as('position');

        const rankedProfileFollows = db
          .select({
            ownerProfileId: ownerColumn,
            position,
            id: profileFollowRows.id,
            followerProfileId: profileFollowRows.followerProfileId,
            followeeProfileId: profileFollowRows.followeeProfileId,
            state: profileFollowRows.state,
            createdAt: profileFollowRows.createdAt,
            respondedAt: profileFollowRows.respondedAt,
          })
          .from(profileFollowRows)
          .as('ranked_profile_follows');

        const page = await db
          .select()
          .from(rankedProfileFollows)
          .where(
            and(
              gt(rankedProfileFollows.position, offset),
              lte(rankedProfileFollows.position, offset + limit),
            ),
          )
          .orderBy(rankedProfileFollows.ownerProfileId, rankedProfileFollows.position);

        rows.push(
          ...page.map((row) => ({
            direction,
            profileId: row.ownerProfileId,
            limit,
            offset,
            id: row.id,
            followerProfileId: row.followerProfileId,
            followeeProfileId: row.followeeProfileId,
            state: row.state,
            createdAt: row.createdAt,
            respondedAt: row.respondedAt,
          })),
        );
      }

      return rows;
    },
    key: (row) => ({
      direction: row.direction,
      profileId: row.profileId,
      limit: row.limit,
      offset: row.offset,
    }),
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
    load: (ids) => profileFollowQuery(ctx, { where: [inArray(ProfileFollows.id, ids)] }),
    key: (profileFollow) => profileFollow?.id ?? null,
  });

export const loadProfileFollowsByIds = async (ids: string[], ctx: UserContext) => {
  const rows = await profileFollowByIdLoader(ctx).loadMany(ids);

  return rows.filter((row): row is ProfileFollowRow => row !== null && !(row instanceof Error));
};
