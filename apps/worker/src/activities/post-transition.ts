import { db, first, Posts } from '@kosmo/core/db';
import { PostQuoteConsentStatus, PostState } from '@kosmo/core/enums';
import { KosmoError, NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import {
  createPostPersisted,
  deletePostPersisted,
  loadQuoteConsentForPost,
} from '@kosmo/core/services';
import { eq, sql } from 'drizzle-orm';
import type {
  PostCreateInput,
  PostDeleteInput,
  PostDeleteResult,
  PostTransitionOutcome,
} from '@kosmo/core/temporal/post';

export const reservePostIdActivity = async (): Promise<string> => {
  const [row] = await db.execute<{ id: string }>(sql`select uuidv7() as id`);
  if (!row) {
    throw new Error('Post identity allocation failed');
  }
  return row.id;
};

export const createPostTransitionActivity = async (
  input: PostCreateInput,
  postId: string,
): Promise<
  PostTransitionOutcome<{ postId: string }> & {
    quoteRequest?: { consentId: string; postId: string; revision: number };
  }
> => {
  try {
    await createPostPersisted(input, postId);
    const consent = await loadQuoteConsentForPost(db, postId);
    return {
      ok: true,
      result: { postId },
      ...(consent?.status === PostQuoteConsentStatus.PENDING
        ? { quoteRequest: { consentId: consent.id, postId, revision: consent.revision } }
        : {}),
    };
  } catch (error) {
    if (!(error instanceof KosmoError)) {
      throw error;
    }
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...('field' in error && typeof error.field === 'string' ? { field: error.field } : {}),
      },
    };
  }
};

export const verifyPostDeletionActivity = async (
  input: PostDeleteInput,
): Promise<PostTransitionOutcome<{ active: boolean; sourcePostId: string | null }>> => {
  try {
    const post = await db.select().from(Posts).where(eq(Posts.id, input.postId)).then(first);
    if (!post) {
      throw new NotFoundError('Post not found');
    }
    if (post.profileId !== input.actorProfileId) {
      throw new PermissionDeniedError('Post author permission is required');
    }
    return {
      ok: true,
      result: {
        active: post.state === PostState.ACTIVE,
        sourcePostId:
          post.currentContentId === null && post.replyParentId === null
            ? post.repostSourceId
            : null,
      },
    };
  } catch (error) {
    if (!(error instanceof KosmoError)) {
      throw error;
    }
    return { ok: false, error: { code: error.code, message: error.message } };
  }
};

export const deletePostTransitionActivity = async (
  input: PostDeleteInput,
): Promise<PostTransitionOutcome<PostDeleteResult>> => {
  try {
    const { result } = await deletePostPersisted(input);
    return { ok: true, result };
  } catch (error) {
    if (!(error instanceof KosmoError)) {
      throw error;
    }
    return { ok: false, error: { code: error.code, message: error.message } };
  }
};
