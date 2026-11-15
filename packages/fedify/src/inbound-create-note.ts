import '@kosmo/core/polyfill';

import { randomUUID } from 'node:crypto';
import { MIMEType } from 'node:util';
import { Document, Emoji, Hashtag, Image, Link, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  projectRemoteNoteContent,
  RemoteNoteContentLengthExceededError,
  RemoteNoteMentionLimitExceededError,
} from '@kosmo/core/activitypub-note-content/server';
import { PostVisibility } from '@kosmo/core/enums';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import { createPost, ProfilePairBlockedError } from '@kosmo/core/services';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { postCreateWorkflow } from '@kosmo/core/temporal/post-create';
import { remoteProfileRefreshWorkflow } from '@kosmo/core/temporal/workflows';
import { findPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import {
  collectInboundMentionTargetHrefs,
  resolveStoredInboundMentionCandidates,
} from './inbound-mention';
import { isExternalInboundError, observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { Context, InboxContext } from '@fedify/fedify';
import type { Note } from '@fedify/vocab';
import type { RemoteNoteCustomEmojiCandidate } from '@kosmo/core/activitypub-note-content/server';
import type { ActivityPubPostInput } from '@kosmo/core/services';
import type {
  ActivityPubPostCreateInput,
  PostCreateWorkflowArgs,
  PostCreateWorkflowResult,
} from '@kosmo/core/temporal/post-create';
import type { InboundObservation } from './inbound-observability';

type StoredRemoteProfileActor = NonNullable<
  Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActorByUri>>
>;

type RemoteNoteMaterializationContext = Pick<
  Context<void>,
  'canonicalOrigin' | 'lookupObject' | 'parseUri'
>;

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote attachment lookup is disabled');
};

const maxUnknownRemoteMentionLookups = 32;

const collectInboundNoteTags = async (
  note: Note,
): Promise<{ emojis: RemoteNoteCustomEmojiCandidate[]; hashtagNames: string[] }> => {
  const emojis: RemoteNoteCustomEmojiCandidate[] = [];
  const hashtagNames: string[] = [];
  for await (const tag of note.getTags({
    contextLoader: noNetworkDocumentLoader,
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  })) {
    if (tag instanceof Hashtag) {
      const name = tag.name?.toString();
      if (name !== undefined && name !== '') {
        hashtagNames.push(name);
      }
      continue;
    }
    if (!(tag instanceof Emoji)) {
      continue;
    }

    const shortcode = tag.name?.toString();
    if (!shortcode) {
      continue;
    }
    let icon: Image | null;
    try {
      icon = await tag.getIcon({
        contextLoader: noNetworkDocumentLoader,
        crossOrigin: 'trust',
        documentLoader: noNetworkDocumentLoader,
        suppressError: true,
      });
    } catch {
      continue;
    }
    const url = icon?.url;
    if (url !== null && url !== undefined) {
      emojis.push({ shortcode, url: String(url) });
    }
  }
  return { emojis, hashtagNames };
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

const projectRemoteNote = async (
  context: RemoteNoteMaterializationContext,
  note: Note,
  activityType: 'Create' | 'Unknown',
) => {
  const noteContent = {
    content: note.content?.toString() ?? null,
    mediaType: note.mediaType,
    summary: note.summary?.toString() ?? null,
  };
  const targetHrefs = await collectInboundMentionTargetHrefs(note);
  const { candidates: mentionCandidates, knownActorHrefs } =
    await resolveStoredInboundMentionCandidates(targetHrefs);
  const { emojis, hashtagNames } = await collectInboundNoteTags(note);
  let document = projectRemoteNoteContent({ ...noteContent, emojis, mentions: mentionCandidates });
  const media = await projectRemoteNoteMedia(note);
  const knownActorHrefSet = new Set(knownActorHrefs);
  const localOrigin = new URL(context.canonicalOrigin).origin;

  const unknownRemoteActorHrefs = targetHrefs
    .filter((targetHref) => {
      if (knownActorHrefSet.has(targetHref)) {
        return false;
      }

      return new URL(targetHref).origin !== localOrigin;
    })
    .slice(0, maxUnknownRemoteMentionLookups);
  const mentionLookupResults = await Promise.allSettled(
    unknownRemoteActorHrefs.map(async (targetHref) => {
      await runWorkflow(remoteProfileRefreshWorkflow, {
        args: [{ actorUri: targetHref }],
        mode: 'execute',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      });
      return targetHref;
    }),
  );
  const materializedActorHrefs = mentionLookupResults.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [result.value];
    }

    const error = result.reason;
    observeInbound({
      activityType,
      handler: 'create',
      phase: 'actor_lookup',
      outcome:
        isExternalInboundError(error) ||
        error instanceof ConflictError ||
        error instanceof NotFoundError
          ? 'external_failure'
          : 'internal_failure',
      reasonCode: 'remote_mention_materialization_rejected',
      objectUri: note.id?.href,
      error,
    });
    return [];
  });

  if (materializedActorHrefs.length > 0) {
    const { candidates } = await resolveStoredInboundMentionCandidates(materializedActorHrefs);
    if (candidates.length > 0) {
      mentionCandidates.push(...candidates);
      document = projectRemoteNoteContent({ ...noteContent, emojis, mentions: mentionCandidates });
    }
  }

  return {
    document,
    hashtagNames,
    media,
    mentionProfileIds: [...new Set(mentionCandidates.map(({ profileId }) => profileId))],
  };
};

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
      reason:
        | 'invalid_note'
        | 'note_content_length_exceeded'
        | 'note_mention_limit_exceeded'
        | 'no_active_local_mention'
        | 'unsupported_note'
        | 'unusable_author';
      status: 'rejected';
    };

