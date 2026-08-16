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
import { InstanceKind } from '@kosmo/core/enums';
import { deletePost } from '@kosmo/core/services';
import { and, eq, isNotNull } from 'drizzle-orm';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import {
  observeInboundExternalFailure,
  observeInboundNoop,
  observeInboundRejected,
} from './inbound-observability';
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
    observeInboundRejected({
      activityType: 'Delete',
      handler: 'delete',
      phase: 'validation',
      reasonCode: 'invalid_activity_identity',
    });
    return;
  }

  const embedded = await activity.getObject({
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  if (embedded === null && !activity.objectId) {
    observeInboundExternalFailure({
      activityType: 'Delete',
      actorOrigin: actorUri.origin,
      handler: 'delete',
      objectOrigin: objectUri.origin,
      phase: 'object_lookup',
      reasonCode: 'delete_object_lookup_failed',
    });
    // Without the direct object identity, a failed lookup cannot authenticate the target.
    return;
  }
  if (
    embedded !== null &&
    (!(embedded instanceof Tombstone) || embedded.id?.href !== objectUri.href)
  ) {
    observeInboundRejected({
      activityType: 'Delete',
      actorOrigin: actorUri.origin,
      handler: 'delete',
      objectOrigin: objectUri.origin,
      phase: 'protocol',
      reasonCode: 'delete_object_not_matching_tombstone',
    });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const row = await tx
      .select({
        actorUri: ActivityPubActors.uri,
        instanceKind: Instances.kind,
        postId: Posts.id,
        profileId: Profiles.id,
      })
      .from(ActivityPubPosts)
      .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .where(and(eq(ActivityPubPosts.uri, objectUri.href), isNotNull(Posts.currentContentId)))
      .limit(1)
      .then(first);

    if (!row || row.actorUri !== actorUri.href || row.instanceKind !== InstanceKind.ACTIVITYPUB) {
      observeInboundNoop({
        activityType: 'Delete',
        actorOrigin: actorUri.origin,
        handler: 'delete',
        objectOrigin: objectUri.origin,
        phase: 'projection',
        reasonCode: 'delete_target_missing_or_mismatched',
      });
      return;
    }

    const deleted = await deletePost(
      {
        actorProfileId: row.profileId,
        origin: 'ACTIVITYPUB',
        postId: row.postId,
      },
      tx,
    );
    return deleted;
  });

  await result?.postCommit?.();
};
