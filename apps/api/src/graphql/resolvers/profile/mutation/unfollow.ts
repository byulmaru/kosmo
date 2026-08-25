import {
  ActivityPubActors,
  db,
  firstOrThrowWith,
  Instances,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { executeProfileFollowRemoval } from '@kosmo/core/temporal/follow-command';
import { and, eq, exists, inArray, isNotNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow } from '../ref';

const FollowerProfiles = alias(Profiles, 'unfollow_follower_profile');
const FollowerInstances = alias(Instances, 'unfollow_follower_instance');

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('UnfollowProfilePayload', {
      fields: (field) => ({
        followeeProfile: field.field({ nullable: true, type: Profile }),
        followerProfile: field.field({ type: Profile }),
        profileFollowId: field.globalID({
          nullable: true,
          resolve: (payload) => {
            const { profileFollowId } = payload as { profileFollowId: string | null };
            return profileFollowId ? { id: profileFollowId, type: ProfileFollow } : null;
          },
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Profile }),
    },
    resolve: async (_, { input }, ctx) => {
      const { follow } = await db
        .select({ follow: ProfileFollows })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
        .leftJoin(
          ProfileFollows,
          and(
            eq(ProfileFollows.followerProfileId, ctx.session.profileId),
            eq(ProfileFollows.followeeProfileId, Profiles.id),
          ),
        )
        .where(
          and(
            eq(Profiles.id, input.id.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            ne(Instances.state, InstanceState.SUSPENDED),
            exists(
              db
                .select({ id: FollowerProfiles.id })
                .from(FollowerProfiles)
                .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
                .where(
                  and(
                    eq(FollowerProfiles.id, ctx.session.profileId),
                    eq(FollowerProfiles.state, ProfileState.ACTIVE),
                    eq(FollowerInstances.kind, InstanceKind.LOCAL),
                    ne(FollowerInstances.state, InstanceState.SUSPENDED),
                  ),
                ),
            ),
            or(
              eq(Instances.kind, InstanceKind.LOCAL),
              and(eq(Instances.kind, InstanceKind.ACTIVITYPUB), isNotNull(ActivityPubActors.uri)),
            ),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      const result = follow
        ? await executeProfileFollowRemoval({
            followerProfileId: ctx.session.profileId,
            followeeProfileId: input.id.id,
            expectedRowId: follow.id,
            origin: 'LOCAL',
            transition: 'UNFOLLOW',
            snapshot: {
              id: follow.id,
              followerProfileId: follow.followerProfileId,
              followeeProfileId: follow.followeeProfileId,
              createdAt: follow.createdAt.toString(),
            },
          })
        : { profileFollowId: null };
      const profiles = await db
        .select()
        .from(Profiles)
        .where(inArray(Profiles.id, [ctx.session.profileId, input.id.id]));
      const followerProfile = profiles.find(({ id }) => id === ctx.session.profileId);
      const followeeProfile = profiles.find(({ id }) => id === input.id.id);
      if (!followerProfile || !followeeProfile) {
        throw new NotFoundError('Profile not found');
      }
      return {
        ...result,
        followeeProfile,
        followerProfile,
      };
    },
  }),
);
