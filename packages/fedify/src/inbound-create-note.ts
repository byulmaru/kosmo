import '@kosmo/core/polyfill';

import { PUBLIC_COLLECTION } from '@fedify/vocab';
import { projectRemoteNoteContent } from '@kosmo/core/activitypub-note-content/server';
import { PostVisibility } from '@kosmo/core/enums';
import { NotFoundError, ValidationError } from '@kosmo/core/error';
import { createPost } from '@kosmo/core/services';
import { findPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import type { InboxContext } from '@fedify/fedify';
import type { Note } from '@fedify/vocab';

const resolveReplyParentId = async (
  context: InboxContext<void>,
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

export const handleInboundCreateNote = async ({
  actorUri,
  context,
  note,
  objectUri,
  profileId,
  receivedAt,
}: {
  actorUri: string;
  context: InboxContext<void>;
  note: Note;
  objectUri: string;
  profileId: string;
  receivedAt: Temporal.Instant;
}): Promise<void> => {
  if (note.id?.href !== objectUri) {
    return;
  }

  const attributionUri = uniqueHref(note.attributionIds);
  if (attributionUri !== actorUri) {
    return;
  }

  const replyParentId = await resolveReplyParentId(context, note);

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

  const input = {
    document,
    objectUri,
    origin: 'ACTIVITYPUB',
    profileId,
    publishedAt: note.published,
    receivedAt,
    visibility,
  } satisfies Parameters<typeof createPost>[0];

  try {
    await createPost(replyParentId ? { ...input, replyParentId } : input);
  } catch (error) {
    if (
      !replyParentId ||
      !(
        error instanceof NotFoundError ||
        (error instanceof ValidationError && error.field === 'replyParentId')
      )
    ) {
      throw error;
    }

    await createPost(input);
  }
};
