import '@kosmo/core/polyfill';

import { Tombstone } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  first,
  Instances,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { deletePost } from '@kosmo/core/services';
import { and, eq, isNotNull } from 'drizzle-orm';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import type { InboxContext } from '@fedify/fedify';
import type { Delete } from '@fedify/vocab';

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Delete: ${url}`);
};

export const handleInboundDelete = async (
  _context: InboxContext<void>,
  activity: Delete,
): Promise<void> => {
  const actorHref = uniqueHref(activity.actorIds);
  const objectHref = uniqueHref(activity.objectIds);
  const actorUri = actorHref ? new URL(actorHref) : null;
  const objectUri = objectHref ? new URL(objectHref) : null;

  if (!isHttpUri(actorUri) || !isHttpUri(objectUri)) {
    return;
  }

  const embedded = await activity.getObject({
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  if (
    embedded !== null &&
    (!(embedded instanceof Tombstone) || embedded.id?.href !== objectUri.href)
  ) {
    return;
  }

  await db.transaction(async (tx) => {
    const row = await tx
      .select({
        actorUri: ActivityPubActors.uri,
        instanceKind: Instances.kind,
        instanceState: Instances.state,
        postId: Posts.id,
        profileId: Profiles.id,
        profileState: Profiles.state,
      })
      .from(ActivityPubPosts)
      .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .where(and(eq(ActivityPubPosts.uri, objectUri.href), isNotNull(Posts.currentContentId)))
      .limit(1)
      .then(first);

    if (
      !row ||
      row.actorUri !== actorUri.href ||
      row.instanceKind !== InstanceKind.ACTIVITYPUB ||
      (row.instanceState !== InstanceState.ACTIVE &&
        row.instanceState !== InstanceState.UNRESPONSIVE) ||
      row.profileState !== ProfileState.ACTIVE
    ) {
      return;
    }

    await deletePost({ actorProfileId: row.profileId, postId: row.postId }, tx);
  });
};
