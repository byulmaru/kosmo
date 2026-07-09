import { db, first, firstOrThrowWith, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, getColumns, isNull, or } from 'drizzle-orm';
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
      const configuredLocalInstance = await resolveConfiguredLocalInstance();
      const targetProfile = await db
        .select(getColumns(Profiles))
        .from(Profiles)
        .where(
          and(
            eq(Profiles.id, input.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            or(isNull(Profiles.instanceId), eq(Profiles.instanceId, configuredLocalInstance.id)),
          ),
        )
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

      return { profile: targetProfile, profileFollowId: deleted?.id ?? null };
    },
  }),
);
