import '@kosmo/core/polyfill';

import { PUBLIC_COLLECTION } from '@fedify/vocab';
import { projectRemoteNoteContent } from '@kosmo/core/activitypub-note-content/server';
import { PostVisibility } from '@kosmo/core/enums';
import { createPost } from '@kosmo/core/services';
import { uniqueHref } from './activitypub-uri';
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

  await createPost({
    document,
    objectUri,
    origin: 'ACTIVITYPUB',
    profileId,
    publishedAt: note.published,
    receivedAt,
    visibility,
  });
};
