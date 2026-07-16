import '@kosmo/core/polyfill';

import { PUBLIC_COLLECTION } from '@fedify/vocab';
import { projectRemoteNoteContent } from '@kosmo/core/activitypub-note-content/server';
import {
  ActivityPubPosts,
  db,
  firstOrThrow,
  isUniqueViolation,
  PostContents,
  Posts,
} from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import type { LanguageString, Note } from '@fedify/vocab';
import type { PostVisibility as PostVisibilityValue } from '@kosmo/core/enums';

type InboundCreateNoteProjection = {
  content: string | null;
  mediaType: string | null;
  published: Temporal.Instant | null;
  summary: string | null;
  visibility: PostVisibilityValue;
};

const uniqueHref = (uris: URL[]): string | undefined => {
  const hrefs = new Set(uris.map((uri) => uri.href));

  return hrefs.size === 1 ? hrefs.values().next().value : undefined;
};

const toPrimitiveString = (value: string | LanguageString | null): string | null =>
  value === null ? null : value.toString();

const resolveVisibility = (note: Note): PostVisibilityValue | undefined => {
  if (note.toIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)) {
    return PostVisibility.PUBLIC;
  }

  if (note.ccIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)) {
    return PostVisibility.UNLISTED;
  }

  return undefined;
};

const hasReplyTarget = async (note: Note): Promise<boolean> => {
  if (note.replyTargetIds.length > 0) {
    return true;
  }

  try {
    return (await note.getReplyTarget()) !== null;
  } catch {
    return true;
  }
};

const isActivityPubPostUriConflict = (error: unknown): boolean => {
  if (!isUniqueViolation(error) || !error || typeof error !== 'object' || !('cause' in error)) {
    return false;
  }

  const { cause } = error;
  return (
    !!cause &&
    typeof cause === 'object' &&
    'constraint_name' in cause &&
    cause.constraint_name === 'activitypub_post_uri_key'
  );
};

export const projectInboundCreateNote = async ({
  actorUri,
  note,
  objectUri,
}: {
  actorUri: string;
  note: Note;
  objectUri: string;
}): Promise<InboundCreateNoteProjection | undefined> => {
  if (note.id?.href !== objectUri) {
    return undefined;
  }

  const attributionUri = uniqueHref(note.attributionIds);
  if (attributionUri !== actorUri || (await hasReplyTarget(note))) {
    return undefined;
  }

  const visibility = resolveVisibility(note);
  if (!visibility) {
    return undefined;
  }

  return {
    content: toPrimitiveString(note.content),
    mediaType: note.mediaType,
    published: note.published,
    summary: toPrimitiveString(note.summary),
    visibility,
  };
};

export const handleInboundCreateNote = async ({
  actorUri,
  note,
  objectUri,
  profileId,
  receivedAt,
}: {
  actorUri: string;
  note: Note;
  objectUri: string;
  profileId: string;
  receivedAt: Temporal.Instant;
}): Promise<void> => {
  const projection = await projectInboundCreateNote({ actorUri, note, objectUri });
  if (!projection) {
    return;
  }

  let document;
  try {
    document = projectRemoteNoteContent(projection);
  } catch (error) {
    if (error instanceof TypeError) {
      return;
    }
    throw error;
  }

  const createdAt =
    projection.published && Temporal.Instant.compare(projection.published, receivedAt) < 0
      ? projection.published
      : receivedAt;

  try {
    await db.transaction(async (tx) => {
      const post = await tx
        .insert(Posts)
        .values({
          createdAt,
          profileId,
          state: PostState.ACTIVE,
          visibility: projection.visibility,
        })
        .returning()
        .then(firstOrThrow);

      await tx.insert(ActivityPubPosts).values({
        postId: post.id,
        publishedAt: projection.published,
        receivedAt,
        uri: objectUri,
      });

      const content = await tx
        .insert(PostContents)
        .values({ createdAt: receivedAt, document, postId: post.id })
        .returning()
        .then(firstOrThrow);

      await tx.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
    });
  } catch (error) {
    if (!isActivityPubPostUriConflict(error)) {
      throw error;
    }
  }
};
