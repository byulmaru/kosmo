import '@kosmo/core/polyfill';

import { MIMEType } from 'node:util';
import { Document, Image, Link, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  projectRemoteNoteContent,
  RemoteNoteContentLengthExceededError,
} from '@kosmo/core/activitypub-note-content/server';
import { db, first, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, PostVisibility, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { findPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  findUsableStoredRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { Context, InboxContext } from '@fedify/fedify';
import type { Note } from '@fedify/vocab';
import type { findStoredRemoteProfileActorByUri } from './remote-actor-materialization';

type StoredRemoteProfileActor = NonNullable<
  Awaited<ReturnType<typeof findStoredRemoteProfileActorByUri>>
>;

type RemoteNoteMaterializationContext = Pick<
  Context<void>,
  'canonicalOrigin' | 'lookupObject' | 'parseUri'
>;

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote attachment lookup is disabled');
};

const isImageAttachment = (attachment: Document): boolean => {
  if (attachment instanceof Image) {
    return true;
  }
  if (!attachment.mediaType) {
    return false;
  }

  try {
    return new MIMEType(attachment.mediaType).type === 'image';
  } catch {
    return false;
  }
};

export const projectRemoteNoteMedia = async (note: Note) => {
  const candidates: {
    altText: string | null;
    mediaType: string | null;
    url: string;
  }[] = [];

  for await (const attachment of note.getAttachments({
    contextLoader: noNetworkDocumentLoader,
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  })) {
    if (!(attachment instanceof Document) || !isImageAttachment(attachment)) {
      continue;
    }
    if (candidates.length === 4) {
      break;
    }
    if (attachment.urls.length !== 1) {
      throw new TypeError('Remote image attachment must have exactly one representation URL');
    }

    const representation = attachment.urls[0];
    const url = representation instanceof Link ? representation.href : representation;
    if (!url || !isHttpUri(url)) {
      throw new TypeError('Remote image attachment representation URL must use HTTP(S)');
    }

    const canonicalUrl = new URL(url.href).href;
    candidates.push({
      altText: attachment.name?.toString() ?? null,
      mediaType: attachment.mediaType,
      url: canonicalUrl,
    });
  }

  return candidates;
};

const projectRemoteNote = async (note: Note) => ({
  document: projectRemoteNoteContent({
    content: note.content?.toString() ?? null,
    mediaType: note.mediaType,
    summary: note.summary?.toString() ?? null,
  }),
  media: await projectRemoteNoteMedia(note),
});

const resolveReplyParentId = async (
  context: RemoteNoteMaterializationContext,
  note: Note,
): Promise<string | undefined> => {
  const replyTargetHref = uniqueHref(note.replyTargetIds);
  if (!replyTargetHref) {
    return undefined;
  }

  const replyTarget = new URL(replyTargetHref);
  if (!isHttpUri(replyTarget)) {
    return undefined;
  }

  return findPostByActivityPubUri(context, replyTarget);
};

type HydratedRemoteNoteMaterializationResult =
  | { postId: string; status: 'created' | 'duplicate' }
  | {
      reason: 'invalid_note' | 'unsupported_note' | 'unusable_author';
      status: 'rejected';
    };

type RemoteNotePostMaterializationResult =
  | {
      postId?: string;
      replyParentFallback: boolean;
      status: 'created' | 'duplicate';
    }
  | { reason: 'invalid_note'; status: 'rejected' };

type RemoteNotePostMaterialized = Extract<
  RemoteNotePostMaterializationResult,
  { status: 'created' | 'duplicate' }
>;

const resolveNoteVisibility = (
  note: Note,
  followersUri?: string | null,
): PostVisibility | undefined =>
  note.toIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)
    ? PostVisibility.PUBLIC
    : note.ccIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)
      ? PostVisibility.UNLISTED
      : followersUri && [...note.toIds, ...note.ccIds].some((uri) => uri.href === followersUri)
        ? PostVisibility.FOLLOWERS
        : undefined;

const createRemoteNotePost = async ({
  context,
  document,
  media,
  note,
  objectUri,
  profileId,
  receivedAt,
  visibility,
}: {
  context: RemoteNoteMaterializationContext;
  document: ReturnType<typeof projectRemoteNoteContent>;
  media: Awaited<ReturnType<typeof projectRemoteNoteMedia>>;
  note: Note;
  objectUri: string;
  profileId: string;
  receivedAt: Temporal.Instant;
  visibility: PostVisibility;
}): Promise<RemoteNotePostMaterializationResult> => {
  const replyParentId = await resolveReplyParentId(context, note);
  const input = {
    document,
    media,
    objectUri,
    origin: 'ACTIVITYPUB',
    profileId,
    publishedAt: note.published,
    receivedAt,
    visibility,
  } satisfies Parameters<typeof createPost>[0];
  const toResult = (result: Awaited<ReturnType<typeof createPost>>): RemoteNotePostMaterialized => {
    if (result.created) {
      return { postId: result.post.id, replyParentFallback: false, status: 'created' };
    }
    return { replyParentFallback: false, status: 'duplicate' };
  };

  try {
    const result = await createPost(replyParentId ? { ...input, replyParentId } : input);
    return toResult(result);
  } catch (error) {
    if (error instanceof ValidationError && error.field === 'media') {
      return { reason: 'invalid_note', status: 'rejected' };
    }
    if (
      !replyParentId ||
      !(
        error instanceof NotFoundError ||
        (error instanceof ValidationError && error.field === 'replyParentId')
      )
    ) {
      throw error;
    }

    const result = await createPost(input);
    const fallbackResult = await toResult(result);
    return { ...fallbackResult, replyParentFallback: true };
  }
};

