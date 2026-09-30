import '@kosmo/core/polyfill';

import { ActivityPubActors, db, first, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { federation, syncRemoteFeaturedSnapshot } from '@kosmo/fedify';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { RemoteProfileFeaturedSyncInput } from '../workflows/remote-profile-featured';

export const syncRemoteFeaturedActivity = async (
  input: RemoteProfileFeaturedSyncInput,
): Promise<void> => {
  const current = await db
    .select({ actor: ActivityPubActors, instance: Instances, profile: Profiles })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ActivityPubActors.profileId, input.profileId),
        eq(ActivityPubActors.uri, input.actorUri),
        eq(ActivityPubActors.featuredUri, input.featuredUri),
        eq(ActivityPubActors.featuredRevision, input.revision),
      ),
    )
    .limit(1)
    .then(first);
  if (!current || current.profile.state !== ProfileState.ACTIVE) {
    return;
  }
  if (
    current.instance.kind !== InstanceKind.ACTIVITYPUB ||
    current.instance.state !== InstanceState.ACTIVE
  ) {
    throw new Error('Remote Featured actor instance is unavailable');
  }

  const localInstance = await resolveConfiguredLocalInstance({
    publicOrigin: process.env.PUBLIC_ORIGIN,
  });
  const follower = await db
    .select({ id: Profiles.id, origin: Instances.canonicalOrigin })
    .from(ProfileFollows)
    .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followerProfileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ProfileFollows.followeeProfileId, input.profileId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.id, localInstance.id),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
      ),
    )
    .orderBy(Profiles.id)
    .limit(1)
    .then(first);

  const origin = follower?.origin ?? localInstance.canonicalOrigin;
  const context = federation.createContext(new URL(origin), undefined);
  const documentLoader = follower
    ? await context.getDocumentLoader({ identifier: follower.id })
    : context.documentLoader;
  await syncRemoteFeaturedSnapshot({
    ...input,
    context,
    documentLoader,
    followerProfileId: follower?.id,
  });
};
