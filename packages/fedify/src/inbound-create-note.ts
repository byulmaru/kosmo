import '@kosmo/core/polyfill';

import { MIMEType } from 'node:util';
import { Document, Image, Link, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  projectRemoteNoteContent,
  RemoteNoteContentLengthExceededError,
} from '@kosmo/core/activitypub-note-content/server';
import { ActivityPubActors, db, first, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, PostVisibility, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import { postContentDocumentToText } from '@kosmo/core/post-content/server';
import { createPost, createPostInTransaction, ProfilePairBlockedError } from '@kosmo/core/services';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { remoteProfileRefreshWorkflow } from '@kosmo/core/temporal/workflows';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { findPostByActivityPubUri, findRemotePostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import {
  collectInboundMentionTargetHrefs,
  resolveStoredInboundMentionCandidates,
} from './inbound-mention';
import { isExternalInboundError, observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  findUsableStoredRemoteProfileActorByUri,
  RemoteActorMaterializationError,
} from './remote-actor-materialization';
import type { Context, InboxContext } from '@fedify/fedify';
import type { Note } from '@fedify/vocab';
import type { Transaction } from '@kosmo/core/db';
import type { InboundObservation } from './inbound-observability';
import type { findStoredRemoteProfileActorByUri } from './remote-actor-materialization';

export type StoredRemoteProfileActor = NonNullable<
  Awaited<ReturnType<typeof findStoredRemoteProfileActorByUri>>
>;

const FollowersQuoteLocalProfiles = alias(Profiles, 'followers_quote_local_profile');
const FollowersQuoteLocalInstances = alias(Instances, 'followers_quote_local_instance');

type RemoteNoteMaterializationContext = Pick<
  Context<void>,
  'canonicalOrigin' | 'lookupObject' | 'parseUri'
>;

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote attachment lookup is disabled');
};

const maxUnknownRemoteMentionLookups = 32;

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
  let document = projectRemoteNoteContent({ ...noteContent, mentions: mentionCandidates });
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
      objectOrigin: note.id?.origin,
      error,
    });
    return [];
  });

  if (materializedActorHrefs.length > 0) {
    const { candidates } = await resolveStoredInboundMentionCandidates(materializedActorHrefs);
    if (candidates.length > 0) {
      mentionCandidates.push(...candidates);
      document = projectRemoteNoteContent({ ...noteContent, mentions: mentionCandidates });
    }
  }

  return {
    document,
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
  | {
      postCommit?: () => Promise<void>;
      postId: string;
      status: 'created' | 'duplicate';
    }
  | {
      reason:
        | 'invalid_note'
        | 'note_content_length_exceeded'
        | 'unsupported_note'
        | 'unusable_author';
      status: 'rejected';
    };

type RemoteNoteMaterializationSource =
  | {
      kind: 'create';
      actorUri: string;
      recipient?: string | null;
      storedActor: StoredRemoteProfileActor;
    }
  | { kind: 'hydrated' }
  | {
      kind: 'followers-quote';
      followerProfileId: string;
      storedActor: StoredRemoteProfileActor;
    };

type RemoteNoteMaterializationRejectionReason =
  | 'empty_note'
  | 'followers_visibility_without_follow'
  | 'note_attribution_mismatch'
  | 'note_content_length_exceeded'
  | 'note_identity_mismatch'
  | 'note_media_projection_rejected'
  | 'note_media_validation_rejected'
  | 'reply_profile_blocked'
  | 'stored_author_mismatch'
  | 'unsupported_note_visibility'
  | 'unusable_author';

type RemoteNotePostMaterializationResult =
  | {
      postId: string;
      postCommit?: () => Promise<void>;
      replyParentFallback: boolean;
      status: 'created' | 'duplicate';
    }
  | { reason: 'note_media_validation_rejected' | 'reply_profile_blocked'; status: 'rejected' };

type RemoteNotePostCreationSuccess =
  | {
      postCommit?: () => Promise<void>;
      postId: string;
      replyParentFallback: boolean;
      status: 'created';
    }
  | {
      postCommit?: () => Promise<void>;
      postId?: string;
      replyParentFallback: boolean;
      status: 'duplicate';
    };

type RemoteNotePostCreationResult =
  | RemoteNotePostCreationSuccess
  | { reason: 'note_media_validation_rejected' | 'reply_profile_blocked'; status: 'rejected' };

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
  mentionProfileIds,
  note,
  objectUri,
  profileId,
  receivedAt,
  transaction,
  visibility,
}: {
  context: RemoteNoteMaterializationContext;
  document: ReturnType<typeof projectRemoteNoteContent>;
  media: Awaited<ReturnType<typeof projectRemoteNoteMedia>>;
  mentionProfileIds: readonly string[];
  note: Note;
  objectUri: string;
  profileId: string;
  receivedAt: Temporal.Instant;
  transaction?: Transaction;
  visibility: PostVisibility;
}): Promise<RemoteNotePostCreationResult> => {
  const replyParentId = await resolveReplyParentId(context, note);
  const input = {
    document,
    media,
    mentionProfileIds,
    objectUri,
    origin: 'ACTIVITYPUB',
    profileId,
    publishedAt: note.published,
    receivedAt,
    visibility,
  } satisfies Parameters<typeof createPost>[0];
  const save = (candidate: typeof input & { replyParentId?: string }) =>
    transaction ? createPostInTransaction(candidate, transaction) : createPost(candidate);
  const toResult = (
    result:
      | Awaited<ReturnType<typeof createPostInTransaction>>
      | Awaited<ReturnType<typeof createPost>>,
  ): RemoteNotePostCreationSuccess => {
    if (result.created) {
      return {
        postId: result.post.id,
        ...('postCommit' in result ? { postCommit: result.postCommit } : {}),
        replyParentFallback: false,
        status: 'created',
      };
    }
    return {
      ...('postId' in result ? { postId: result.postId } : {}),
      ...('postCommit' in result ? { postCommit: result.postCommit } : {}),
      replyParentFallback: false,
      status: 'duplicate',
    };
  };

  try {
    const result = await save(replyParentId ? { ...input, replyParentId } : input);
    return toResult(result);
  } catch (error) {
    if (error instanceof ProfilePairBlockedError) {
      return { reason: 'reply_profile_blocked', status: 'rejected' };
    }
    if (error instanceof ValidationError && error.field === 'media') {
      return { reason: 'note_media_validation_rejected', status: 'rejected' };
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

    const result = await save(input);
    const fallbackResult = toResult(result);
    return { ...fallbackResult, replyParentFallback: true };
  }
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

type RemoteNoteMaterializationResult =
  | RemoteNotePostMaterialized
  | { reason: RemoteNoteMaterializationRejectionReason; status: 'rejected' };

const materializeRemoteNote = async ({
  context,
  note,
  objectUri,
  receivedAt,
  source,
  transaction,
}: {
  context: RemoteNoteMaterializationContext;
  note: Note;
  objectUri: URL;
  receivedAt: Temporal.Instant;
  source: RemoteNoteMaterializationSource;
  transaction?: Transaction;
}): Promise<RemoteNoteMaterializationResult> => {
  if ((source.kind !== 'create' && !isHttpUri(objectUri)) || note.id?.href !== objectUri.href) {
    return { reason: 'note_identity_mismatch', status: 'rejected' };
  }

  const attributionHref = uniqueHref(note.attributionIds);
  const expectedAttribution =
    source.kind === 'create'
      ? source.actorUri
      : source.kind === 'followers-quote'
        ? source.storedActor.actor.uri
        : undefined;
  if (!attributionHref || (expectedAttribution && attributionHref !== expectedAttribution)) {
    return { reason: 'note_attribution_mismatch', status: 'rejected' };
  }
  const attributionUri = new URL(attributionHref);
  if (source.kind !== 'create' && !isHttpUri(attributionUri)) {
    return { reason: 'note_attribution_mismatch', status: 'rejected' };
  }

  if (
    (await findRemotePostByActivityPubUri(context, objectUri, attributionUri, transaction))
      .status === 'author_mismatch'
  ) {
    return { reason: 'stored_author_mismatch', status: 'rejected' };
  }

  const followersUri =
    source.kind === 'create' || source.kind === 'followers-quote'
      ? source.storedActor.actor.followersUri
      : undefined;
  const visibility = resolveNoteVisibility(note, followersUri);
  if (!visibility) {
    return { reason: 'unsupported_note_visibility', status: 'rejected' };
  }
  if (source.kind === 'followers-quote' && visibility !== PostVisibility.FOLLOWERS) {
    return { reason: 'unsupported_note_visibility', status: 'rejected' };
  }
  if (
    source.kind === 'create' &&
    visibility === PostVisibility.FOLLOWERS &&
    !(await hasEstablishedFollower({
      followerProfileId: source.recipient,
      followeeProfileId: source.storedActor.profile.id,
    }))
  ) {
    return { reason: 'followers_visibility_without_follow', status: 'rejected' };
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
    if (error instanceof TypeError) {
      return { reason: 'note_media_projection_rejected', status: 'rejected' };
    }
    throw error;
  }

  if (
    source.kind !== 'create' &&
    postContentDocumentToText(projection.document).length === 0 &&
    projection.media.length === 0
  ) {
    return { reason: 'empty_note', status: 'rejected' };
  }

  let storedActor;
  if (source.kind === 'create' || source.kind === 'followers-quote') {
    storedActor = source.storedActor;
  } else {
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
  }

  if (source.kind === 'followers-quote') {
    if (!transaction) {
      throw new Error('Followers-only Quote materialization requires a transaction');
    }
    let currentStoredActor;
    try {
      currentStoredActor = await findUsableStoredRemoteProfileActorByUri(
        source.storedActor.actor.uri,
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        return { reason: 'unusable_author', status: 'rejected' };
      }
      throw error;
    }
    if (
      !currentStoredActor ||
      currentStoredActor.profile.id !== source.storedActor.profile.id ||
      currentStoredActor.actor.uri !== source.storedActor.actor.uri ||
      currentStoredActor.actor.followersUri !== source.storedActor.actor.followersUri
    ) {
      return { reason: 'unusable_author', status: 'rejected' };
    }
    const expectedFollowersUri = source.storedActor.actor.followersUri;
    if (!expectedFollowersUri) {
      return { reason: 'followers_visibility_without_follow', status: 'rejected' };
    }
    const current = await transaction
      .select({ actorUri: ActivityPubActors.uri })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(
        ProfileFollows,
        and(
          eq(ProfileFollows.followeeProfileId, Profiles.id),
          eq(ProfileFollows.followerProfileId, source.followerProfileId),
        ),
      )
      .innerJoin(
        FollowersQuoteLocalProfiles,
        eq(FollowersQuoteLocalProfiles.id, ProfileFollows.followerProfileId),
      )
      .innerJoin(
        FollowersQuoteLocalInstances,
        eq(FollowersQuoteLocalInstances.id, FollowersQuoteLocalProfiles.instanceId),
      )
      .where(
        and(
          eq(ActivityPubActors.profileId, source.storedActor.profile.id),
          eq(ActivityPubActors.uri, source.storedActor.actor.uri),
          eq(ActivityPubActors.followersUri, expectedFollowersUri),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.kind, InstanceKind.ACTIVITYPUB),
          eq(Instances.state, InstanceState.ACTIVE),
          eq(FollowersQuoteLocalProfiles.id, source.followerProfileId),
          eq(FollowersQuoteLocalProfiles.state, ProfileState.ACTIVE),
          eq(FollowersQuoteLocalInstances.kind, InstanceKind.LOCAL),
          eq(FollowersQuoteLocalInstances.state, InstanceState.ACTIVE),
        ),
      )
      .limit(1)
      .for('update')
      .then(first);
    if (!current) {
      return { reason: 'followers_visibility_without_follow', status: 'rejected' };
    }
  }

  const result = await createRemoteNotePost({
    context,
    document: projection.document,
    media: projection.media,
    mentionProfileIds: projection.mentionProfileIds,
    note,
    objectUri: objectUri.href,
    profileId: storedActor.profile.id,
    receivedAt,
    transaction,
    visibility,
  });
  if (result.status === 'rejected' || result.status === 'created') {
    return result;
  }

  const winner = await findRemotePostByActivityPubUri(
    context,
    objectUri,
    attributionUri,
    transaction,
  );
  if (winner.status === 'author_mismatch') {
    return { reason: 'stored_author_mismatch', status: 'rejected' };
  }
  if (winner.status === 'missing') {
    throw new Error('Remote Note Post not found after duplicate materialization');
  }

  return {
    postId: winner.postId,
    ...(result.postCommit ? { postCommit: result.postCommit } : {}),
    replyParentFallback: result.replyParentFallback,
    status: 'duplicate',
  };
};

export const materializeHydratedRemoteNote = async ({
  context,
  note,
  objectUri,
  observation,
  receivedAt,
}: {
  context: RemoteNoteMaterializationContext;
  note: Note;
  objectUri: URL;
  observation: Pick<InboundObservation, 'activityType' | 'handler'>;
  receivedAt: Temporal.Instant;
}): Promise<HydratedRemoteNoteMaterializationResult> => {
  const result = await materializeRemoteNote({
    context,
    note,
    objectUri,
    receivedAt,
    source: { kind: 'hydrated' },
  });
  if (result.status === 'rejected') {
    if (result.reason === 'note_content_length_exceeded') {
      observeInbound({
        ...observation,
        objectOrigin: objectUri.href,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: result.reason,
      });
      return { reason: 'note_content_length_exceeded', status: 'rejected' };
    }
    if (result.reason === 'empty_note' || result.reason === 'unsupported_note_visibility') {
      return { reason: 'unsupported_note', status: 'rejected' };
    }
    if (result.reason === 'unusable_author') {
      return { reason: 'unusable_author', status: 'rejected' };
    }
    return { reason: 'invalid_note', status: 'rejected' };
  }
  return {
    ...(result.postCommit ? { postCommit: result.postCommit } : {}),
    postId: result.postId,
    status: result.status,
  };
};

export const materializeFollowersOnlyQuoteNote = async ({
  context,
  expectedActor,
  followerProfileId,
  note,
  objectUri,
  receivedAt,
  transaction,
}: {
  context: RemoteNoteMaterializationContext;
  expectedActor: StoredRemoteProfileActor;
  followerProfileId: string;
  note: Note;
  objectUri: URL;
  receivedAt: Temporal.Instant;
  transaction: Transaction;
}): Promise<HydratedRemoteNoteMaterializationResult> => {
  const result = await materializeRemoteNote({
    context,
    note,
    objectUri,
    receivedAt,
    source: {
      followerProfileId,
      kind: 'followers-quote',
      storedActor: expectedActor,
    },
    transaction,
  });
  if (result.status === 'rejected') {
    return { reason: 'invalid_note', status: 'rejected' };
  }
  return {
    ...(result.postCommit ? { postCommit: result.postCommit } : {}),
    postId: result.postId,
    status: result.status,
  };
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
}): Promise<RemoteNoteMaterializationResult> => {
  const result = await materializeRemoteNote({
    context,
    note,
    objectUri: new URL(objectUri),
    receivedAt,
    source: { actorUri, kind: 'create', recipient: context.recipient, storedActor },
  });
  if (result.status === 'rejected') {
    const phase =
      result.reason === 'note_identity_mismatch' ||
      result.reason === 'note_attribution_mismatch' ||
      result.reason === 'stored_author_mismatch' ||
      result.reason === 'unsupported_note_visibility' ||
      result.reason === 'followers_visibility_without_follow'
        ? 'validation'
        : 'projection';
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase,
      reasonCode: result.reason,
    });
    return result;
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
  return result;
};
