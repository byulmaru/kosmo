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
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentToHtml } from '@kosmo/core/post-content/server';
import { and, eq, ne } from 'drizzle-orm';
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
  readonly replyParentId: string | null;
  readonly summary: string | null;
  readonly visibility: (typeof PostVisibility)[keyof typeof PostVisibility];
};

type LocalPostNoteProjection = LocalPostNote & {
  readonly object: Note;
};

type LocalPostNoteContext = Pick<Context<void>, 'canonicalOrigin' | 'getActorUri'>;

const loadLocalPostNote = async (
  context: LocalPostNoteContext,
  postId: string,
): Promise<LocalPostNote | null> => {
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

  return row && row.instanceCanonicalOrigin && row.post.visibility !== PostVisibility.DIRECT
    ? {
        authorHandle: row.profile.handle,
        authorProfileId: row.profile.id,
        canonicalOrigin: row.instanceCanonicalOrigin,
        contentDocument: row.contentDocument,
        createdAt: row.post.createdAt,
        id: row.post.id,
        replyParentId: row.post.replyParentId,
        summary: row.contentDocument.summary,
        visibility: row.post.visibility,
      }
    : null;
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
  const note = await loadLocalPostNote(context, id);
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

  return (
    signedActor.id.href === context.getActorUri(note.authorProfileId).href ||
    (await isEstablishedFollower(signedActor.id, note.authorProfileId))
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

  const object = new Note({
    attribution: authorUri,
    ...(cc ? { cc } : {}),
    content: postContentDocumentToHtml(note.contentDocument),
    id: new URL(`/ap/note/${note.id}`, note.canonicalOrigin),
    mediaType: 'text/html',
    published: note.createdAt,
    ...(replyTarget ? { replyTarget } : {}),
    ...(note.summary ? { summary: escapeText(note.summary) } : {}),
    to,
    url: new URL(
      `/@${encodeURIComponent(note.authorHandle)}/${encodeGlobalId('Post', note.id)}`,
      note.canonicalOrigin,
    ),
  });

  return { ...note, object };
};
