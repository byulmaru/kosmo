import { AccountProfiles, db, firstOrThrowWith, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, AccountProfileRoleOrder } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { visibleProfileWhere } from './visibility';
import type { SessionWithProfileContext } from '@/context';

export const resolveComposerProfileId = async (
  ctx: SessionWithProfileContext,
  profileId?: string,
) => {
  if (!profileId) {
    return ctx.session.profile.id;
  }

  const profile = await db
    .select({ id: Profiles.id, role: AccountProfiles.role })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(
      AccountProfiles,
      and(
        eq(AccountProfiles.profileId, Profiles.id),
        eq(AccountProfiles.accountId, ctx.session.accountId),
      ),
    )
    .where(
      and(
        eq(Profiles.id, profileId),
        visibleProfileWhere({ profile: Profiles, instance: Instances }),
      ),
    )
    .limit(1)
    .then(firstOrThrowWith(() => new PermissionDeniedError('Profile membership is required')));

  if (
    AccountProfileRoleOrder.indexOf(profile.role) <
    AccountProfileRoleOrder.indexOf(AccountProfileRole.MEMBER)
  ) {
    throw new PermissionDeniedError('Profile membership is required');
  }

  return profile.id;
};
