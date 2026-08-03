import '@kosmo/core/polyfill';

import { MIMEType } from 'node:util';
import { Document, Image, Link, PUBLIC_COLLECTION } from '@fedify/vocab';
import { projectRemoteNoteContent } from '@kosmo/core/activitypub-note-content/server';
import { db, first, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, PostVisibility, ProfileState } from '@kosmo/core/enums';
import { NotFoundError, ValidationError } from '@kosmo/core/error';
import { createPost } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { findPostByActivityPubUri } from './activitypub-post-uri';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import type { InboxContext } from '@fedify/fedify';
import type { Note } from '@fedify/vocab';

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote attachment lookup is disabled');
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

export const handleInboundCreateNote = async ({
  actorUri,
  context,
  note,
  objectUri,
  profileId,
  canonicalFollowersUri,
  receivedAt,
}: {
  actorUri: string;
  context: InboxContext<void>;
  note: Note;
  objectUri: string;
  profileId: string;
  canonicalFollowersUri: string | null;
  receivedAt: Temporal.Instant;
}): Promise<void> => {
  if (note.id?.href !== objectUri) {
    return;
  }

  const attributionUri = uniqueHref(note.attributionIds);
  if (attributionUri !== actorUri) {
    return;
  }

  const visibility = note.toIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)
    ? PostVisibility.PUBLIC
    : note.ccIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)
      ? PostVisibility.UNLISTED
      : canonicalFollowersUri &&
          [...note.toIds, ...note.ccIds].some((uri) => uri.href === canonicalFollowersUri)
        ? PostVisibility.FOLLOWERS
        : undefined;
  if (!visibility) {
    return;
  }

  if (
    visibility === PostVisibility.FOLLOWERS &&
    !(await hasEstablishedFollower({
      followerProfileId: context.recipient,
      followeeProfileId: profileId,
    }))
  ) {
    return;
  }

  const replyParentId = await resolveReplyParentId(context, note);

  let document;
  let media;
  try {
    document = projectRemoteNoteContent({
      content: note.content?.toString() ?? null,
      mediaType: note.mediaType,
      summary: note.summary?.toString() ?? null,
    });
    media = await projectRemoteNoteMedia(note);
  } catch (error) {
    if (error instanceof TypeError) {
      return;
    }
    throw error;
  }

  const input = {
    document,
    media,
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
    if (error instanceof ValidationError && error.field === 'media') {
      return;
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

    await createPost(input);
  }
};
