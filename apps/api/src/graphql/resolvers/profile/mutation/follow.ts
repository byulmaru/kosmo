import {
  db,
  first,
  firstOrThrow,
  firstOrThrowWith,
  isUniqueViolation,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { configuredLocalProfileWhere } from '@/profile/identity';
import { ProfileFollow } from '../ref';

builder.mutationField('followProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('FollowProfilePayload', {
      fields: (field) => ({
        profileFollow: field.field({ type: ProfileFollow }),
      }),
    }),
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      const localInstance = await resolveConfiguredLocalInstance();
      const targetProfile = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(
          and(
            eq(Profiles.id, input.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            configuredLocalProfileWhere(Profiles, localInstance.id),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      if (ctx.session.profileId === targetProfile.id) {
        throw new ConflictError({ message: 'Profile cannot follow itself', field: 'id' });
      }

      const existingFollow = await db
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, ctx.session.profileId),
            eq(ProfileFollows.followeeProfileId, targetProfile.id),
          ),
        )
        .limit(1)
        .then(first);

      if (existingFollow) {
        if (existingFollow.state === ProfileFollowState.ACCEPTED) {
          return { profileFollow: existingFollow };
        }

        // PENDING/REJECTED 재요청 정책은 후속 pending 승인 플로우에서 결정한다.
        throw new ConflictError({
          message: 'Profile follow already exists with unsupported state',
          field: 'id',
        });
      }

      const profileFollow = await db
        .insert(ProfileFollows)
        .values({
          followerProfileId: ctx.session.profileId,
          followeeProfileId: targetProfile.id,
          state: ProfileFollowState.ACCEPTED,
        })
        .returning()
        .then(firstOrThrow)
        .catch(async (error) => {
          if (!isUniqueViolation(error)) {
            throw error;
          }

          const concurrentFollow = await db
            .select()
            .from(ProfileFollows)
            .where(
              and(
                eq(ProfileFollows.followerProfileId, ctx.session.profileId),
                eq(ProfileFollows.followeeProfileId, targetProfile.id),
              ),
            )
            .limit(1)
            .then(first);

          if (concurrentFollow?.state === ProfileFollowState.ACCEPTED) {
            return concurrentFollow;
          }

          throw new ConflictError({
            message: 'Profile follow already exists with unsupported state',
            field: 'id',
          });
        });

      return { profileFollow };
    },
  }),
);
