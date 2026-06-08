import { db, first, firstOrThrowWith, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

const UnfollowProfileSuccess = builder.objectRef<{
  profileFollowId: string | null;
  profileId: string;
}>('UnfollowProfileSuccess');

UnfollowProfileSuccess.implement({
  isTypeOf: (obj) => typeof obj === 'object' && obj !== null && 'profileFollowId' in obj,
  fields: (t) => ({
    // unfollow 후 갱신된 viewerFollow/followersCount를 클라이언트 normalized cache가 반영하도록
    // 대상 Profile을 함께 노출한다. 삭제된 관계 row는 더 이상 없으므로 ID만 반환해 Node loader가 로딩한다.
    profile: t.field({
      type: Profile,
      resolve: (obj) => obj.profileId,
    }),
    profileFollowId: t.id({
      nullable: true,
      resolve: (obj) => obj.profileFollowId,
    }),
  }),
});

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: UnfollowProfileSuccess,
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    errors: {
      types: [NotFoundError],
      directResult: true,
    },
    resolve: async (_, { input }, ctx) => {
      const targetProfile = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(and(eq(Profiles.id, input.id), eq(Profiles.state, ProfileState.ACTIVE)))
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      const deleted = await db
        .delete(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, ctx.session.profileId),
            eq(ProfileFollows.followeeProfileId, targetProfile.id),
          ),
        )
        .returning({ id: ProfileFollows.id })
        .then(first);

      return { profileFollowId: deleted?.id ?? null, profileId: targetProfile.id };
    },
  }),
);
