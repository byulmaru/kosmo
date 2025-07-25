import {
  ApplicationGrantProfiles,
  db,
  first,
  firstOrThrow,
  firstOrThrowWith,
  ProfileAccounts,
  Profiles,
  Sessions,
} from '@kosmo/shared/db';
import { ProfileAccountRole, ProfileState } from '@kosmo/shared/enums';
import { and, eq } from 'drizzle-orm';
import { ConflictError, ForbiddenError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { assertProfileAccess } from '@/utils/profile';

builder.mutationField('deleteProfile', (t) =>
  t.withAuth({ scope: 'meta-profile' }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
    },

    resolve: async (_, { input }, ctx) => {
      await assertProfileAccess({
        sessionId: ctx.session.id,
        profileId: input.profileId,
      });

      const profileAccount = await db
        .select({ role: ProfileAccounts.role })
        .from(ProfileAccounts)
        .where(
          and(
            eq(ProfileAccounts.profileId, input.profileId),
            eq(ProfileAccounts.accountId, ctx.session.accountId),
          ),
        )
        .then(first);

      if (profileAccount?.role !== ProfileAccountRole.OWNER) {
        throw new ForbiddenError();
      }

      const profile = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(and(eq(Profiles.id, input.profileId), eq(Profiles.state, ProfileState.ACTIVE)))
        .then(firstOrThrowWith(() => new ConflictError({ field: 'profileId' })));

      return await db.transaction(async (tx) => {
        await tx
          .update(Sessions)
          .set({ profileId: null })
          .where(eq(Sessions.profileId, profile.id));

        await tx
          .delete(ApplicationGrantProfiles)
          .where(eq(ApplicationGrantProfiles.profileId, profile.id));

        return await tx
          .update(Profiles)
          .set({ state: ProfileState.DELETED })
          .where(eq(Profiles.id, profile.id))
          .returning()
          .then(firstOrThrow);
      });
    },
  }),
);
