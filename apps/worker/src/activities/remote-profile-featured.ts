import '@kosmo/core/polyfill';

import { ActivityPubActors, db, first, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES } from '@kosmo/core/temporal/workflows';
import {
  collectRemoteFeaturedItemUris,
  collectRemoteFeaturedPostIds,
  federation,
} from '@kosmo/fedify';
import { and, eq, isNotNull } from 'drizzle-orm';
import { createBoundedDocumentLoader } from './remote-document';
import type { RemoteProfileFeaturedSyncInput } from '../workflows/remote-profile-featured';

const getRemoteFeaturedContext = async (input: RemoteProfileFeaturedSyncInput) => {
  const current = await db
    .select({ instance: Instances, profile: Profiles })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ActivityPubActors.profileId, input.profileId),
        eq(ActivityPubActors.uri, input.actorUri),
      ),
    )
    .limit(1)
    .then(first);
  if (!current || current.profile.state !== ProfileState.ACTIVE) {
    return null;
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

  return { context, documentLoader, signingProfileId: follower?.id };
};

export const collectRemoteFeaturedActivity = async (
  input: RemoteProfileFeaturedSyncInput,
): Promise<string[] | null> => {
  const featuredContext = await getRemoteFeaturedContext(input);
  if (featuredContext === null) {
    return null;
  }

  return collectRemoteFeaturedPostIds({
    ...input,
    context: featuredContext.context,
    documentLoader: featuredContext.documentLoader,
  });
};

export const collectRemoteFeaturedItemsActivity = async (
  input: RemoteProfileFeaturedSyncInput,
): Promise<{
  readonly documentBytes: number;
  readonly itemUris: string[];
  readonly signingProfileId?: string;
} | null> => {
  const featuredContext = await getRemoteFeaturedContext(input);
  if (featuredContext === null) {
    return null;
  }

  const bounded = createBoundedDocumentLoader(
    featuredContext.documentLoader,
    REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES,
  );
  const itemUris = await collectRemoteFeaturedItemUris({
    documentLoader: bounded.documentLoader,
    featuredUri: input.featuredUri,
  });

  return {
    documentBytes: bounded.documentBytes,
    itemUris: itemUris.map(({ href }) => href),
    ...(featuredContext.signingProfileId === undefined
      ? {}
      : { signingProfileId: featuredContext.signingProfileId }),
  };
};
