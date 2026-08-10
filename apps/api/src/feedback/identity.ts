import { first, getDatabaseConnection, Instances, Profiles } from '@kosmo/core/db';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { eq } from 'drizzle-orm';
import { formatRelativeHandle } from '@/profile/identity';
import type { DatabaseHandle } from '@kosmo/core/db';
import type { FeedbackIdentity } from './delivery';

export const resolveFeedbackIdentity = async (
  accountId: string,
  profileId: string | null,
  handle?: DatabaseHandle,
): Promise<FeedbackIdentity> => {
  if (!profileId) {
    return { accountId, profile: null };
  }

  const profile = await getDatabaseConnection(handle)
    .select({
      displayName: Profiles.displayName,
      handle: Profiles.handle,
      id: Profiles.id,
      instanceDomain: Instances.domain,
      instanceId: Profiles.instanceId,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(eq(Profiles.id, profileId))
    .limit(1)
    .then(first);

  if (!profile) {
    return { accountId, profile: null };
  }

  const configuredLocalInstance = await resolveConfiguredLocalInstance();

  return {
    accountId,
    profile: {
      displayName: profile.displayName,
      id: profile.id,
      relativeHandle: formatRelativeHandle(profile, {
        configuredLocalInstance,
        profileInstance: { domain: profile.instanceDomain, id: profile.instanceId },
      }),
    },
  };
};
