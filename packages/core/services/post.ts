import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import {
  ActivityPubPosts,
  first,
  firstOrThrow,
  firstOrThrowWith,
  getDatabaseConnection,
  Instances,
  isUniqueViolation,
  Media,
  PostContents,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceState,
  MediaSource,
  MediaState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import {
  canonicalizePostContentDocument,
  validateLocalPostContentDocument,
} from '../post-content/server';
import {
  createReplyNotification,
  createRepostNotification,
  deleteNotificationBySource,
} from './notification';
import { noPostCommit, oncePostCommit } from './post-commit';
import { validatePostStructure } from './post-structure';
import type { DatabaseHandle, Transaction } from '../db';
import type { PostContentDocumentV1 } from '../post-content';
import type { PostCommit } from './post-commit';

type LocalPostInput = {
  accountId?: string;
  document: PostContentDocumentV1;
  media?: readonly {
    altText: string | null;
    mediaId: string;
  }[];
  onPostCommitError?: (error: unknown) => void | Promise<void>;
  origin: 'LOCAL';
  profileId: string;
  replyParentId?: string;
  visibility: PostVisibility;
};

type ActivityPubPostInput = {
  document: PostContentDocumentV1;
  media?: readonly RemoteMediaCandidate[];
  onPostCommitError?: (error: unknown) => void | Promise<void>;
  objectUri: string;
  origin: 'ACTIVITYPUB';
  profileId: string;
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  replyParentId?: string;
  visibility: PostVisibility;
};

type RemoteMediaCandidate = {
  altText: string | null;
  mediaType: string | null;
  url: string;
};

type PostOrigin = 'LOCAL' | 'ACTIVITYPUB';

type CreatedPost = {
  content: typeof PostContents.$inferSelect;
  created: true;
  post: typeof Posts.$inferSelect;
};

type DuplicatePost = { created: false };

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

const findVisiblePost = async (
  tx: Transaction,
  { actorProfileId, postId }: { actorProfileId: string; postId: string },
) =>
  tx
    .select({
      currentContentId: Posts.currentContentId,
      id: Posts.id,
      profileId: Posts.profileId,
      visibility: Posts.visibility,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(
      ProfileFollows,
      and(
        eq(ProfileFollows.followerProfileId, actorProfileId),
        eq(ProfileFollows.followeeProfileId, Posts.profileId),
      ),
    )
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
        ne(Instances.state, InstanceState.SUSPENDED),
        or(
          inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]),
          eq(Posts.profileId, actorProfileId),
          and(eq(Posts.visibility, PostVisibility.FOLLOWERS), isNotNull(ProfileFollows.id)),
        ),
      ),
    )
    .limit(1)
    .then(first);

const materializeRemoteMedia = async (
  tx: Transaction,
  {
    candidates,
    profileId,
  }: {
    candidates: readonly RemoteMediaCandidate[];
    profileId: string;
  },
) => {
  if (candidates.length > 4) {
    throw new ValidationError('Remote Media cannot be attached', { field: 'media' });
  }

  const materialized: { mediaId: string }[] = [];
  for (const candidate of candidates) {
    const media = await tx
      .insert(Media)
      .values({
        ...candidate,
        profileId,
        source: MediaSource.REMOTE,
        state: MediaState.READY,
      })
      .returning({ id: Media.id })
      .then(firstOrThrow);
    materialized.push({ mediaId: media.id });
  }
  return materialized;
};

export const deletePost = async (
  {
    actorProfileId,
    origin,
    postId,
  }: {
    readonly actorProfileId: string;
    readonly origin: PostOrigin;
    readonly postId: string;
  },
  handle?: DatabaseHandle,
): Promise<{
  readonly postCommit: PostCommit;
  readonly postId: string;
  readonly sourcePostId: string | null;
}> => {
  const { deleted, result } = await getDatabaseConnection(handle).transaction(async (tx) => {
    const post = await tx
      .select({
        currentContentId: Posts.currentContentId,
        profileId: Posts.profileId,
        replyParentId: Posts.replyParentId,
        repostSourceId: Posts.repostSourceId,
      })
      .from(Posts)
      .where(eq(Posts.id, postId))
      .limit(1)
      .then(first);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    if (post.profileId !== actorProfileId) {
      throw new PermissionDeniedError('Post author permission is required');
    }

    const deleted = await tx
      .update(Posts)
      .set({ deletedAt: sql`now()`, state: PostState.DELETED })
      .where(
        and(
          eq(Posts.id, postId),
          eq(Posts.profileId, actorProfileId),
          eq(Posts.state, PostState.ACTIVE),
        ),
      )
      .returning({
        currentContentId: Posts.currentContentId,
        id: Posts.id,
        replyParentId: Posts.replyParentId,
        repostSourceId: Posts.repostSourceId,
      })
      .then(first);

    const sourcePostId =
      post.currentContentId === null && post.replyParentId === null ? post.repostSourceId : null;

    return { deleted, result: { postId, sourcePostId } };
  });

  const pureRepost =
    deleted !== undefined &&
    deleted.currentContentId === null &&
    deleted.replyParentId === null &&
    deleted.repostSourceId !== null;
  const localPostId = deleted?.currentContentId ? deleted.id : undefined;

  return {
    ...result,
    postCommit: deleted
      ? oncePostCommit(async (postCommitHandle) => {
          if (pureRepost) {
            await deleteNotificationBySource(
              NotificationKind.REPOST,
              result.postId,
              postCommitHandle,
            ).catch((error) => {
              console.error('Post-commit Repost notification cleanup failed', {
                error,
                postId: result.postId,
              });
            });
          }

          if (origin !== 'LOCAL') {
            return;
          }

          if (pureRepost) {
            try {
              const { sendRepostUndo } = await import('@kosmo/fedify');
              await sendRepostUndo(result.postId);
            } catch (error) {
              console.error('Post-commit ActivityPub Repost Undo delivery failed', {
                error,
                repostId: result.postId,
              });
            }
          } else if (localPostId) {
            try {
              const { sendLocalPostDelete } = await import('@kosmo/fedify');
              await sendLocalPostDelete(localPostId);
            } catch (error) {
              console.error('Post-commit ActivityPub Local Post Delete delivery failed', {
                error,
                postId: localPostId,
              });
            }
          }
        })
      : noPostCommit,
  };
};

