import { MAX_PROFILE_COUNT } from '@kosmo/shared/const';
import {
  ApplicationGrantProfiles,
  ApplicationGrants,
  createDbId,
  db,
  first,
  firstOrThrow,
  firstOrThrowWith,
  ProfileAccounts,
  Profiles,
  Sessions,
  TableCode,
} from '@kosmo/shared/db';
import { ProfileAccountRole, ProfileState } from '@kosmo/shared/enums';
import * as validationSchema from '@kosmo/shared/validation';
import { and, asc, count, eq, getTableColumns, sql } from 'drizzle-orm';
import { env } from '@/env';
import { ConflictError, ForbiddenError, LimitExceededError } from '@/errors';
import { assertProfileAccess } from '@/utils/profile';
import { builder } from '../builder';
import { Account, Count, Profile } from '../objects';

/**
 * Types
 */

builder.node(Profile, {
  id: { resolve: (profile) => profile.id },

  loadManyWithoutCache: async (ids, ctx) => {
    return (await Profile.getDataloader(ctx).loadMany(ids)).map((profile) =>
      profile instanceof Error ? null : profile,
    );
  },

  fields: (t) => ({
    handle: t.exposeString('handle'),
    description: t.exposeString('description', { nullable: true }),
    displayName: t.string({
      args: {
        fallback: t.arg.boolean({ defaultValue: true }),
      },
      resolve: (profile, { fallback }) => profile.displayName || (fallback ? profile.handle : ''),
    }),

    url: t.string({
      resolve: (profile) => profile.url ?? profile.uri,
    }),
  }),
});

builder.objectFields(Account, (t) => ({
  profiles: t.withAuth({ session: true }).field({
    type: [Profile],
    resolve: async (account) => {
      const profileIds = await db
        .select({
          id: ApplicationGrantProfiles.profileId,
        })
        .from(ApplicationGrants)
        .innerJoin(
          ApplicationGrantProfiles,
          eq(ApplicationGrants.id, ApplicationGrantProfiles.applicationGrantId),
        )
        .innerJoin(Profiles, eq(ApplicationGrantProfiles.profileId, Profiles.id))
        .where(
          and(eq(ApplicationGrants.accountId, account.id), eq(Profiles.state, ProfileState.ACTIVE)),
        )
        .orderBy(asc(ApplicationGrantProfiles.profileId))
        .then((rows) => rows.map((row) => row.id));

      if (profileIds.includes(null)) {
        return await db
          .select(getTableColumns(Profiles))
          .from(Profiles)
          .innerJoin(ProfileAccounts, eq(Profiles.id, ProfileAccounts.profileId))
          .where(
            and(eq(ProfileAccounts.accountId, account.id), eq(Profiles.state, ProfileState.ACTIVE)),
          )
          .orderBy(asc(Profiles.id));
      } else {
        return profileIds as string[];
      }
    },
  }),

  profileCount: t.withAuth({ session: true }).field({
    type: Count,
    resolve: (account) => ({
      currentResolver: async () => {
        return await db
          .select({ profileCount: count() })
          .from(ProfileAccounts)
          .where(eq(ProfileAccounts.accountId, account.id))
          .then((rows) => rows[0]?.profileCount ?? 0);
      },
      maxResolver: () => MAX_PROFILE_COUNT,
    }),
  }),
}));

/**
 * Queries
 */

builder.queryFields((t) => ({
  usingProfile: t.field({
    type: Profile,
    nullable: true,
    resolve: (_, __, ctx) => {
      return ctx.session?.profileId ?? null;
    },
  }),
}));

/**
 * Mutations
 */

builder.mutationFields((t) => ({
  createProfile: t.withAuth({ scope: 'meta-profile' }).fieldWithInput({
    type: Profile,
    input: {
      handle: t.input.string({ validate: { schema: validationSchema.handle } }),
      useCreatedProfile: t.input.boolean({ defaultValue: true }),
    },

    resolve: async (_, { input }, ctx) => {
      const profileCount = await db.$count(
        ProfileAccounts,
        eq(ProfileAccounts.accountId, ctx.session.accountId),
      );

      if (profileCount >= MAX_PROFILE_COUNT) {
        throw new LimitExceededError({ object: 'profile', limit: MAX_PROFILE_COUNT });
      }

      const handleConflictedProfile = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(eq(sql`LOWER(${Profiles.handle})`, input.handle.toLowerCase()))
        .then(first);

      if (handleConflictedProfile) {
        throw new ConflictError({ field: 'handle', message: 'error.handle.conflict' });
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

  useProfile: t.withAuth({ session: true }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
    },

    resolve: async (_, { input }, ctx) => {
      await assertProfileAccess({
        sessionId: ctx.session.id,
        profileId: input.profileId,
      });

      await db
        .update(Sessions)
        .set({ profileId: input.profileId })
        .where(eq(Sessions.id, ctx.session.id));

      return input.profileId;
    },
  }),

  deleteProfile: t.withAuth({ scope: 'meta-profile' }).fieldWithInput({
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
}));
