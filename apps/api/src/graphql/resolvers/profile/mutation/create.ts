import { MAX_PROFILE_COUNT } from '@kosmo/shared/const';
import {
  ApplicationGrantProfiles,
  ApplicationGrants,
  createDbId,
  db,
  first,
  firstOrThrow,
  ProfileAccounts,
  Profiles,
  Sessions,
  TableCode,
} from '@kosmo/shared/db';
import { ProfileAccountRole } from '@kosmo/shared/enums';
import * as validationSchema from '@kosmo/shared/validation';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '@/env';
import { LimitExceededError, ValidationError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.mutationField('createProfile', (t) =>
  t.withAuth({ scope: 'meta-profile' }).fieldWithInput({
    type: Profile,
    input: {
      handle: t.input.string({ validate: { schema: validationSchema.handle } }),
      useCreatedProfile: t.input.boolean({ defaultValue: true }),
    },

    errors: {
      types: [ValidationError, LimitExceededError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      const profileCount = await db.$count(
        ProfileAccounts,
        eq(ProfileAccounts.accountId, ctx.session.accountId),
      );

      if (profileCount >= MAX_PROFILE_COUNT) {
        throw new LimitExceededError({
          object: 'Profile',
          limit: MAX_PROFILE_COUNT,
          code: 'error.profile.limitExceeded',
        });
      }

      const handleConflictedProfile = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(eq(sql`LOWER(${Profiles.handle})`, input.handle.toLowerCase()))
        .then(first);

      if (handleConflictedProfile) {
        throw new ValidationError({
          path: 'input.handle',
          code: 'error.handle.conflict',
        });
      }

      return await db.transaction(async (tx) => {
        const profileId = createDbId(TableCode.Profiles);
        const profile = await tx
          .insert(Profiles)
          .values({
            id: profileId,
            handle: input.handle,
            uri: `${env.PUBLIC_WEB_DOMAIN}/profile/${profileId}`,
            inboxUri: `${env.PUBLIC_WEB_DOMAIN}/profile/${profileId}/inbox`,
            sharedInboxUri: `${env.PUBLIC_WEB_DOMAIN}/inbox`,
          })
          .returning()
          .then(firstOrThrow);

        await tx.insert(ProfileAccounts).values({
          accountId: ctx.session.accountId,
          profileId,
          role: ProfileAccountRole.OWNER,
        });

        const applicationGrant = await tx
          .select({ id: ApplicationGrants.id })
          .from(ApplicationGrants)
          .where(
            and(
              eq(ApplicationGrants.accountId, ctx.session.accountId),
              eq(ApplicationGrants.applicationId, ctx.session.applicationId),
            ),
          )
          .then(firstOrThrow);

        await tx.insert(ApplicationGrantProfiles).values({
          applicationGrantId: applicationGrant.id,
          profileId,
        });

        if (input.useCreatedProfile) {
          await tx
            .update(Sessions)
            .set({ profileId: profile.id })
            .where(eq(Sessions.id, ctx.session.id));
        }

        return profile;
      });
    },
  }),
);
