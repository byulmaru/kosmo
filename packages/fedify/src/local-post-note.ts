import '@kosmo/core/polyfill';

import { Image, InteractionPolicy, InteractionRule, Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  Media,
  PostContents,
  PostQuotePolicies,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostQuoteConsentStatus,
  PostQuotePolicy,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { postContentDocumentToHtml } from '@kosmo/core/post-content/server';
import {
  defaultPostQuotePolicy,
  loadQuoteConsentForPost,
  loadQuotePostIdentity,
  loadQuoteSourceIdentity,
} from '@kosmo/core/services';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { escapeText } from 'entities/escape';
import { isCanonicalPostId, resolveActivityPubPostUri } from './activitypub-post-uri';
import type { Context, RequestContext } from '@fedify/fedify';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';

type LocalPostNote = {
  readonly authorHandle: string;
  readonly authorProfileId: string;
  readonly canonicalOrigin: string;
  readonly contentDocument: PostContentDocumentV1;
  readonly createdAt: Temporal.Instant;
  readonly id: string;
  readonly mediaAttachments: readonly Image[];
  readonly quoteAuthorizationUri: string | null;
  readonly quoteProtocolEnabled: boolean;
  readonly quotePolicy: PostQuotePolicy;
  readonly quotePolicyRevision: number;
  readonly quoteSourceUri: string | null;
  readonly replyParentId: string | null;
  readonly summary: string | null;
  readonly sensitiveMedia: boolean;
  readonly visibility: (typeof PostVisibility)[keyof typeof PostVisibility];
};

type LocalPostNoteProjection = LocalPostNote & {
  readonly object: Note;
};

type LocalPostNoteContext = Pick<Context<void>, 'canonicalOrigin' | 'getActorUri'>;

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const loadLocalPostNoteRow = async (context: LocalPostNoteContext, postId: string) => {
  if (!isCanonicalPostId(postId)) {
    return null;
  }

  const row = await db
    .select({
      contentDocument: PostContents.document,
      instanceCanonicalOrigin: Instances.canonicalOrigin,
      quotePolicy: PostQuotePolicies.policy,
      quotePolicyRevision: PostQuotePolicies.revision,
      post: Posts,
      profile: Profiles,
    })
    .from(Posts)
    .innerJoin(PostContents, eq(PostContents.id, Posts.currentContentId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(PostQuotePolicies, eq(PostQuotePolicies.postId, Posts.id))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.canonicalOrigin, context.canonicalOrigin),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.state, InstanceState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

  if (!row?.instanceCanonicalOrigin || row.post.visibility === PostVisibility.DIRECT) {
    return null;
  }

  return { ...row, instanceCanonicalOrigin: row.instanceCanonicalOrigin };
};

export const loadLocalPostNote = async (
  context: LocalPostNoteContext,
  postId: string,
): Promise<LocalPostNote | null> => {
  const row = await loadLocalPostNoteRow(context, postId);
  if (!row) {
    return null;
  }

  const mediaNodes = row.contentDocument.body.content.filter((node) => node.type === 'media');
  const mediaAttachments = await projectLocalMediaAttachments(mediaNodes);
  if (!mediaAttachments) {
    return null;
  }

  const quote = await projectLocalQuote(
    row.post.id,
    row.profile.id,
    row.post.repostSourceId,
    row.post.visibility,
  );

  return {
    authorHandle: row.profile.handle,
    authorProfileId: row.profile.id,
    canonicalOrigin: row.instanceCanonicalOrigin,
    contentDocument: row.contentDocument,
    createdAt: row.post.createdAt,
    id: row.post.id,
    mediaAttachments,
    quoteAuthorizationUri: quote.quoteAuthorizationUri,
    quoteProtocolEnabled: quote.quoteProtocolEnabled,
    quotePolicy: row.quotePolicy ?? defaultPostQuotePolicy,
    quotePolicyRevision: row.quotePolicyRevision ?? 1,
    quoteSourceUri: quote.quoteSourceUri,
    replyParentId: row.post.replyParentId,
    sensitiveMedia: row.contentDocument.body.attrs?.sensitiveMedia ?? false,
    summary: row.contentDocument.summary,
    visibility: row.post.visibility,
  };
};

const projectLocalQuote = async (
  quotePostId: string,
  quoteAuthorProfileId: string,
  sourcePostId: string | null,
  quoteVisibility: PostVisibility,
): Promise<{
  readonly quoteAuthorizationUri: string | null;
  readonly quoteProtocolEnabled: boolean;
  readonly quoteSourceUri: string | null;
}> => {
  if (!sourcePostId) {
    return { quoteAuthorizationUri: null, quoteProtocolEnabled: false, quoteSourceUri: null };
  }

  const source = await loadQuoteSourceIdentity(db, sourcePostId);
  if (
    !source ||
    !source.sourceUri ||
    source.sourceState !== PostState.ACTIVE ||
    source.sourceContentId === null ||
    source.authorProfileState !== ProfileState.ACTIVE ||
    source.instanceState === InstanceState.SUSPENDED ||
    (source.sourceVisibility !== PostVisibility.PUBLIC &&
      source.sourceVisibility !== PostVisibility.UNLISTED &&
      source.sourceVisibility !== PostVisibility.FOLLOWERS)
  ) {
    return { quoteAuthorizationUri: null, quoteProtocolEnabled: false, quoteSourceUri: null };
  }

  if (
    source.sourceVisibility === PostVisibility.FOLLOWERS &&
    source.authorProfileId !== quoteAuthorProfileId
  ) {
    return { quoteAuthorizationUri: null, quoteProtocolEnabled: false, quoteSourceUri: null };
  }

  if (source.authorProfileId === quoteAuthorProfileId) {
    if (
      source.sourceVisibility === PostVisibility.FOLLOWERS &&
      quoteVisibility !== PostVisibility.FOLLOWERS
    ) {
      return { quoteAuthorizationUri: null, quoteProtocolEnabled: false, quoteSourceUri: null };
    }
    return {
      quoteAuthorizationUri: null,
      quoteProtocolEnabled: true,
      quoteSourceUri: source.sourceUri,
    };
  }

  const consent = await loadQuoteConsentForPost(db, quotePostId, sourcePostId);
  const quoteIdentity = await loadQuotePostIdentity(db, quotePostId);
  if (
    !consent ||
    !quoteIdentity ||
    consent.sourcePostId !== sourcePostId ||
    consent.quotePostId !== quotePostId ||
    consent.quoteUri !== quoteIdentity.quoteUri ||
    consent.requestUri !== quoteIdentity.requestUri ||
    consent.quoteAuthorActorUri !== quoteIdentity.authorActorUri ||
    consent.sourceAuthorActorUri !== source.authorActorUri ||
    consent.sourceUri !== source.sourceUri ||
    !consent.approvalUri ||
    !isHttpUrl(consent.approvalUri) ||
    consent.status !== PostQuoteConsentStatus.APPROVED
  ) {
    return { quoteAuthorizationUri: null, quoteProtocolEnabled: false, quoteSourceUri: null };
  }

  return {
    quoteAuthorizationUri: consent.approvalUri,
    quoteProtocolEnabled: true,
    quoteSourceUri: source.sourceUri,
  };
};

const projectLocalMediaAttachments = async (
  mediaNodes: readonly Extract<
    PostContentDocumentV1['body']['content'][number],
    { type: 'media' }
  >[],
): Promise<readonly Image[] | null> => {
  if (mediaNodes.length === 0) {
    return [];
  }
  const mediaIds = mediaNodes.map((node) => node.attrs.mediaId);
  if (new Set(mediaIds).size !== mediaIds.length) {
    return null;
  }
  const rows = await db
    .select({
      altText: Media.altText,
      id: Media.id,
      mediaType: Media.mediaType,
      url: Media.url,
    })
    .from(Media)
    .where(
      and(
        inArray(Media.id, mediaIds),
        eq(Media.source, MediaSource.LOCAL),
        eq(Media.state, MediaState.READY),
      ),
    );
  if (rows.length !== mediaIds.length) {
    return null;
  }

  const mediaById = new Map(rows.map((media) => [media.id, media]));
  const attachments: Image[] = [];
  for (const node of mediaNodes) {
    const media = mediaById.get(node.attrs.mediaId);
    if (!media?.url || !media.mediaType) {
      return null;
    }
    let url: URL;
    try {
      url = new URL(media.url);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    attachments.push(
      new Image({
        mediaType: media.mediaType,
        ...(media.altText !== null ? { name: media.altText } : {}),
        url,
      }),
    );
  }
  return attachments;
};

const getFollowersUri = (context: LocalPostNoteContext, profileId: string): URL => {
  const actorUri = context.getActorUri(profileId);
  return new URL(`${actorUri.pathname.replace(/\/$/, '')}/followers`, actorUri);
};

const isEstablishedFollower = async (actorUri: URL, authorProfileId: string): Promise<boolean> =>
  db
    .select({ id: ProfileFollows.id })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ProfileFollows, eq(ProfileFollows.followerProfileId, Profiles.id))
    .where(
      and(
        eq(ActivityPubActors.uri, actorUri.href),
        eq(Profiles.state, ProfileState.ACTIVE),
        ne(Instances.state, InstanceState.SUSPENDED),
        eq(ProfileFollows.followeeProfileId, authorProfileId),
      ),
    )
    .limit(1)
    .then(first)
    .then(Boolean);

export const authorizeLocalPostNote = async (
  context: RequestContext<void>,
  { id }: { id: string },
): Promise<boolean> => {
  const row = await loadLocalPostNoteRow(context, id);
  if (!row) {
    return false;
  }
  const signedActor = await context.getSignedKeyOwner();
  if (signedActor?.id && signedActor.id.href !== context.getActorUri(row.profile.id).href) {
    const sourceBlocksViewer = await db
      .select({ id: ProfileBlocks.id })
      .from(ProfileBlocks)
      .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, ProfileBlocks.targetProfileId))
      .where(
        and(
          eq(ProfileBlocks.ownerProfileId, row.profile.id),
          eq(ActivityPubActors.uri, signedActor.id.href),
        ),
      )
      .limit(1)
      .then(first);
    if (sourceBlocksViewer) {
      return false;
    }
  }

  if (row.post.visibility !== PostVisibility.FOLLOWERS) {
    return true;
  }
  if (!signedActor?.id) {
    return false;
  }

  return (
    signedActor.id.href === context.getActorUri(row.profile.id).href ||
    (await isEstablishedFollower(signedActor.id, row.profile.id))
  );
};

