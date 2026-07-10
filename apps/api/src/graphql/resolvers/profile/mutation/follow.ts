import {
  db,
  first,
  firstOrThrow,
  firstOrThrowWith,
  isUniqueViolation,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
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
      const configuredLocalInstance = await resolveConfiguredLocalInstance();
      const targetProfile = await db
        .select({
          followPolicy: Profiles.followPolicy,
          id: Profiles.id,
        })
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
        return { profileFollow: existingFollow };
      }

      if (targetProfile.followPolicy !== ProfileFollowPolicy.OPEN) {
        throw new ConflictError({
          message: 'Profile requires follow request',
          field: 'id',
        });
      }

      const profileFollow = await db
        .insert(ProfileFollows)
        .values({
          followerProfileId: ctx.session.profileId,
          followeeProfileId: targetProfile.id,
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

          if (concurrentFollow) {
            return concurrentFollow;
          }

          throw new ConflictError({
            message: 'Profile follow could not be created',
            field: 'id',
          });
        });

      return { profileFollow };
    },
  }),
);