export const materializeHydratedRemoteNote = async ({
  context,
  note,
  objectUri,
  receivedAt,
}: {
  context: RemoteNoteMaterializationContext;
  note: Note;
  objectUri: URL;
  receivedAt: Temporal.Instant;
}): Promise<HydratedRemoteNoteMaterializationResult> => {
  if (!isHttpUri(objectUri) || note.id?.href !== objectUri.href) {
    return { reason: 'invalid_note', status: 'rejected' };
  }

  const attributionHref = uniqueHref(note.attributionIds);
  if (!attributionHref) {
    return { reason: 'invalid_note', status: 'rejected' };
  }
  const attributionUri = new URL(attributionHref);
  if (!isHttpUri(attributionUri)) {
    return { reason: 'invalid_note', status: 'rejected' };
  }

  const visibility = resolveNoteVisibility(note);
  if (!visibility) {
    return { reason: 'unsupported_note', status: 'rejected' };
  }

  let projection;
  try {
    projection = await projectRemoteNote(note);
  } catch (error) {
    if (error instanceof RemoteNoteContentLengthExceededError || error instanceof TypeError) {
      return { reason: 'invalid_note', status: 'rejected' };
    }
    throw error;
  }

  if (
    postContentDocumentToText(projection.document).length === 0 &&
    projection.media.length === 0
  ) {
    return { reason: 'unsupported_note', status: 'rejected' };
  }

  let storedActor;
  try {
    storedActor =
      (await findUsableStoredRemoteProfileActorByUri(attributionUri)) ??
      (await findOrMaterializeRemoteProfileActorByUri({
        actorUri: attributionUri,
        context,
        now: receivedAt,
      }));
  } catch (error) {
    if (
      error instanceof RemoteActorMaterializationError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    ) {
      return { reason: 'unusable_author', status: 'rejected' };
    }
    throw error;
  }

  const result = await createRemoteNotePost({
    context,
    document: projection.document,
    media: projection.media,
    note,
    objectUri: objectUri.href,
    profileId: storedActor.profile.id,
    receivedAt,
    visibility,
  });
  if (result.status === 'rejected') {
    return result;
  }
  if (result.status === 'created') {
    return { postId: result.postId!, status: result.status };
  }

  const postId = await findPostByActivityPubUri(context, objectUri);
  if (!postId) {
    throw new Error('Remote Note Post not found after duplicate materialization');
  }
  return { postId, status: result.status };
};

const hasEstablishedFollower = async ({
  followerProfileId,
  followeeProfileId,
}: {
  followerProfileId?: string | null;
  followeeProfileId: string;
}): Promise<boolean> => {
  const row = await db
    .select({ id: ProfileFollows.id })
    .from(ProfileFollows)
    .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followerProfileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ProfileFollows.followeeProfileId, followeeProfileId),
        followerProfileId == null
          ? undefined
          : eq(ProfileFollows.followerProfileId, followerProfileId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

  return row !== undefined;
};

export const handleInboundCreateNote = async ({
  actorUri,
  context,
  note,
  objectUri,
  storedActor,
  receivedAt,
}: {
  actorUri: string;
  context: InboxContext<void>;
  note: Note;
  objectUri: string;
  storedActor: StoredRemoteProfileActor;
  receivedAt: Temporal.Instant;
}): Promise<void> => {
  if (note.id?.href !== objectUri) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'validation',
      reasonCode: 'note_identity_mismatch',
    });
    return;
  }

  const attributionUri = uniqueHref(note.attributionIds);
  if (attributionUri !== actorUri) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'validation',
      reasonCode: 'note_attribution_mismatch',
    });
    return;
  }

  const visibility = resolveNoteVisibility(note, storedActor.actor.followersUri);
  if (!visibility) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'validation',
      reasonCode: 'unsupported_note_visibility',
    });
    return;
  }

  if (
    visibility === PostVisibility.FOLLOWERS &&
    !(await hasEstablishedFollower({
      followerProfileId: context.recipient,
      followeeProfileId: storedActor.profile.id,
    }))
  ) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'validation',
      reasonCode: 'followers_visibility_without_follow',
    });
    return;
  }

  let projection;
  try {
    projection = await projectRemoteNote(note);
  } catch (error) {
    if (error instanceof RemoteNoteContentLengthExceededError) {
      observeInbound({
        outcome: 'rejected',
        activityType: 'Create',
        actorOrigin: actorUri,
        handler: 'create',
        objectOrigin: objectUri,
        phase: 'projection',
        reasonCode: 'note_content_length_exceeded',
      });
      return;
    }
    if (error instanceof TypeError) {
      observeInbound({
        outcome: 'rejected',
        activityType: 'Create',
        actorOrigin: actorUri,
        handler: 'create',
        objectOrigin: objectUri,
        phase: 'projection',
        reasonCode: 'note_media_projection_rejected',
      });
      return;
    }
    throw error;
  }

  const observeDuplicateCreate = () =>
    observeInbound({
      outcome: 'noop',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'projection',
      reasonCode: 'duplicate_create_noop',
    });

  const result = await createRemoteNotePost({
    context,
    document: projection.document,
    media: projection.media,
    note,
    objectUri,
    profileId: storedActor.profile.id,
    receivedAt,
    visibility,
  });
  if (result.status === 'rejected') {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'projection',
      reasonCode: 'note_media_validation_rejected',
    });
    return;
  }
  if (result.replyParentFallback) {
    observeInbound({
      outcome: 'noop',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'projection',
      reasonCode: 'reply_parent_missing_fallback',
    });
  }
  if (result.status === 'duplicate') {
    observeDuplicateCreate();
  }
};
