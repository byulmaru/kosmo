import { KOSMO_INSTANCE_ID, MAX_PROFILE_COUNT } from '@kosmo/const';
import { ApplicationGrantProfiles, ApplicationGrants, db, firstOrThrow, Sessions } from '@kosmo/db';
import { ProfileService } from '@kosmo/service';
import * as validationSchema from '@kosmo/validation';
import { and, eq } from 'drizzle-orm';
import { LimitExceededError, ValidationError } from '@/error';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.mutationField('createProfile', (t) =>
  t.withAuth({ scope: 'meta-profile' }).fieldWithInput({
    type: Profile,
    input: {
      handle: t.input.string({ validate: validationSchema.handle }),
      useCreatedProfile: t.input.boolean({ defaultValue: true }),
    },

    errors: {
      types: [ValidationError, LimitExceededError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      try {
        const profileId = await ProfileService.create.call({
          accountId: ctx.session.accountId,
          instanceId: KOSMO_INSTANCE_ID,
          handle: input.handle,
        });

        const applicationGrant = await db
          .select({ id: ApplicationGrants.id })
          .from(ApplicationGrants)
          .where(
            and(
              eq(ApplicationGrants.accountId, ctx.session.accountId),
              eq(ApplicationGrants.applicationId, ctx.session.applicationId),
            ),
          )
          .then(firstOrThrow);

        await db.insert(ApplicationGrantProfiles).values({
          applicationGrantId: applicationGrant.id,
          profileId,
        });

        if (input.useCreatedProfile) {
          await db.update(Sessions).set({ profileId }).where(eq(Sessions.id, ctx.session.id));
        }

        return profileId;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'PROFILE_LIMIT_EXCEEDED') {
            throw new LimitExceededError({
              object: 'Profile',
              limit: MAX_PROFILE_COUNT,
              code: 'error.profile.limitExceeded',
            });
          }
          if (error.message === 'HANDLE_CONFLICT') {
            throw new ValidationError({
              path: 'input.handle',
              code: 'error.handle.conflict',
            });
          }
        }
        throw error;
      }
    },
  }),
);
