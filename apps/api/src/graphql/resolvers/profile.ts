import { MAX_PROFILE_COUNT } from '@kosmo/shared/const';
import {
  ApplicationGrantProfiles,
  ApplicationGrants,
  createDbId,
  db,
  first,
  firstOrThrow,
  firstOrThrowWith,
  ListMembers,
  Lists,
  ProfileAccounts,
  Profiles,
  Sessions,
  TableCode,
} from '@kosmo/shared/db';
import { ListMemberRole, ProfileAccountRole, ProfileState } from '@kosmo/shared/enums';
import { federation } from '@kosmo/shared/federation';
import * as validationSchema from '@kosmo/shared/validation';
import { and, asc, count, eq, getTableColumns, sql } from 'drizzle-orm';
import { ConflictError, ForbiddenError, LimitExceededError } from '@/errors';
import { assertProfileAccess } from '@/utils/profile';
import { builder } from '../builder';
import { Account, Count, IProfile, ManagedProfile, PublicProfile } from '../objects';

/**
 * Types
 */

IProfile.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
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

ManagedProfile.implement({
  interfaces: () => [IProfile],
});

PublicProfile.implement({
  interfaces: () => [IProfile],
});

builder.objectFields(Account, (t) => ({
  profiles: t.withAuth({ session: true }).field({
    type: [ManagedProfile],
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
        .where(eq(ApplicationGrants.accountId, account.id))
        .orderBy(asc(ApplicationGrantProfiles.profileId))
        .then((rows) => rows.map((row) => row.id));

      if (profileIds.includes(null)) {
        return await db
          .select(getTableColumns(Profiles))
          .from(Profiles)
          .innerJoin(ProfileAccounts, eq(Profiles.id, ProfileAccounts.profileId))
          .where(eq(ProfileAccounts.accountId, account.id))
          .orderBy(asc(Profiles.id));
      } else {
        return profileIds as string[];
      }
    },
  }),

  profileCount: t.withAuth({ session: true }).field({
    type: Count,
    resolve: (account) => ({
      currentLoader: async () => {
        return await db
          .select({ profileCount: count() })
          .from(ProfileAccounts)
          .where(eq(ProfileAccounts.accountId, account.id))
          .then((rows) => rows[0]?.profileCount ?? 0);
      },
      maxLoader: () => MAX_PROFILE_COUNT,
    }),
  }),
}));

/**
 * Queries
 */

builder.queryFields((t) => ({
  usingProfile: t.withAuth({ session: true }).field({
    type: ManagedProfile,
    nullable: true,
    resolve: (_, __, ctx) => {
      return ctx.session.profileId ?? null;
    },
  }),
}));

/**
 * Mutations
 */

builder.mutationFields((t) => ({
  createProfile: t.withAuth({ scope: 'meta-profile' }).fieldWithInput({
    type: ManagedProfile,
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

      const fedifyContext = federation.createContext(ctx.c.req.raw, null);

      return await db.transaction(async (tx) => {
        const list = await tx
          .insert(Lists)
          .values({
            name: '기본 팔로잉 목록',
          })
          .returning({ id: Lists.id })
          .then(firstOrThrow);

        const profileId = createDbId(TableCode.Profiles);
        const profile = await tx
          .insert(Profiles)
          .values({
            id: profileId,
            handle: input.handle,
            uri: fedifyContext.getActorUri(profileId).href,
            inboxUri: fedifyContext.getInboxUri(profileId).href,
            sharedInboxUri: fedifyContext.getInboxUri().href,
            defaultFollowingListId: list.id,
          })
          .returning()
          .then(firstOrThrow);

        await tx.insert(ProfileAccounts).values({
          accountId: ctx.session.accountId,
          profileId,
          role: ProfileAccountRole.OWNER,
        });

        await tx.insert(ListMembers).values({
          listId: list.id,
          profileId,
          role: ListMemberRole.OWNER,
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
    type: ManagedProfile,
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
    type: ManagedProfile,
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

      await db
        .update(Sessions)
        .set({ profileId: null })
        .where(eq(Sessions.profileId, input.profileId));

      return await db
        .update(Profiles)
        .set({ state: ProfileState.DELETED })
        .where(eq(Profiles.id, profile.id))
        .returning()
        .then(firstOrThrow);
    },
  }),
}));
