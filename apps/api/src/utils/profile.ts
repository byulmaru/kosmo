import {
  ApplicationGrantProfiles,
  ApplicationGrants,
  db,
  firstOrThrow,
  Sessions,
} from '@kosmo/shared/db';
import { and, eq } from 'drizzle-orm';
import { ForbiddenError } from '@/errors';

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