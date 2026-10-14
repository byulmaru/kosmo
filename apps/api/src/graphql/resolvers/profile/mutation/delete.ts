import {
  AccountProfiles,
  db,
  first,
  firstOrThrowWith,
  Instances,
  Profiles,
  Sessions,
} from '@kosmo/core/db';
import { AccountProfileRole, InstanceState, ProfileState, SessionState } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { disableProfile } from '@kosmo/core/services';
import { RequestCache } from '@pothos/plugin-scope-auth';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { Profile } from '../ref';

const selectCurrentSessionProfile = async (sessionId: string, accountId: string) =>
  db.transaction(async (tx) => {
    const activeSessionWhere = and(
      eq(Sessions.id, sessionId),
      eq(Sessions.accountId, accountId),
      eq(Sessions.state, SessionState.ACTIVE),
    );
    const session = await tx
      .select({ activeProfileId: Sessions.activeProfileId })
      .from(Sessions)
      .where(activeSessionWhere)
      .limit(1)
      .then(first);

    if (!session) {
      return null;
    }

    if (session.activeProfileId === null) {
      const candidate = await tx
        .select({ id: Profiles.id })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .innerJoin(
          AccountProfiles,
          and(eq(AccountProfiles.profileId, Profiles.id), eq(AccountProfiles.accountId, accountId)),
        )
        .where(visibleProfileWhere({ profile: Profiles, instance: Instances }))
        .orderBy(asc(Profiles.createdAt))
        .limit(1)
        .then(first);

      if (candidate) {
        await tx
          .update(Sessions)
          .set({ activeProfileId: candidate.id })
          .where(and(activeSessionWhere, isNull(Sessions.activeProfileId)));
      }
    }

    return tx
      .select({ profile: Profiles, role: AccountProfiles.role })
      .from(Sessions)
      .innerJoin(Profiles, eq(Profiles.id, Sessions.activeProfileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(
        AccountProfiles,
        and(eq(AccountProfiles.profileId, Profiles.id), eq(AccountProfiles.accountId, accountId)),
      )
      .where(
        and(activeSessionWhere, visibleProfileWhere({ profile: Profiles, instance: Instances })),
      )
      .limit(1)
      .then(first);
  });

builder.mutationField('deleteProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('DeleteProfilePayload', {
      fields: (field) => ({
        profileId: field.globalID({
          resolve: (payload) => ({
            id: (payload as { profileId: string }).profileId,
            type: Profile,
          }),
        }),
        selectedProfile: field.field({ type: Profile, nullable: true }),
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

      const selectedProfile = await selectCurrentSessionProfile(
        ctx.session.id,
        ctx.session.accountId,
      );
      ctx.session.profile = selectedProfile
        ? { id: selectedProfile.profile.id, role: selectedProfile.role }
        : null;
      RequestCache.clearForContext(ctx);

      return {
        profileId: profile.id,
        selectedProfile: selectedProfile?.profile ?? null,
        success: true,
      };
    },
  }),
);
