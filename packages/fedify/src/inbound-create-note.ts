import '@kosmo/core/polyfill';

import { PUBLIC_COLLECTION } from '@fedify/vocab';
import { projectRemoteNoteContent } from '@kosmo/core/activitypub-note-content/server';
import { PostVisibility } from '@kosmo/core/enums';
import { createPost } from '@kosmo/core/services';
import { findContentPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import type { DocumentLoader } from '@fedify/fedify';
import type { Note } from '@fedify/vocab';

type ReplyParent =
  | { readonly kind: 'invalid' | 'none' }
  | { readonly id: string; readonly kind: 'resolved' };

const denyReplyTargetFetch: DocumentLoader = async (url) => {
  throw new Error(`Reply Parent fetch is not available for ${url}`);
};

const resolveReplyParent = async (note: Note): Promise<ReplyParent> => {
  if (note.replyTargetIds.length === 0) {
    try {
      return (await note.getReplyTarget({ documentLoader: denyReplyTargetFetch })) === null
        ? { kind: 'none' }
        : { kind: 'invalid' };
    } catch {
      return { kind: 'invalid' };
    }
  }

  const replyTargetHref = uniqueHref(note.replyTargetIds);
  if (!replyTargetHref) {
    return { kind: 'invalid' };
  }

  const replyTarget = new URL(replyTargetHref);
  if (!isHttpUri(replyTarget)) {
    return { kind: 'invalid' };
  }

  const id = await findContentPostByActivityPubUri(replyTarget);
  return id ? { id, kind: 'resolved' } : { kind: 'invalid' };
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
  if (attributionUri !== actorUri) {
    return;
  }

  const replyParent = await resolveReplyParent(note);
  if (replyParent.kind === 'invalid') {
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
    ...(replyParent.kind === 'resolved' ? { replyParentId: replyParent.id } : {}),
    visibility,
  });
};
