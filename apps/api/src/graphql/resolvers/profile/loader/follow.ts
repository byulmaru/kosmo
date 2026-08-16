import { db, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { profileFollowAccessWhere } from '../access/follow';
import type { UserContext } from '@/context';

export type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

const FollowerProfiles = alias(Profiles, 'profile_follow_follower_profile');
const FolloweeProfiles = alias(Profiles, 'profile_follow_followee_profile');
const FollowerInstances = alias(Instances, 'profile_follow_follower_instance');
const FolloweeInstances = alias(Instances, 'profile_follow_followee_instance');

export const viewerFollowLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowRow, string, true>({
    name: 'profileFollow.viewerFollow',
    nullable: true,
    load: async (ids) => {
      if (!ctx.session?.profileId) {
        return [];
      }

      return await db
        .select(getColumns(ProfileFollows))
        .from(ProfileFollows)
        .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
        .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
        .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
        .innerJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
        .where(
          and(
            eq(ProfileFollows.followerProfileId, ctx.session.profileId),
            inArray(ProfileFollows.followeeProfileId, ids),
            profileFollowAccessWhere({
              ctx,
              followerInstance: FollowerInstances,
              followerProfile: FollowerProfiles,
              followeeInstance: FolloweeInstances,
              followeeProfile: FolloweeProfiles,
            }),
          ),
        );
    },
    key: (profileFollow) => profileFollow?.followeeProfileId ?? null,
  });

export const profileFollowByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfileFollowRow, string, true>({
    name: 'profileFollow.byId',
    nullable: true,
    load: async (ids) => {
      return db
        .select(getColumns(ProfileFollows))
        .from(ProfileFollows)
        .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
        .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
        .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
        .innerJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
        .where(
          and(
            inArray(ProfileFollows.id, ids),
            profileFollowAccessWhere({
              ctx,
              followerInstance: FollowerInstances,
              followerProfile: FollowerProfiles,
              followeeInstance: FolloweeInstances,
              followeeProfile: FolloweeProfiles,
            }),
          ),
        );
    },
    key: (profileFollow) => profileFollow?.id ?? null,
  });
