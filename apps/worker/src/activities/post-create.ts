import '@kosmo/core/polyfill';

import { ActivityPubPosts, db, first, firstOrThrow, PostContents, Posts } from '@kosmo/core/db';
import { PostState } from '@kosmo/core/enums';
import { ConflictError, KosmoError, NotFoundError, ValidationError } from '@kosmo/core/error';
import {
  createPostInTransaction,
  isActivityPubPostUriConflict,
  ProfilePairBlockedError,
} from '@kosmo/core/services';
import { eq, sql } from 'drizzle-orm';
import type { ActivityPubPostInput, PostCreateInput } from '@kosmo/core/services';
import type {
  PostCreateActivityInput,
  PostCreateActivityResult,
} from '@kosmo/core/temporal/post-create';

const toPostInput = (input: PostCreateActivityInput['input']): PostCreateInput =>
  input.origin === 'ACTIVITYPUB'
    ? {
        ...input,
        publishedAt: input.publishedAt === null ? null : Temporal.Instant.from(input.publishedAt),
        receivedAt: Temporal.Instant.from(input.receivedAt),
      }
    : input;

const withoutReplyParent = (input: ActivityPubPostInput): ActivityPubPostInput => {
  const result = { ...input };
  delete result.replyParentId;
  return result;
};

const isReplyParentFailure = (error: unknown): boolean =>
  error instanceof NotFoundError ||
  (error instanceof ValidationError && error.field === 'replyParentId');

const toErrorResult = (
  error: unknown,
  origin: PostCreateActivityInput['input']['origin'],
): PostCreateActivityResult => {
  if (!(error instanceof KosmoError)) {
    throw error;
  }
  const field = 'field' in error && typeof error.field === 'string' ? error.field : undefined;
  const kind =
    origin === 'ACTIVITYPUB' && error instanceof ProfilePairBlockedError
      ? 'reply_profile_blocked'
      : origin === 'ACTIVITYPUB' && error instanceof ValidationError && error.field === 'media'
        ? 'note_media_validation_rejected'
        : undefined;
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(field === undefined ? {} : { field }),
      ...(kind === undefined ? {} : { kind }),
    },
  };
};

const createPostTransaction = async (
  input: PostCreateInput,
  postId: string,
  replyParentFallback: boolean,
): Promise<PostCreateActivityResult> =>
  db.transaction(async (tx) => {
    const claimed = await tx
      .insert(Posts)
      .values({
        actorAccountId: input.origin === 'LOCAL' ? (input.accountId ?? null) : null,
        currentContentId: null,
        id: postId,
        profileId: input.profileId,
        replyParentId: null,
        repostSourceId: null,
        state: PostState.ACTIVE,
        visibility: input.visibility,
      })
      .onConflictDoNothing({ target: Posts.id })
      .returning({ id: Posts.id })
      .then(first);

    if (!claimed) {
      const existing = await tx
        .select({
          actorAccountId: Posts.actorAccountId,
          contentPostId: PostContents.postId,
          currentContentId: Posts.currentContentId,
          id: Posts.id,
          mappedUri: ActivityPubPosts.uri,
          profileId: Posts.profileId,
          replyParentId: Posts.replyParentId,
        })
        .from(Posts)
        .leftJoin(PostContents, eq(PostContents.id, Posts.currentContentId))
        .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
        .where(eq(Posts.id, postId))
        .limit(1)
        .then(first);
      const completeContent =
        existing !== undefined &&
        existing.currentContentId !== null &&
        existing.contentPostId === existing.id;
      const sameSource =
        input.origin === 'LOCAL'
          ? existing?.actorAccountId === (input.accountId ?? null) &&
            existing.profileId === input.profileId &&
            existing.mappedUri === null
          : existing?.actorAccountId === null &&
            existing.profileId === input.profileId &&
            existing.mappedUri === input.objectUri;
      if (!existing || !completeContent || !sameSource) {
        throw new ConflictError({ message: 'Post creation identity is already in use' });
      }

      const parentFallback =
        replyParentFallback ||
        (input.origin === 'ACTIVITYPUB' &&
          input.replyParentId !== undefined &&
          existing.replyParentId !== input.replyParentId);
      return {
        ok: true,
        result: {
          authorProfileId: existing.profileId,
          postId: existing.id,
          ...(parentFallback ? { replyParentFallback: true } : {}),
          status: 'created',
        },
      };
    }

    const created = await createPostInTransaction(tx, input, postId);
    return {
      ok: true,
      result: {
        authorProfileId: created.post.profileId,
        postId: created.post.id,
        ...(replyParentFallback ? { replyParentFallback: true } : {}),
        status: 'created',
      },
    };
  });

const duplicateActivityPubPost = async (objectUri: string): Promise<PostCreateActivityResult> => {
  const existing = await db
    .select({ authorProfileId: Posts.profileId, postId: ActivityPubPosts.postId })
    .from(ActivityPubPosts)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
    .where(eq(ActivityPubPosts.uri, objectUri))
    .limit(1)
    .then(first);
  if (!existing) {
    throw new Error('ActivityPub Post not found after URI conflict');
  }
  return {
    ok: true,
    result: {
      authorProfileId: existing.authorProfileId,
      postId: existing.postId,
      status: 'duplicate',
    },
  };
};

const createPostAttempt = async (
  input: PostCreateInput,
  postId: string,
  replyParentFallback: boolean,
): Promise<PostCreateActivityResult> => {
  try {
    return await createPostTransaction(input, postId, replyParentFallback);
  } catch (error) {
    if (input.origin === 'ACTIVITYPUB' && isActivityPubPostUriConflict(error)) {
      return duplicateActivityPubPost(input.objectUri);
    }
    throw error;
  }
};

export const generatePostIdActivity = async (): Promise<string> =>
  db
    .select({ id: sql<string>`uuidv7()` })
    .from(sql`(VALUES (1)) AS id_source(value)`)
    .limit(1)
    .then(firstOrThrow)
    .then(({ id }) => id);

export const createPostActivity = async ({
  input,
  postId,
}: PostCreateActivityInput): Promise<PostCreateActivityResult> => {
  const postInput = toPostInput(input);
  try {
    return await createPostAttempt(postInput, postId, false);
  } catch (error) {
    if (input.origin === 'ACTIVITYPUB' && error instanceof ProfilePairBlockedError) {
      return toErrorResult(error, postInput.origin);
    }
    if (
      postInput.origin === 'ACTIVITYPUB' &&
      postInput.replyParentId !== undefined &&
      isReplyParentFailure(error)
    ) {
      try {
        return await createPostAttempt(withoutReplyParent(postInput), postId, true);
      } catch (fallbackError) {
        return toErrorResult(fallbackError, postInput.origin);
      }
    }
    return toErrorResult(error, postInput.origin);
  }
};
