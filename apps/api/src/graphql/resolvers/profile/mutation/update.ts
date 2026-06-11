import { AccountProfiles, db, firstOrThrow, firstOrThrowWith, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { profileBioSchema, profileDisplayNameSchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { UpdateProfilePayload } from './payload';

builder.mutationField('updateProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: UpdateProfilePayload,
    input: {
      id: t.input.id({ validate: z.uuid() }),
      displayName: t.input.string({
        required: false,
        validate: profileDisplayNameSchema.optional(),
      }),
      bio: t.input.string({ required: false, validate: profileBioSchema.optional() }),
      followPolicy: t.input.field({ type: ProfileFollowPolicy, required: false }),
    },
    resolve: async (_, { input }, ctx) => {
      const profile = await db
        .select({ id: Profiles.id, actorRole: AccountProfiles.role })
        .from(Profiles)
        .innerJoin(AccountProfiles, eq(AccountProfiles.profileId, Profiles.id))
        .where(
          and(
            eq(Profiles.id, input.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(AccountProfiles.accountId, ctx.session.accountId),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      if (
        profile.actorRole !== AccountProfileRole.OWNER &&
        profile.actorRole !== AccountProfileRole.ADMIN
      ) {
        throw new PermissionDeniedError('Profile admin permission is required');
      }

      const updatedProfile = await db
        .update(Profiles)
        .set({
          displayName: input.displayName ?? undefined,
          bio: input.bio,
          followPolicy: input.followPolicy ?? undefined,
        })
        .where(eq(Profiles.id, input.id))
        .returning()
        .then(firstOrThrow);

      return { profile: updatedProfile };
    },
  }),
);
