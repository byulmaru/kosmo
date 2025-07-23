import {
  ApplicationGrantProfiles,
  ApplicationGrants,
  db,
  firstOrThrow,
  ProfileAccounts,
  Sessions,
} from '@kosmo/shared/db';
import { and, eq, isNull, or } from 'drizzle-orm';
import { ForbiddenError } from '@/errors';
import type { SessionContext } from '@/context';

export async function assertProfileAccess(input: { sessionId: string; profileId: string }) {
  const session = await db
    .select({
      applicationId: Sessions.applicationId,
      accountId: Sessions.accountId,
    })
    .from(Sessions)
    .where(eq(Sessions.id, input.sessionId))
    .then(firstOrThrow);

  const allowedProfileGrants = await db
    .select({ profileId: ApplicationGrantProfiles.profileId })
    .from(ApplicationGrants)
    .innerJoin(
      ApplicationGrantProfiles,
      eq(ApplicationGrants.id, ApplicationGrantProfiles.applicationGrantId),
    )
    .where(
      and(
        eq(ApplicationGrants.applicationId, session.applicationId),
        eq(ApplicationGrants.accountId, session.accountId),
      ),
    );

  const allowedProfileIds = allowedProfileGrants.map((p) => p.profileId);

  // If ApplicationGrantProfiles.profileId is null, it means all profiles are accessible.
  if (allowedProfileIds.includes(null)) {
    return;
  }

  if (!allowedProfileIds.includes(input.profileId)) {
    throw new ForbiddenError();
  }
}

type GetActorProfileIdParams = {
  ctx: SessionContext;
  actorProfileId: string | null | undefined;
};
export const getActorProfileId = async ({ ctx, actorProfileId }: GetActorProfileIdParams) => {
  if (!actorProfileId) {
    if (ctx.session.profileId) {
      return ctx.session.profileId;
    }

    throw new ForbiddenError();
  }

  const profileAccounts = await db
    .select({ id: ProfileAccounts.id })
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
    .where(
      and(
        eq(ProfileAccounts.accountId, ctx.session.accountId),
        eq(ProfileAccounts.profileId, actorProfileId),
      ),
    );

  if (profileAccounts.length === 0) {
    throw new ForbiddenError();
  }

  return actorProfileId;
};
