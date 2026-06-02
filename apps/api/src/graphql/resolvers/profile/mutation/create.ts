import { AccountProfiles, db, firstOrThrow, isUniqueViolation, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, ProfileFollowPolicy } from '@kosmo/core/enums';
import { ConflictError } from '@kosmo/core/error';
import { normalizeHandle } from '@kosmo/core/utils';
import { profileHandleSchema } from '@kosmo/core/validation';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.mutationField('createProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: Profile,
    input: {
      handle: t.input.string({ validate: profileHandleSchema }),
    },
    errors: {
      types: [ConflictError],
      dataField: { name: 'profile' },
    },
    resolve: async (_, { input }, ctx) => {
      return await db.transaction(async (tx) => {
        const profile = await tx
          .insert(Profiles)
          .values({
            handle: input.handle,
            normalizedHandle: normalizeHandle(input.handle),
            displayName: input.handle,
            followPolicy: ProfileFollowPolicy.OPEN,
          })
          .returning()
          .then(firstOrThrow)
          .catch((error) => {
            if (isUniqueViolation(error)) {
              throw new ConflictError({ message: '이미 사용 중인 핸들이에요.', field: 'handle' });
            }

            throw error;
          });

        await tx.insert(AccountProfiles).values({
          accountId: ctx.session.accountId,
          profileId: profile.id,
          role: AccountProfileRole.OWNER,
        });

        return profile;
      });
    },
  }),
);