export const dispatchLocalPostNote = async (
  context: RequestContext<void>,
  { id }: { id: string },
): Promise<Note | null> => {
  return (await projectLocalPostNote(context, id))?.object ?? null;
};

export const projectLocalPostNote = async (
  context: LocalPostNoteContext,
  postId: string,
): Promise<LocalPostNoteProjection | null> => {
  const note = await loadLocalPostNote(context, postId);
  if (!note) {
    return null;
  }

  const authorUri = context.getActorUri(note.authorProfileId);
  const followersUri = getFollowersUri(context, note.authorProfileId);
  const replyTarget = note.replyParentId
    ? await resolveActivityPubPostUri(note.replyParentId)
    : undefined;
  const to = note.visibility === PostVisibility.PUBLIC ? PUBLIC_COLLECTION : followersUri;
  const cc =
    note.visibility === PostVisibility.PUBLIC
      ? followersUri
      : note.visibility === PostVisibility.UNLISTED
        ? PUBLIC_COLLECTION
        : undefined;
  const configuredLocalInstance = await resolveConfiguredLocalInstance();
  const canQuote = new InteractionRule({
    automaticApprovals:
      note.quotePolicy === PostQuotePolicy.EVERYONE
        ? [PUBLIC_COLLECTION]
        : note.quotePolicy === PostQuotePolicy.FOLLOWERS
          ? [followersUri, authorUri]
          : [authorUri],
  });

  const object = new Note({
    attachments: [...note.mediaAttachments],
    attribution: authorUri,
    ...(cc ? { cc } : {}),
    content: appendQuoteFallback(
      postContentDocumentToHtml(note.contentDocument),
      note.quoteSourceUri && note.quoteProtocolEnabled ? note.quoteSourceUri : null,
    ),
    id: new URL(`/ap/note/${note.id}`, note.canonicalOrigin),
    interactionPolicy: new InteractionPolicy({ canQuote }),
    mediaType: 'text/html',
    emojiReactions: new URL(`/ap/note/${note.id}/emoji-reactions`, note.canonicalOrigin),
    published: note.createdAt,
    ...(replyTarget ? { replyTarget } : {}),
    ...(note.summary ? { summary: escapeText(note.summary) } : {}),
    sensitive: note.sensitiveMedia,
    to,
    ...(note.quoteSourceUri && note.quoteProtocolEnabled
      ? {
          quote: new URL(note.quoteSourceUri),
          quoteUrl: new URL(note.quoteSourceUri),
          ...(note.quoteAuthorizationUri
            ? { quoteAuthorization: new URL(note.quoteAuthorizationUri) }
            : {}),
        }
      : {}),
    url: new URL(
      `/@${encodeURIComponent(note.authorHandle)}/${encodeGlobalId('Post', note.id)}`,
      configuredLocalInstance.canonicalOrigin,
    ),
  });

  return { ...note, object };
};