type HydratedRemoteNotePreparationResult =
  | { input: ActivityPubPostCreateInput; status: 'prepared' }
  | Extract<HydratedRemoteNoteMaterializationResult, { status: 'rejected' }>;

type RemoteNoteMaterializationSource =
  | {
      kind: 'create';
      actorUri: string;
      storedActor: StoredRemoteProfileActor;
    }
  | {
      advertisingActorUri?: string | URL;
      signingProfileId?: string;
      kind: 'hydrated';
    };

type RemoteNoteMaterializationRejectionReason =
  | 'empty_note'
  | 'note_attribution_mismatch'
  | 'note_content_length_exceeded'
  | 'note_mention_limit_exceeded'
  | 'note_identity_mismatch'
  | 'note_media_projection_rejected'
  | 'note_media_validation_rejected'
  | 'reply_profile_blocked'
  | 'no_active_local_mention'
  | 'unusable_author';

type RemoteNotePostMaterializationResult =
  | {
      postId?: string;
      replyParentFallback: boolean;
      status: 'created' | 'duplicate';
    }
  | { reason: 'note_media_validation_rejected' | 'reply_profile_blocked'; status: 'rejected' };

type RemoteNotePostMaterialized = Extract<
  RemoteNotePostMaterializationResult,
  { status: 'created' | 'duplicate' }
>;

const resolveNoteVisibility = (note: Note, followersUri?: string | null): PostVisibility =>
  note.toIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)
    ? PostVisibility.PUBLIC
    : note.ccIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)
      ? PostVisibility.UNLISTED
      : followersUri && [...note.toIds, ...note.ccIds].some((uri) => uri.href === followersUri)
        ? PostVisibility.FOLLOWERS
        : PostVisibility.DIRECT;

const createRemoteNotePost = async (
  input: ActivityPubPostInput,
): Promise<RemoteNotePostMaterializationResult> => {
  const toResult = (result: Awaited<ReturnType<typeof createPost>>): RemoteNotePostMaterialized => {
    if (result.created) {
      return { postId: result.post.id, replyParentFallback: false, status: 'created' };
    }
    return { replyParentFallback: false, status: 'duplicate' };
  };

  try {
    const result = await createPost(input);
    return toResult(result);
  } catch (error) {
    if (error instanceof ProfilePairBlockedError) {
      return { reason: 'reply_profile_blocked', status: 'rejected' };
    }
    if (error instanceof ValidationError && error.field === 'media') {
      return { reason: 'note_media_validation_rejected', status: 'rejected' };
    }
    if (
      input.replyParentId === undefined ||
      !(
        error instanceof NotFoundError ||
        (error instanceof ValidationError && error.field === 'replyParentId')
      )
    ) {
      throw error;
    }

    const withoutReplyParent = { ...input };
    delete withoutReplyParent.replyParentId;
    const result = await createPost(withoutReplyParent);
    const fallbackResult = await toResult(result);
    return { ...fallbackResult, replyParentFallback: true };
  }
};

type RemoteNoteMaterializationResult =
  | RemoteNotePostMaterialized
  | { reason: RemoteNoteMaterializationRejectionReason; status: 'rejected' };

