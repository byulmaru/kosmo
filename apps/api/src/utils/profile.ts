import { PROFILE_ACCOUNT_ORDERED_ROLES } from '@kosmo/shared/const';
import {
  ApplicationGrantProfiles,
  ApplicationGrants,
  db,
  firstOrThrowWith,
  ProfileAccounts,
  Profiles,
} from '@kosmo/shared/db';
import { ProfileAccountRole, ProfileState } from '@kosmo/shared/enums';
import { and, eq, isNull, or } from 'drizzle-orm';
import { ForbiddenError } from '@/errors';
import type { SessionContext } from '@/context';

type GetPermittedProfileIdParams = {
  ctx: SessionContext;
  actorProfileId: string | null | undefined;
  role?: ProfileAccountRole;
};

export const getPermittedProfileId = async ({
  ctx,
  actorProfileId,
  role = ProfileAccountRole.MEMBER,
}: GetPermittedProfileIdParams) => {
  if (!actorProfileId) {
    if (ctx.session.profileId) {
      return ctx.session.profileId;
    }

    throw new ForbiddenError();
  }

  const profileAccount = await db
    .select({ id: ProfileAccounts.id, role: ProfileAccounts.role })
    .from(ProfileAccounts)
    .innerJoin(
      ApplicationGrants,
      and(
        eq(ProfileAccounts.accountId, ApplicationGrants.accountId),
        eq(ApplicationGrants.applicationId, ctx.session.applicationId),
      ),
    )
    .innerJoin(
      ApplicationGrantProfiles,
      and(
        eq(ApplicationGrants.id, ApplicationGrantProfiles.applicationGrantId),
        or(
          eq(ApplicationGrantProfiles.profileId, ProfileAccounts.profileId),
          isNull(ApplicationGrantProfiles.profileId),
        ),
      ),
    )
    .innerJoin(Profiles, eq(ProfileAccounts.profileId, Profiles.id))
    .where(
      and(
        eq(ProfileAccounts.accountId, ctx.session.accountId),
        eq(ProfileAccounts.profileId, actorProfileId),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .then(firstOrThrowWith(() => new ForbiddenError()));

  if (
    role &&
    PROFILE_ACCOUNT_ORDERED_ROLES.indexOf(role) <
      PROFILE_ACCOUNT_ORDERED_ROLES.indexOf(profileAccount.role)
  ) {
    throw new ForbiddenError();
  }

  return actorProfileId;
};
