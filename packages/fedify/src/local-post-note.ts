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
import { z } from 'zod';
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

const mediaRepresentationSchema = z.object({
  mediaType: z.string().trim().min(1),
  url: z.httpUrl(),
});

const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 10_000;

const loadLocalPostNoteRow = async (context: LocalPostNoteContext, postId: string) => {
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

const loadLocalPostNote = async (
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

const resolvePublicMediaRepresentation = async (
  storageReference: string,
): Promise<{ readonly mediaType: string; readonly url: URL } | null> => {
  const mediaStorageOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
  const mediaStorageApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
  if (!mediaStorageOrigin || !mediaStorageApiKey) {
    return null;
  }

  const representationPath = `/v1/uploads/${encodeURIComponent(storageReference)}`;
  try {
    const representationUrl = new URL(representationPath, mediaStorageOrigin);
    if (representationUrl.pathname !== representationPath) {
      return null;
    }
    const response = await globalThis.fetch(representationUrl, {
      headers: { Authorization: `Bearer ${mediaStorageApiKey}` },
      signal: AbortSignal.timeout(MEDIA_STORAGE_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const representation = mediaRepresentationSchema.safeParse(await response.json());
    return representation.success
      ? { mediaType: representation.data.mediaType, url: new URL(representation.data.url) }
      : null;
  } catch {
    return null;
  }
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
    .select({ id: Media.id, storageReference: Media.storageReference })
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

  const resolvedRows = await Promise.all(
    rows.map(async (media) => ({
      id: media.id,
      representation: await resolvePublicMediaRepresentation(media.storageReference),
    })),
  );
  const representationsById = new Map(
    resolvedRows.map(({ id, representation }) => [id, representation]),
  );
  const attachments: Image[] = [];
  for (const node of mediaNodes) {
    const representation = representationsById.get(node.attrs.mediaId);
    if (!representation) {
      return null;
    }
    attachments.push(
      new Image({
        mediaType: representation.mediaType,
        ...(node.attrs.altText !== null ? { name: node.attrs.altText } : {}),
        url: representation.url,
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

  const object = new Note({
    attachments: [...note.mediaAttachments],
    attribution: authorUri,
    ...(cc ? { cc } : {}),
    content: postContentDocumentToHtml(note.contentDocument),
    id: new URL(`/ap/note/${note.id}`, note.canonicalOrigin),
    mediaType: 'text/html',
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
