import '@kosmo/core/polyfill';

import { Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  PostContents,
  Posts,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { InstanceState, PostState, PostVisibility, ProfileState } from '@kosmo/core/enums';
import {
  LocalInstanceConfigurationError,
  resolveConfiguredLocalInstance,
} from '@kosmo/core/local-instance';
import { postContentDocumentToHtml } from '@kosmo/core/post-content/server';
import { and, eq, ne } from 'drizzle-orm';
import { escapeText } from 'entities/escape';
import {
  getLocalPostUri,
  isCanonicalPostId,
  resolveActivityPubPostUri,
} from './activitypub-post-uri';
import type { RequestContext } from '@fedify/fedify';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';

type LocalPostNote = {
  readonly authorHandle: string;
  readonly authorProfileId: string;
  readonly canonicalOrigin: string;
  readonly contentDocument: PostContentDocumentV1;
  readonly createdAt: Temporal.Instant;
  readonly id: string;
  readonly localInstanceId: string;
  readonly replyParentId: string | null;
  readonly summary: string | null;
  readonly visibility: (typeof PostVisibility)[keyof typeof PostVisibility];
};

const privateLocalNoteRequests = new WeakSet<Request>();

const loadLocalPostNote = async (postId: string): Promise<LocalPostNote | null> => {
  if (!isCanonicalPostId(postId)) {
    return null;
  }

  let localInstance;
  try {
    localInstance = await resolveConfiguredLocalInstance();
  } catch (error) {
    if (error instanceof LocalInstanceConfigurationError) {
      return null;
    }
    throw error;
  }

  const row = await db
    .select({
      contentDocument: PostContents.document,
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
        eq(Profiles.instanceId, localInstance.id),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.state, InstanceState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

  return row && row.post.visibility !== PostVisibility.DIRECT
    ? {
        authorHandle: row.profile.handle,
        authorProfileId: row.profile.id,
        canonicalOrigin: localInstance.canonicalOrigin,
        contentDocument: row.contentDocument,
        createdAt: row.post.createdAt,
        id: row.post.id,
        localInstanceId: localInstance.id,
        replyParentId: row.post.replyParentId,
        summary: row.contentDocument.summary,
        visibility: row.post.visibility,
      }
    : null;
};

const getFollowersUri = (context: RequestContext<void>, profileId: string): URL => {
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
  const note = await loadLocalPostNote(id);
  if (!note) {
    return false;
  }
  if (note.visibility !== PostVisibility.FOLLOWERS) {
    return true;
  }

  const signedActor = await context.getSignedKeyOwner();
  if (!signedActor?.id) {
    return false;
  }

  const authorized =
    signedActor.id.href === context.getActorUri(note.authorProfileId).href ||
    (await isEstablishedFollower(signedActor.id, note.authorProfileId));
  if (authorized) {
    privateLocalNoteRequests.add(context.request);
  }
  return authorized;
};

export const dispatchLocalPostNote = async (
  context: RequestContext<void>,
  { id }: { id: string },
): Promise<Note | null> => {
  const note = await loadLocalPostNote(id);
  if (!note) {
    return null;
  }

  const authorUri = context.getActorUri(note.authorProfileId);
  const followersUri = getFollowersUri(context, note.authorProfileId);
  const replyTarget = note.replyParentId
    ? await resolveActivityPubPostUri({
        canonicalOrigin: note.canonicalOrigin,
        localInstanceId: note.localInstanceId,
        postId: note.replyParentId,
      })
    : undefined;
  const to = note.visibility === PostVisibility.PUBLIC ? PUBLIC_COLLECTION : followersUri;
  const cc =
    note.visibility === PostVisibility.PUBLIC
      ? followersUri
      : note.visibility === PostVisibility.UNLISTED
        ? PUBLIC_COLLECTION
        : undefined;

  return new Note({
    attribution: authorUri,
    ...(cc ? { cc } : {}),
    content: postContentDocumentToHtml(note.contentDocument),
    id: getLocalPostUri(note.canonicalOrigin, note.id),
    mediaType: 'text/html',
    published: note.createdAt,
    ...(replyTarget ? { replyTarget } : {}),
    ...(note.summary ? { summary: escapeText(note.summary) } : {}),
    to,
    url: new URL(`/@${encodeURIComponent(note.authorHandle)}/${note.id}`, note.canonicalOrigin),
  });
};

export const applyLocalNoteCachePolicy = (request: Request, response: Response): Response => {
  if (response.ok && privateLocalNoteRequests.has(request)) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
};
