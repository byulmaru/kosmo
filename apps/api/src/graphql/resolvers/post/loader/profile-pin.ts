import { db, Instances, Posts, ProfilePinnedPosts, Profiles } from '@kosmo/core/db';
import { profilePostListAccessWhere } from '@kosmo/core/visibility';
import { and, eq, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type ProfilePinRow = { postId: string };

export const postProfilePinLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfilePinRow, string, true>({
    name: 'post.profilePin',
    nullable: true,
    load: async (postIds) =>
      db
        .select({ postId: Posts.id })
        .from(ProfilePinnedPosts)
        .innerJoin(Posts, eq(Posts.id, ProfilePinnedPosts.postId))
        .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(Posts.id, postIds),
            eq(ProfilePinnedPosts.profileId, Posts.profileId),
            profilePostListAccessWhere({
              db,
              visitedProfileId: Posts.profileId,
              viewerProfileId: ctx.session?.profile?.id,
            }),
          ),
        ),
    key: (row) => row?.postId ?? null,
  });