type RemoteNotePreparationResult =
  | {
      input: ActivityPubPostInput;
      status: 'prepared';
    }
  | { reason: RemoteNoteMaterializationRejectionReason; status: 'rejected' };

const toPostCreateInput = (input: ActivityPubPostInput): ActivityPubPostCreateInput => ({
  ...input,
  publishedAt: input.publishedAt?.toString() ?? null,
  receivedAt: input.receivedAt.toString(),
});

const prepareRemoteNote = async ({
  context,
  note,
  objectUri,
  receivedAt,
  source,
}: {
  context: RemoteNoteMaterializationContext;
  note: Note;
  objectUri: URL;
  receivedAt: Temporal.Instant;
  source: RemoteNoteMaterializationSource;
}): Promise<RemoteNotePreparationResult> => {
  if ((source.kind === 'hydrated' && !isHttpUri(objectUri)) || note.id?.href !== objectUri.href) {
    return { reason: 'note_identity_mismatch', status: 'rejected' };
  }

  const attributionHref = uniqueHref(note.attributionIds);
  if (!attributionHref) {
    return { reason: 'note_attribution_mismatch', status: 'rejected' };
  }
  if (source.kind === 'create' && attributionHref !== source.actorUri) {
    return { reason: 'note_attribution_mismatch', status: 'rejected' };
  }
  if (
    source.kind === 'hydrated' &&
    source.advertisingActorUri !== undefined &&
    attributionHref !== source.advertisingActorUri.toString()
  ) {
    return { reason: 'note_attribution_mismatch', status: 'rejected' };
  }
  const attributionUri = new URL(attributionHref);
  if (source.kind === 'hydrated' && !isHttpUri(attributionUri)) {
    return { reason: 'note_attribution_mismatch', status: 'rejected' };
  }

  let storedActor: StoredRemoteProfileActor;
  try {
    storedActor =
      source.kind === 'create'
        ? source.storedActor
        : await findOrMaterializeRemoteProfileActorByUri({
            actorUri: attributionUri,
            contextOrigin: context.canonicalOrigin,
            ...(source.signingProfileId === undefined
              ? {}
              : { profileId: source.signingProfileId }),
          });
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

  const visibility = resolveNoteVisibility(note, storedActor.actor.followersUri);
  if (visibility === PostVisibility.DIRECT) {
    const targetHrefs = await collectInboundMentionTargetHrefs(note);
    const { hasActiveLocalProfile } = await resolveStoredInboundMentionCandidates(targetHrefs);
    if (!hasActiveLocalProfile) {
      return { reason: 'no_active_local_mention', status: 'rejected' };
    }
  }

  let projection;
  try {
    projection = await projectRemoteNote(
      context,
      note,
      source.kind === 'create' ? 'Create' : 'Unknown',
    );
  } catch (error) {
    if (error instanceof RemoteNoteContentLengthExceededError) {
      return { reason: 'note_content_length_exceeded', status: 'rejected' };
    }
    if (error instanceof RemoteNoteMentionLimitExceededError) {
      return { reason: 'note_mention_limit_exceeded', status: 'rejected' };
    }
    if (error instanceof TypeError) {
      return { reason: 'note_media_projection_rejected', status: 'rejected' };
    }
    throw error;
  }

  if (
    source.kind === 'hydrated' &&
    postContentDocumentToText(projection.document).length === 0 &&
    projection.media.length === 0
  ) {
    return { reason: 'empty_note', status: 'rejected' };
  }

  const replyParentId = await resolveReplyParentId(context, note);
  const input = {
    document: projection.document,
    hashtagNames: projection.hashtagNames,
    media: projection.media,
    mentionProfileIds: projection.mentionProfileIds,
    objectUri: objectUri.href,
    origin: 'ACTIVITYPUB',
    profileId: storedActor.profile.id,
    publishedAt: note.published ?? null,
    receivedAt,
    visibility,
    ...(replyParentId === undefined ? {} : { replyParentId }),
  } satisfies ActivityPubPostInput;
  return { input, status: 'prepared' };
};

const toHydratedRemoteNoteRejection = (
  reason: RemoteNoteMaterializationRejectionReason,
  {
    objectUri,
    observation,
  }: {
    objectUri: URL;
    observation: Pick<InboundObservation, 'activityType' | 'handler'>;
  },
): Extract<HydratedRemoteNoteMaterializationResult, { status: 'rejected' }> => {
  if (reason === 'note_content_length_exceeded' || reason === 'note_mention_limit_exceeded') {
    observeInbound({
      ...observation,
      objectUri: objectUri.href,
      outcome: 'rejected',
      phase: 'projection',
      reasonCode: reason,
    });
    return { reason, status: 'rejected' };
  }
  if (reason === 'empty_note') {
    return { reason: 'unsupported_note', status: 'rejected' };
  }
  if (reason === 'no_active_local_mention') {
    return { reason, status: 'rejected' };
  }
  if (reason === 'unusable_author') {
    return { reason, status: 'rejected' };
  }
  return { reason: 'invalid_note', status: 'rejected' };
};

const materializeRemoteNote = async ({
  context,
  note,
  objectUri,
  receivedAt,
  source,
}: {
  context: RemoteNoteMaterializationContext;
  note: Note;
  objectUri: URL;
  receivedAt: Temporal.Instant;
  source: RemoteNoteMaterializationSource;
}): Promise<RemoteNoteMaterializationResult> => {
  const prepared = await prepareRemoteNote({ context, note, objectUri, receivedAt, source });
  return prepared.status === 'rejected' ? prepared : createRemoteNotePost(prepared.input);
};

export const materializeHydratedRemoteNote = async ({
  advertisingActorUri,
  context,
  note,
  objectUri,
  observation,
  receivedAt,
  signingProfileId,
}: {
  advertisingActorUri?: string | URL;
  context: RemoteNoteMaterializationContext;
  note: Note;
  objectUri: URL;
  observation: Pick<InboundObservation, 'activityType' | 'handler'>;
  receivedAt: Temporal.Instant;
  signingProfileId?: string;
}): Promise<HydratedRemoteNoteMaterializationResult> => {
  const result = await materializeRemoteNote({
    context,
    note,
    objectUri,
    receivedAt,
    source: {
      ...(advertisingActorUri === undefined ? {} : { advertisingActorUri }),
      ...(signingProfileId === undefined ? {} : { signingProfileId }),
      kind: 'hydrated',
    },
  });
  if (result.status === 'rejected') {
    return toHydratedRemoteNoteRejection(result.reason, { objectUri, observation });
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

export const prepareHydratedRemoteNote = async ({
  advertisingActorUri,
  context,
  note,
  objectUri,
  observation,
  receivedAt,
  signingProfileId,
}: {
  advertisingActorUri?: string | URL;
  context: RemoteNoteMaterializationContext;
  note: Note;
  objectUri: URL;
  observation: Pick<InboundObservation, 'activityType' | 'handler'>;
  receivedAt: Temporal.Instant;
  signingProfileId?: string;
}): Promise<HydratedRemoteNotePreparationResult> => {
  const prepared = await prepareRemoteNote({
    context,
    note,
    objectUri,
    receivedAt,
    source: {
      ...(advertisingActorUri === undefined ? {} : { advertisingActorUri }),
      ...(signingProfileId === undefined ? {} : { signingProfileId }),
      kind: 'hydrated',
    },
  });
  if (prepared.status === 'rejected') {
    return toHydratedRemoteNoteRejection(prepared.reason, { objectUri, observation });
  }
  return { input: toPostCreateInput(prepared.input), status: 'prepared' };
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
  const prepared = await prepareRemoteNote({
    context,
    note,
    objectUri: new URL(objectUri),
    receivedAt,
    source: { actorUri, kind: 'create', storedActor },
  });
  if (prepared.status === 'rejected') {
    const phase =
      prepared.reason === 'note_identity_mismatch' ||
      prepared.reason === 'note_attribution_mismatch' ||
      prepared.reason === 'no_active_local_mention'
        ? 'validation'
        : 'projection';
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectUri,
      phase,
      reasonCode: prepared.reason,
    });
    return;
  }
  const args: PostCreateWorkflowArgs = {
    input: toPostCreateInput(prepared.input),
    requestId: randomUUID(),
  };
  const result: PostCreateWorkflowResult = await runWorkflow(postCreateWorkflow, {
    args: [args],
    mode: 'execute',
    returnExistingResult: true,
    workflowIdConflictPolicy: 'USE_EXISTING',
    workflowIdReusePolicy: 'REJECT_DUPLICATE',
  });
  if (result.status === 'rejected') {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectUri,
      phase: 'projection',
      reasonCode: result.reason,
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
    observeInbound({
      outcome: 'noop',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'projection',
      reasonCode: 'duplicate_create_noop',
    });
  }
};
