import { Create, Delete, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  PostMentions,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isHttpUri } from './activitypub-uri';
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

const parseHttpUri = (value: string | null): URL | null => {
  try {
    const uri = new URL(value ?? '');
    return isHttpUri(uri) ? uri : null;
  } catch {
    return null;
  }
};

const getMentionDeliveryRecipients = async (postId: string, contentId: string) => {
  const mentions = await db
    .select({
      inboxUri: ActivityPubActors.inboxUri,
      profileId: Profiles.id,
      uri: ActivityPubActors.uri,
    })
    .from(Posts)
    .innerJoin(PostMentions, eq(PostMentions.postContentId, Posts.currentContentId))
    .innerJoin(Profiles, eq(Profiles.id, PostMentions.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.currentContentId, contentId),
        inArray(Posts.visibility, [
          PostVisibility.DIRECT,
          PostVisibility.PUBLIC,
          PostVisibility.UNLISTED,
        ]),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(ActivityPubActors.inboxUri),
      ),
    );
  const profileIds = new Set<string>();
  const actorUris = new Map<string, URL>();
  for (const mention of mentions) {
    const actorUri = parseHttpUri(mention.uri);
    if (!actorUri || !parseHttpUri(mention.inboxUri)) {
      continue;
    }
    profileIds.add(mention.profileId);
    actorUris.set(actorUri.href, actorUri);
  }
  return {
    actorUris: [...actorUris.values()],
    profileIds: [...profileIds],
  };
};

export const sendLocalPostCreate = async (postId: string): Promise<void> => {
  const source = await db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      contentId: Posts.currentContentId,
      localInstanceId: Instances.id,
      parentInstanceKind: ReplyParentInstances.kind,
      parentProfileId: ReplyParentProfiles.id,
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
        eq(Posts.state, PostState.ACTIVE),
        isNotNull(Posts.currentContentId),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.canonicalOrigin || !source.contentId) {
    return;
  }

  const mentionRecipients =
    source.visibility === PostVisibility.DIRECT ||
    source.visibility === PostVisibility.PUBLIC ||
    source.visibility === PostVisibility.UNLISTED
      ? await getMentionDeliveryRecipients(postId, source.contentId)
      : null;
  if (source.visibility === PostVisibility.DIRECT && !mentionRecipients?.profileIds.length) {
    return;
  }

  const context = localOutboundFederation.createContext(new URL(source.canonicalOrigin), {
    localInstanceId: source.localInstanceId,
  });
  const projection = await projectLocalPostNote(
    context,
    postId,
    source.visibility === PostVisibility.DIRECT && mentionRecipients
      ? { directRecipientUris: mentionRecipients.actorUris }
      : undefined,
  );
  if (!projection) {
    return;
  }
  if (
    (mentionRecipients && projection.contentId !== source.contentId) ||
    (source.visibility === PostVisibility.DIRECT && projection.visibility !== PostVisibility.DIRECT)
  ) {
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
    directProfileIds: [
      ...(mentionRecipients?.profileIds ?? []),
      ...(directProfileId ? [directProfileId] : []),
    ],
    ...(source.visibility === PostVisibility.DIRECT ? { directOnly: true } : {}),
  });
};

export const sendLocalPostDelete = async (postId: string): Promise<void> => {
  const source = await db
    .select({
      authorProfileId: Profiles.id,
      canonicalOrigin: Instances.canonicalOrigin,
      contentId: Posts.currentContentId,
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
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
      ),
    )
    .limit(1)
    .then(first);
  if (!source?.canonicalOrigin || !source.contentId || !source.deletedAt) {
    return;
  }

  const mentionRecipients =
    source.visibility === PostVisibility.DIRECT ||
    source.visibility === PostVisibility.PUBLIC ||
    source.visibility === PostVisibility.UNLISTED
      ? await getMentionDeliveryRecipients(postId, source.contentId)
      : null;
  if (source.visibility === PostVisibility.DIRECT && !mentionRecipients?.profileIds.length) {
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
        ? [followersUri, ...(mentionRecipients?.actorUris ?? [])]
        : source.visibility === PostVisibility.UNLISTED
          ? [PUBLIC_COLLECTION, ...(mentionRecipients?.actorUris ?? [])]
          : [],
    id: new URL('#delete', objectUri),
    object: objectUri,
    published: source.deletedAt,
    tos:
      source.visibility === PostVisibility.DIRECT && mentionRecipients
        ? mentionRecipients.actorUris
        : source.visibility === PostVisibility.PUBLIC
          ? [PUBLIC_COLLECTION]
          : [followersUri],
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
    directProfileIds: [
      ...(mentionRecipients?.profileIds ?? []),
      ...(directProfileId ? [directProfileId] : []),
    ],
    ...(source.visibility === PostVisibility.DIRECT ? { directOnly: true } : {}),
  });
};
