import { AccountProfiles, db, firstOrThrowWith, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, InstanceState, ProfileState } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { disableProfile } from '@kosmo/core/services';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { Profile } from '../ref';

builder.mutationField('deleteProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('DeleteProfilePayload', {
      fields: (field) => ({
        account: field.field({ type: Account }),
        profileId: field.globalID({
          resolve: (payload) => ({
            id: (payload as { profileId: string }).profileId,
            type: Profile,
          }),
        }),
        success: field.boolean(),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Profile }),
    },
    resolve: async (_, { input }, ctx) => {
      const profile = await db
        .select({ id: Profiles.id, actorRole: AccountProfiles.role })
        .from(Profiles)
        .innerJoin(AccountProfiles, eq(AccountProfiles.profileId, Profiles.id))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(Profiles.id, input.id.id),
            eq(AccountProfiles.accountId, ctx.session.accountId),
            inArray(Profiles.state, [ProfileState.ACTIVE, ProfileState.DISABLED]),
            ne(Instances.state, InstanceState.SUSPENDED),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      if (profile.actorRole !== AccountProfileRole.OWNER) {
        throw new PermissionDeniedError('Profile owner permission is required');
      }

      await disableProfile(input.id.id, db);

      return {
        account: ctx.session.accountId,
        profileId: profile.id,
        success: true,
      };
    },
  }),
);
