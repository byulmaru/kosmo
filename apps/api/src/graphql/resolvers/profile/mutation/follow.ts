import { db, first, firstOrThrowWith, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceKind, ProfileFollowPolicy } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
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
      const targetProfile = await db
        .select({
          followPolicy: Profiles.followPolicy,
          id: Profiles.id,
        })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(Profiles.id, input.id),
            eq(Instances.kind, InstanceKind.LOCAL),
            visibleProfileWhere({ profile: Profiles, instance: Instances }),
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

      const profileFollow = await db.transaction(async (tx) => {
        const insertedFollow = await tx
          .insert(ProfileFollows)
          .values({
            followerProfileId: ctx.session.profileId,
            followeeProfileId: targetProfile.id,
          })
          .onConflictDoNothing()
          .returning()
          .then(first);

        if (insertedFollow) {
          await tx
            .update(Profiles)
            .set({ followingCount: sql`${Profiles.followingCount} + 1` })
            .where(eq(Profiles.id, ctx.session.profileId));
          await tx
            .update(Profiles)
            .set({ followersCount: sql`${Profiles.followersCount} + 1` })
            .where(eq(Profiles.id, targetProfile.id));
          return insertedFollow;
        }

        const concurrentFollow = await tx
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
