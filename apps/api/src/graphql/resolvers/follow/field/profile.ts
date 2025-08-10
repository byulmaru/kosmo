import { db, ProfileFollows } from '@kosmo/db';
import { ProfileRelationship } from '@kosmo/enum';
import { and, eq, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.objectField(Profile, 'relationship', (t) =>
  t.field({
    type: ProfileRelationship,
    nullable: true,
    resolve: async (profile, _, ctx) => {
      if (!ctx.session?.profileId) {
        return null;
      }
      if (ctx.session.profileId === profile.id) {
        return ProfileRelationship.ME;
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
                eq(ProfileFollows.followerProfileId, myProfileId),
                inArray(ProfileFollows.followingProfileId, ids),
              ),
            );
        },

        key: (profileFollow) => profileFollow?.followingProfileId,
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
                eq(ProfileFollows.followingProfileId, myProfileId),
                inArray(ProfileFollows.followerProfileId, ids),
              ),
            );
        },

        key: (profileFollow) => profileFollow?.followerProfileId,
      });

      const [following, follower] = await Promise.all([
        followingLoader.load(profile.id),
        followerLoader.load(profile.id),
      ]);

      if (following) {
        if (follower) {
          return ProfileRelationship.MUTUAL;
        } else {
          return ProfileRelationship.FOLLOWING;
        }
      } else if (follower) {
        return ProfileRelationship.FOLLOWER;
      }
    },
  }),
);
