import { Create, Delete, PUBLIC_COLLECTION } from '@fedify/vocab';
import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { localOutboundFederation } from './local-outbound-federation';
import { projectLocalPostNote } from './local-post-note';
import { dispatchActivityPubActivity } from './outbound-recipient-dispatch';

const ReplyParents = alias(Posts, 'local_post_delivery_reply_parent');
const ReplyParentProfiles = alias(Profiles, 'local_post_delivery_reply_parent_profile');
const ReplyParentInstances = alias(Instances, 'local_post_delivery_reply_parent_instance');

const noteUri = (canonicalOrigin: string | URL, postId: string): URL =>
  new URL(`/ap/note/${postId}`, canonicalOrigin);

const getFollowersUri = (actorUri: URL): URL =>
  new URL(`${actorUri.pathname.replace(/\/$/, '')}/followers`, actorUri);

export const sendLocalPostCreate = async (postId: string): Promise<void> => {
  const source = await db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      localInstanceId: Instances.id,
      parentInstanceKind: ReplyParentInstances.kind,
      parentProfileId: ReplyParentProfiles.id,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ReplyParents, eq(ReplyParents.id, Posts.replyParentId))
    .leftJoin(ReplyParentProfiles, eq(ReplyParentProfiles.id, ReplyParents.profileId))
    .leftJoin(ReplyParentInstances, eq(ReplyParentInstances.id, ReplyParentProfiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.ACTIVE),
        isNotNull(Posts.currentContentId),
        ne(Posts.visibility, PostVisibility.DIRECT),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.canonicalOrigin) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const projection = await projectLocalPostNote(context, postId);
  if (!projection) {
    return;
  }

  const objectUri = noteUri(projection.canonicalOrigin, postId);
  const activity = new Create({
    actor: context.getActorUri(projection.authorProfileId),
    ccs: projection.object.ccIds,
    id: new URL('#create', objectUri),
    object: projection.object,
    published: projection.createdAt,
    tos: projection.object.toIds,
  });
  const directProfileId =
    projection.replyParentId &&
    (projection.visibility === PostVisibility.PUBLIC ||
      projection.visibility === PostVisibility.UNLISTED) &&
    source.parentInstanceKind === InstanceKind.ACTIVITYPUB
      ? source.parentProfileId
      : null;
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: projection.authorProfileId,
    context,
    directProfileIds: directProfileId ? [directProfileId] : [],
    orderingKey: objectUri.href,
  });
};

export const sendLocalPostDelete = async (postId: string): Promise<void> => {
  const source = await db
    .select({
      authorProfileId: Profiles.id,
      canonicalOrigin: Instances.canonicalOrigin,
      deletedAt: Posts.deletedAt,
      localInstanceId: Instances.id,
      parentInstanceKind: ReplyParentInstances.kind,
      parentProfileId: ReplyParentProfiles.id,
      replyParentId: Posts.replyParentId,
      visibility: Posts.visibility,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ReplyParents, eq(ReplyParents.id, Posts.replyParentId))
    .leftJoin(ReplyParentProfiles, eq(ReplyParentProfiles.id, ReplyParents.profileId))
    .leftJoin(ReplyParentInstances, eq(ReplyParentInstances.id, ReplyParentProfiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.DELETED),
        isNotNull(Posts.currentContentId),
        isNotNull(Posts.deletedAt),
        ne(Posts.visibility, PostVisibility.DIRECT),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.canonicalOrigin || !source.deletedAt) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const actorUri = context.getActorUri(source.authorProfileId);
  const followersUri = getFollowersUri(actorUri);
  const objectUri = noteUri(source.canonicalOrigin, postId);
  const activity = new Delete({
    actor: actorUri,
    ccs:
      source.visibility === PostVisibility.PUBLIC
        ? [followersUri]
        : source.visibility === PostVisibility.UNLISTED
          ? [PUBLIC_COLLECTION]
          : [],
    id: new URL('#delete', objectUri),
    object: objectUri,
    published: source.deletedAt,
    tos: source.visibility === PostVisibility.PUBLIC ? [PUBLIC_COLLECTION] : [followersUri],
  });
  const directProfileId =
    source.replyParentId &&
    (source.visibility === PostVisibility.PUBLIC ||
      source.visibility === PostVisibility.UNLISTED) &&
    source.parentInstanceKind === InstanceKind.ACTIVITYPUB
      ? source.parentProfileId
      : null;
  await dispatchActivityPubActivity({
    activity,
    actorProfileId: source.authorProfileId,
    context,
    directProfileIds: directProfileId ? [directProfileId] : [],
    orderingKey: objectUri.href,
  });
};
