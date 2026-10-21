import { db, Instances, Posts, ProfilePinnedPosts, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { profilePostListAccessWhere } from '@kosmo/core/visibility';
import { and, asc, eq, getColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Post } from '../../post/ref';
import { Profile } from '../ref';

builder.objectField(Profile, 'pinnedPosts', (t) =>
  t.field({
    type: [Post],
    resolve: async (profile, _, ctx) => {
      const instance = await db
        .select({ kind: Instances.kind })
        .from(Instances)
        .where(eq(Instances.id, profile.instanceId))
        .limit(1)
        .then((rows) => rows[0]);
      const remote = instance?.kind === InstanceKind.ACTIVITYPUB;

      return db
        .select(getColumns(Posts))
        .from(ProfilePinnedPosts)
        .innerJoin(Posts, eq(Posts.id, ProfilePinnedPosts.postId))
        .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(ProfilePinnedPosts.profileId, profile.id),
            profilePostListAccessWhere({
              db,
              visitedProfileId: profile.id,
              viewerProfileId: ctx.session?.profile?.id,
            }),
          ),
        )
        .orderBy(
          ...(remote
            ? [asc(ProfilePinnedPosts.position), asc(ProfilePinnedPosts.id)]
            : [asc(ProfilePinnedPosts.id)]),
        );
    },
  }),
);
