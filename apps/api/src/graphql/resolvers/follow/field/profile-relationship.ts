import { db, ProfileFollowRequests, ProfileFollows } from '@kosmo/db';
import { ProfileRelationshipState } from '@kosmo/enum';
import { and, eq, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.objectField(Profile, 'relationship', (t) =>
  t.field({
    type: builder.simpleObject('ProfileRelationship', {
      fields: (t) => ({
        to: t.field({ type: ProfileRelationshipState, nullable: true }),
        from: t.field({ type: ProfileRelationshipState, nullable: true }),
      }),
    }),
    resolve: async (profile, _, ctx) => {
      if (!ctx.session?.profileId || ctx.session.profileId === profile.id) {
        return { to: null, from: null };
      }

      const myProfileId = ctx.session.profileId;

      const followingLoader = ctx.loader({
        name: 'Profile.relationship.following',
        nullable: true,
        load: async (ids) => {
          return await db
            .select()
            .from(ProfileFollows)
            .where(
              and(
                eq(ProfileFollows.profileId, myProfileId),
                inArray(ProfileFollows.targetProfileId, ids),
              ),
            );
        },

        key: (profileFollow) => profileFollow?.targetProfileId,
      });

      const followerLoader = ctx.loader({
        name: 'Profile.relationship.follower',
        nullable: true,
        load: async (ids) => {
          return await db
            .select()
            .from(ProfileFollows)
            .where(
              and(
                eq(ProfileFollows.targetProfileId, myProfileId),
                inArray(ProfileFollows.profileId, ids),
              ),
            );
        },

        key: (profileFollow) => profileFollow?.profileId,
      });

      const sentFollowRequestLoader = ctx.loader({
        name: 'Profile.relationship.sentFollowRequest',
        nullable: true,
        load: async (ids) => {
          return await db
            .select()
            .from(ProfileFollowRequests)
            .where(
              and(
                eq(ProfileFollowRequests.profileId, myProfileId),
                inArray(ProfileFollowRequests.targetProfileId, ids),
              ),
            );
        },

        key: (profileFollowRequest) => profileFollowRequest?.profileId,
      });

      const receivedFollowRequestLoader = ctx.loader({
        name: 'Profile.relationship.receivedFollowRequest',
        nullable: true,
        load: async (ids) => {
          return await db
            .select()
            .from(ProfileFollowRequests)
            .where(inArray(ProfileFollowRequests.targetProfileId, ids));
        },

        key: (profileFollowRequest) => profileFollowRequest?.targetProfileId,
      });

      const [following, follower, sentFollowRequest, receivedFollowRequest] = await Promise.all([
        followingLoader.load(profile.id),
        followerLoader.load(profile.id),
        sentFollowRequestLoader.load(profile.id),
        receivedFollowRequestLoader.load(profile.id),
      ]);

      return {
        to: following
          ? ProfileRelationshipState.FOLLOW
          : sentFollowRequest
            ? ProfileRelationshipState.REQUEST_FOLLOW
            : null,
        from: follower
          ? ProfileRelationshipState.FOLLOW
          : receivedFollowRequest
            ? ProfileRelationshipState.REQUEST_FOLLOW
            : null,
      };
    },
  }),
);