export const repostPost = async (
  {
    actorProfileId,
    origin,
    sourcePostId,
  }: {
    readonly actorProfileId: string;
    readonly origin: PostOrigin;
    readonly sourcePostId: string;
  },
  handle?: DatabaseHandle,
): Promise<{
  readonly created: boolean;
  readonly postCommit: PostCommit;
  readonly repost: typeof Posts.$inferSelect;
}> => {
  const result = await getDatabaseConnection(handle).transaction(async (tx) => {
    const source = await findVisiblePost(tx, { actorProfileId, postId: sourcePostId });
    if (!source) {
      throw new NotFoundError('Post not found');
    }
    if (source.currentContentId === null) {
      throw new ValidationError('Post cannot be reposted', { field: 'sourceId' });
    }

    let visibility: PostVisibility;
    if (
      source.visibility === PostVisibility.PUBLIC ||
      source.visibility === PostVisibility.UNLISTED
    ) {
      visibility = PostVisibility.UNLISTED;
    } else if (
      source.visibility === PostVisibility.FOLLOWERS &&
      source.profileId === actorProfileId
    ) {
      visibility = PostVisibility.FOLLOWERS;
    } else {
      throw new ValidationError('Post cannot be reposted', { field: 'sourceId' });
    }

    const inserted = await tx
      .insert(Posts)
      .values({
        profileId: actorProfileId,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility,
      })
      .onConflictDoNothing()
      .returning()
      .then(first);
    if (inserted) {
      return { created: true, repost: inserted };
    }

    const existing = await tx
      .select()
      .from(Posts)
      .where(
        and(
          eq(Posts.profileId, actorProfileId),
          eq(Posts.repostSourceId, source.id),
          eq(Posts.state, PostState.ACTIVE),
          isNull(Posts.currentContentId),
        ),
      )
      .limit(1)
      .then(first);
    if (!existing) {
      throw new Error('Repost not found after insert conflict');
    }

    return { created: false, repost: existing };
  });

  return {
    ...result,
    postCommit: result.created
      ? oncePostCommit(async (postCommitHandle) => {
          await createRepostNotification(result.repost.id, postCommitHandle).catch((error) => {
            console.error('Post-commit Repost notification creation failed', {
              error,
              postId: result.repost.id,
            });
          });

          if (origin !== 'LOCAL') {
            return;
          }

          try {
            const { sendRepostAnnounce } = await import('@kosmo/fedify');
            await sendRepostAnnounce(result.repost.id);
          } catch (error) {
            console.error('Post-commit ActivityPub Repost Announce delivery failed', {
              error,
              repostId: result.repost.id,
            });
          }
        })
      : noPostCommit,
  };
};
export function createPost(input: LocalPostInput, handle?: DatabaseHandle): Promise<CreatedPost>;
export function createPost(
  input: ActivityPubPostInput,
  handle?: DatabaseHandle,
): Promise<CreatedPost | DuplicatePost>;
export async function createPost(
  input: LocalPostInput | ActivityPubPostInput,
  handle?: DatabaseHandle,
): Promise<CreatedPost | DuplicatePost> {
  let result: CreatedPost;
  try {
    result = await getDatabaseConnection(handle).transaction(async (tx) => {
      let document =
        input.origin === 'LOCAL'
          ? validateLocalPostContentDocument(input.document)
          : input.document;

      if (input.origin === 'LOCAL') {
        const mediaIds = document.body.content.flatMap((block) =>
          block.type === 'media' ? [block.attrs.mediaId] : [],
        );
        const media = input.media ?? [];
        if (
          media.length !== mediaIds.length ||
          media.some(({ mediaId }, index) => mediaId !== mediaIds[index])
        ) {
          throw new ValidationError('Media cannot be attached', { field: 'media' });
        }
        if (new Set(mediaIds).size !== mediaIds.length) {
          throw new ValidationError('Media cannot be attached', { field: 'media' });
        }
        if (mediaIds.length > 0) {
          if (!input.accountId) {
            throw new ValidationError('Media cannot be attached', { field: 'media' });
          }
          const attachableMedia = await tx
            .select({ id: Media.id })
            .from(Media)
            .where(
              and(
                inArray(Media.id, mediaIds),
                eq(Media.accountId, input.accountId),
                eq(Media.source, MediaSource.LOCAL),
                eq(Media.state, MediaState.READY),
              ),
            );
          if (attachableMedia.length !== mediaIds.length) {
            throw new ValidationError('Media cannot be attached', { field: 'media' });
          }
          for (const { altText, mediaId } of media) {
            await tx.update(Media).set({ altText }).where(eq(Media.id, mediaId));
          }
        }
      }

      if (input.origin === 'LOCAL' && input.replyParentId !== undefined) {
        const parent = await findVisiblePost(tx, {
          actorProfileId: input.profileId,
          postId: input.replyParentId,
        });
        if (!parent) {
          throw new NotFoundError('Post not found');
        }
        if (parent.currentContentId === null) {
          throw new ValidationError('Reply Parent must have content', {
            field: 'replyParentId',
          });
        }
      }

      const createdAt =
        input.origin === 'ACTIVITYPUB' &&
        input.publishedAt &&
        Temporal.Instant.compare(input.publishedAt, input.receivedAt) < 0
          ? input.publishedAt
          : input.origin === 'ACTIVITYPUB'
            ? input.receivedAt
            : undefined;
      const post = await tx
        .insert(Posts)
        .values({
          createdAt,
          profileId: input.profileId,
          state: PostState.ACTIVE,
          visibility: input.visibility,
        })
        .returning()
        .then(firstOrThrow);

      if (input.origin === 'ACTIVITYPUB') {
        await tx.insert(ActivityPubPosts).values({
          postId: post.id,
          publishedAt: input.publishedAt,
          receivedAt: input.receivedAt,
          uri: input.objectUri,
        });

        const media = await materializeRemoteMedia(tx, {
          candidates: input.media ?? [],
          profileId: input.profileId,
        });
        if (media.length > 0) {
          document = canonicalizePostContentDocument({
            ...document,
            body: {
              ...document.body,
              content: [
                ...document.body.content,
                ...media.map(({ mediaId }) => ({
                  attrs: { mediaId },
                  type: 'media' as const,
                })),
              ],
            },
          });
        }
      }

      const content = await tx
        .insert(PostContents)
        .values({
          createdAt: input.origin === 'ACTIVITYPUB' ? input.receivedAt : undefined,
          document,
          postId: post.id,
        })
        .returning()
        .then(firstOrThrow);

      validatePostStructure({
        currentContentId: content.id,
        id: post.id,
        replyParentId: input.replyParentId ?? null,
        repostSourceId: post.repostSourceId,
      });

      if (input.origin === 'ACTIVITYPUB' && input.replyParentId !== undefined) {
        const replyParent = await tx
          .select({ currentContentId: Posts.currentContentId })
          .from(Posts)
          .where(eq(Posts.id, input.replyParentId))
          .then(firstOrThrowWith(() => new NotFoundError('Post not found')));
        if (replyParent.currentContentId === null) {
          throw new ValidationError('Reply Parent must have content', {
            field: 'replyParentId',
          });
        }
      }

      const linkedPost = await tx
        .update(Posts)
        .set({ currentContentId: content.id, replyParentId: input.replyParentId ?? null })
        .where(eq(Posts.id, post.id))
        .returning()
        .then(firstOrThrow);

      if (input.replyParentId !== undefined) {
        await createReplyNotification(linkedPost.id, tx).catch(async (error) => {
          if (!input.onPostCommitError) {
            console.error('Reply notification creation failed', {
              error,
              postId: linkedPost.id,
            });
            return;
          }

          try {
            await input.onPostCommitError(error);
          } catch (observerError) {
            console.error('Reply notification creation failed', {
              error,
              observerError,
              postId: linkedPost.id,
            });
          }
        });
      }

      return { content, created: true, post: linkedPost };
    });
  } catch (error) {
    if (input.origin !== 'ACTIVITYPUB' || !isActivityPubPostUriConflict(error)) {
      throw error;
    }

    return { created: false };
  }

  if (input.origin === 'LOCAL') {
    try {
      const { sendLocalPostCreate } = await import('@kosmo/fedify');
      await sendLocalPostCreate(result.post.id);
    } catch (error) {
      console.error('Post-commit ActivityPub Local Post Create delivery failed', {
        error,
        postId: result.post.id,
      });
    }
  }

  return result;
}
