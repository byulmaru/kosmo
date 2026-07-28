import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import {
  ActivityPubPosts,
  first,
  firstOrThrow,
  firstOrThrowWith,
  getDatabaseConnection,
  Instances,
  isUniqueViolation,
  PostContents,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceState, NotificationKind, PostState, PostVisibility, ProfileState } from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import {
  createReplyNotificationBestEffort,
  createRepostNotification,
  deleteNotificationBySource,
} from './notification';
import { validatePostStructure } from './post-structure';
import type { Transaction } from '../db';
import type { PostContentDocumentV1 } from '../post-content';

type LocalPostInput = {
  document: PostContentDocumentV1;
  origin: 'LOCAL';
  profileId: string;
  replyParentId?: string;
  visibility: PostVisibility;
};

type ActivityPubPostInput = {
  document: PostContentDocumentV1;
  objectUri: string;
  origin: 'ACTIVITYPUB';
  profileId: string;
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  replyParentId?: string;
  visibility: PostVisibility;
};

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

export const deletePost = async (
  {
    actorProfileId,
    postId,
  }: {
    readonly actorProfileId: string;
    readonly postId: string;
  },
  tx?: Transaction,
): Promise<{ readonly postId: string }> => {
  const { replyId, repostId, result } = await getDatabaseConnection(tx).transaction(async (tx) => {
    const post = await tx
      .select({
        currentContentId: Posts.currentContentId,
        profileId: Posts.profileId,
        replyParentId: Posts.replyParentId,
        state: Posts.state,
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

    const replySource = deleted ?? post;
    const isDeletedReply =
      replySource.currentContentId !== null &&
      replySource.replyParentId !== null &&
      (deleted !== undefined || post.state === PostState.DELETED);

    return {
      replyId: isDeletedReply ? postId : undefined,
      repostId:
        deleted &&
        deleted.currentContentId === null &&
        deleted.replyParentId === null &&
        deleted.repostSourceId !== null
          ? deleted.id
          : undefined,
      result: { postId },
    };
  });

  // A caller-owned transaction has no after-commit hook. Its caller owns any
  // post-commit side effect so delivery cannot run before the outer commit.
  if (!tx) {
    await deleteNotificationBySource(NotificationKind.REPOST, result.postId).catch((error) => {
      console.error('Post-commit Repost notification cleanup failed', {
        error,
        postId: result.postId,
      });
    });
  }

  if (!tx && repostId) {
    try {
      const { sendRepostUndo } = await import('@kosmo/fedify');
      await sendRepostUndo(repostId);
    } catch (error) {
      console.error('Post-commit ActivityPub Repost Undo delivery failed', {
        error,
        repostId,
      });
    }
  }

  if (!tx && replyId) {
    try {
      const { sendLocalReplyDelete } = await import('@kosmo/fedify');
      await sendLocalReplyDelete(replyId);
    } catch (error) {
      console.error('Post-commit ActivityPub Reply Delete delivery failed', {
        error,
        postId: replyId,
      });
    }
  }

  return result;
};

export const repostPost = async (
  {
    actorProfileId,
    sourcePostId,
  }: {
    readonly actorProfileId: string;
    readonly sourcePostId: string;
  },
  tx?: Transaction,
): Promise<{
  readonly created: boolean;
  readonly repost: typeof Posts.$inferSelect;
}> => {
  const result = await getDatabaseConnection(tx).transaction(async (tx) => {
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

  // See deletePost: caller-owned transactions cannot safely emit before their
  // outer commit, so only this top-level transaction owns post-commit effects.
  if (!tx && result.created) {
    await createRepostNotification(result.repost.id).catch(() => undefined);

    try {
      const { sendRepostAnnounce } = await import('@kosmo/fedify');
      await sendRepostAnnounce(result.repost.id);
    } catch (error) {
      console.error('Post-commit ActivityPub Repost Announce delivery failed', {
        error,
        repostId: result.repost.id,
      });
    }
  }

  return result;
};
export function createPost(input: LocalPostInput, tx?: Transaction): Promise<CreatedPost>;
export function createPost(
  input: ActivityPubPostInput,
  tx?: Transaction,
): Promise<CreatedPost | DuplicatePost>;
export async function createPost(
  input: LocalPostInput | ActivityPubPostInput,
  tx?: Transaction,
): Promise<CreatedPost | DuplicatePost> {
  try {
    return await getDatabaseConnection(tx).transaction(async (tx) => {
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
      }

      const content = await tx
        .insert(PostContents)
        .values({
          createdAt: input.origin === 'ACTIVITYPUB' ? input.receivedAt : undefined,
          document: input.document,
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

      if (input.replyParentId !== undefined) {
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

      return { content, created: true, post: linkedPost };
    });
  } catch (error) {
    if (input.origin !== 'ACTIVITYPUB' || !isActivityPubPostUriConflict(error)) {
      throw error;
    }

    return { created: false };
  }
}

export const createLocalPost = async (
  input: Omit<LocalPostInput, 'origin'>,
): Promise<CreatedPost> => {
  const result = await getDatabaseConnection().transaction(async (tx) => {
    if (input.replyParentId !== undefined) {
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

    return createPost({ ...input, origin: 'LOCAL' }, tx);
  });

  if (input.replyParentId !== undefined) {
    await createReplyNotificationBestEffort(result.post.id);

    try {
      const { sendLocalReplyCreate } = await import('@kosmo/fedify');
      await sendLocalReplyCreate(result.post.id);
    } catch (error) {
      console.error('Post-commit ActivityPub Reply Create delivery failed', {
        error,
        postId: result.post.id,
      });
    }
  }

  return result;
};
