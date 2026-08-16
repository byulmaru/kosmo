import '@kosmo/core/polyfill';

import { Image, Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  Media,
  PostContents,
  Posts,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { postContentDocumentToHtml } from '@kosmo/core/post-content/server';
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
  readonly replyParentId: string | null;
  readonly summary: string | null;
  readonly sensitiveMedia: boolean;
  readonly visibility: (typeof PostVisibility)[keyof typeof PostVisibility];
};

type LocalPostNoteProjection = LocalPostNote & {
  readonly object: Note;
};

type LocalPostNoteContext = Pick<Context<void>, 'canonicalOrigin' | 'getActorUri'>;

const loadLocalPostNoteRow = async (
  context: LocalPostNoteContext,
  postId: string,
  postState: (typeof PostState)[keyof typeof PostState] = PostState.ACTIVE,
) => {
  if (!isCanonicalPostId(postId)) {
    return null;
  }

  const row = await db
    .select({
      contentDocument: PostContents.document,
      instanceCanonicalOrigin: Instances.canonicalOrigin,
      post: Posts,
      profile: Profiles,
    })
    .from(Posts)
    .innerJoin(PostContents, eq(PostContents.id, Posts.currentContentId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, postState),
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
  postState: (typeof PostState)[keyof typeof PostState] = PostState.ACTIVE,
): Promise<LocalPostNote | null> => {
  const row = await loadLocalPostNoteRow(context, postId, postState);
  if (!row) {
    return null;
  }

  const mediaNodes = row.contentDocument.body.content.filter((node) => node.type === 'media');
  const mediaAttachments = await projectLocalMediaAttachments(mediaNodes);
  if (!mediaAttachments) {
    return null;
  }

  return {
    authorHandle: row.profile.handle,
    authorProfileId: row.profile.id,
    canonicalOrigin: row.instanceCanonicalOrigin,
    contentDocument: row.contentDocument,
    createdAt: row.post.createdAt,
    id: row.post.id,
    mediaAttachments,
    replyParentId: row.post.replyParentId,
    sensitiveMedia: row.contentDocument.body.attrs?.sensitiveMedia ?? false,
    summary: row.contentDocument.summary,
    visibility: row.post.visibility,
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
  if (row.post.visibility !== PostVisibility.FOLLOWERS) {
    return true;
  }

  const signedActor = await context.getSignedKeyOwner();
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
  postState: (typeof PostState)[keyof typeof PostState] = PostState.ACTIVE,
): Promise<LocalPostNoteProjection | null> => {
  const note = await loadLocalPostNote(context, postId, postState);
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

  const object = new Note({
    attachments: [...note.mediaAttachments],
    attribution: authorUri,
    ...(cc ? { cc } : {}),
    content: postContentDocumentToHtml(note.contentDocument),
    id: new URL(`/ap/note/${note.id}`, note.canonicalOrigin),
    mediaType: 'text/html',
    emojiReactions: new URL(`/ap/note/${note.id}/emoji-reactions`, note.canonicalOrigin),
    published: note.createdAt,
    ...(replyTarget ? { replyTarget } : {}),
    ...(note.summary ? { summary: escapeText(note.summary) } : {}),
    sensitive: note.sensitiveMedia,
    to,
    url: new URL(
      `/@${encodeURIComponent(note.authorHandle)}/${encodeGlobalId('Post', note.id)}`,
      configuredLocalInstance.canonicalOrigin,
    ),
  });

  return { ...note, object };
};
