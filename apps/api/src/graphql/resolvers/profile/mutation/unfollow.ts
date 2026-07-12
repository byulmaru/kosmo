import { db, first, firstOrThrowWith, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq, getColumns, sql } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('UnfollowProfilePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        profileFollowId: field.id({ nullable: true }),
      }),
    }),
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      const targetProfile = await db
        .select(getColumns(Profiles))
        .from(Profiles)
        .where(and(eq(Profiles.id, input.id), eq(Profiles.state, ProfileState.ACTIVE)))
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      const deleted = await db.transaction(async (tx) => {
        const deletedFollow = await tx
          .delete(ProfileFollows)
          .where(
            and(
              eq(ProfileFollows.followerProfileId, ctx.session.profileId),
              eq(ProfileFollows.followeeProfileId, targetProfile.id),
            ),
          )
          .returning({ id: ProfileFollows.id })
          .then(first);

        if (!deletedFollow) {
          return undefined;
        }

        await tx
          .update(Profiles)
          .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
          .where(eq(Profiles.id, ctx.session.profileId));
        await tx
          .update(Profiles)
          .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
          .where(eq(Profiles.id, targetProfile.id));

        return deletedFollow;
      });

      return { profile: targetProfile, profileFollowId: deleted?.id ?? null };
    },
  }),
);