const appendQuoteFallback = (content: string, sourceUri: string | null): string =>
  sourceUri
    ? `${content}<span class="quote-inline">RE: <a href="${escapeText(sourceUri)}">${escapeText(sourceUri)}</a></span>`
    : content;

/**
 * Builds the request-only Note used as a FEP-044f QuoteRequest instrument.
 *
 * A pending quote must stay hidden from the ordinary Note projection, while a
 * QuoteRequest still needs to carry the candidate source relationship to the
 * source author. Keeping this as a separate projection prevents the pending
 * relationship from leaking to normal audiences.
 */
export const projectLocalPostQuoteRequestInstrument = async (
  context: LocalPostNoteContext,
  postId: string,
  sourceUri: string,
  sourceAuthorActorUri: string,
): Promise<Note | null> => {
  let quoteUrl: URL;
  try {
    quoteUrl = new URL(sourceUri);
  } catch {
    return null;
  }
  if (quoteUrl.protocol !== 'http:' && quoteUrl.protocol !== 'https:') {
    return null;
  }

  const projection = await projectLocalPostNote(context, postId);
  if (!projection || !projection.object.id) {
    return null;
  }

  const quote = projection.object.clone({
    quote: quoteUrl,
    quoteAuthorization: null,
    quoteUrl,
  });
  const audience = [...quote.toIds, ...quote.ccIds].map(({ href }) => href);
  if (audience.includes(PUBLIC_COLLECTION.href) || audience.includes(sourceAuthorActorUri)) {
    return quote;
  }

  // A followers-only Quote may be visible to the local author but not to the
  // remote Source author. Send the identity-only instrument in that case so
  // the request does not widen the Quote's ordinary audience.
  return new Note({
    attribution: context.getActorUri(projection.authorProfileId),
    id: projection.object.id,
    mediaType: 'text/html',
    quote: quoteUrl,
    quoteUrl,
  });
};
