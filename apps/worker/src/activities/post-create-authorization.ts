import { AccountProfiles, Accounts, first, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, AccountProfileRoleOrder, AccountState } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { visibleProfileWhere } from '@kosmo/core/visibility';
import { and, eq } from 'drizzle-orm';
import type { Transaction } from '@kosmo/core/db';

export const assertLocalPostRequestAuthorization = async (
  tx: Transaction,
  input: {
    readonly origin: 'LOCAL' | 'ACTIVITYPUB';
    readonly accountId?: string;
    readonly profileId: string;
  },
): Promise<void> => {
  if (input.origin !== 'LOCAL' || input.accountId === undefined) {
    throw new PermissionDeniedError('Active Account membership is required to create this Post');
  }

  const account = await tx
    .select({ state: Accounts.state })
    .from(Accounts)
    .where(eq(Accounts.id, input.accountId))
    .limit(1)
    .then(first);
  if (!account || account.state !== AccountState.ACTIVE) {
    throw new PermissionDeniedError('Active Account membership is required to create this Post');
  }

  const membership = await tx
    .select({ role: AccountProfiles.role })
    .from(AccountProfiles)
    .innerJoin(Profiles, eq(Profiles.id, AccountProfiles.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(AccountProfiles.accountId, input.accountId),
        eq(AccountProfiles.profileId, input.profileId),
        visibleProfileWhere({ profile: Profiles, instance: Instances }),
      ),
    )
    .limit(1)
    .then(first);
  const roleIndex = membership ? AccountProfileRoleOrder.indexOf(membership.role) : -1;
  if (roleIndex < AccountProfileRoleOrder.indexOf(AccountProfileRole.MEMBER)) {
    throw new PermissionDeniedError('Active Account membership is required to create this Post');
  }
};
