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
import { uniqueHref } from './unique-href';
import type { Note } from '@fedify/vocab';

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
  if (note.id?.href !== objectUri) {
    return;
  }

  const attributionUri = uniqueHref(note.attributionIds);
  if (attributionUri !== actorUri || (await hasReplyTarget(note))) {
    return;
  }

  const visibility = note.toIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)
    ? PostVisibility.PUBLIC
    : note.ccIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)
      ? PostVisibility.UNLISTED
      : undefined;
  if (!visibility) {
    return;
  }

  let document;
  try {
    document = projectRemoteNoteContent({
      content: note.content?.toString() ?? null,
      mediaType: note.mediaType,
      summary: note.summary?.toString() ?? null,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return;
    }
    throw error;
  }

  const createdAt =
    note.published && Temporal.Instant.compare(note.published, receivedAt) < 0
      ? note.published
      : receivedAt;

  try {
    await db.transaction(async (tx) => {
      const post = await tx
        .insert(Posts)
        .values({
          createdAt,
          profileId,
          state: PostState.ACTIVE,
          visibility,
        })
        .returning()
        .then(firstOrThrow);

      await tx.insert(ActivityPubPosts).values({
        postId: post.id,
        publishedAt: note.published,
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
