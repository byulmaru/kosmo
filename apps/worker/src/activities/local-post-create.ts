import { db, first, firstOrThrow, PostContents, Posts } from '@kosmo/core/db';
import { PostState } from '@kosmo/core/enums';
import { ConflictError, KosmoError } from '@kosmo/core/error';
import { createLocalPostInTransaction } from '@kosmo/core/services';
import { and, eq, sql } from 'drizzle-orm';
import type { ErrorCode } from '@kosmo/core/error';
import type { LocalPostCreateInput } from '@kosmo/core/temporal/local-post-create';

export type LocalPostCreateExecution =
  | { readonly ok: true; readonly result: { readonly postId: string } }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: ErrorCode;
        readonly message: string;
        readonly field?: string;
      };
    };

export const generateLocalPostIdActivity = async (): Promise<string> =>
  db
    .select({ id: sql<string>`uuidv7()` })
    .from(sql`(VALUES (1)) AS id_source(value)`)
    .limit(1)
    .then(firstOrThrow)
    .then(({ id }) => id);

export const createLocalPostActivity = async (
  input: LocalPostCreateInput,
  postId: string,
): Promise<LocalPostCreateExecution> => {
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(Posts)
        .values({
          actorAccountId: input.accountId ?? null,
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
            id: Posts.id,
            profileId: Posts.profileId,
          })
          .from(Posts)
          .innerJoin(PostContents, eq(PostContents.id, Posts.currentContentId))
          .where(and(eq(Posts.id, postId), eq(PostContents.postId, postId)))
          .limit(1)
          .then(first);
        if (
          !existing ||
          existing.actorAccountId !== (input.accountId ?? null) ||
          existing.profileId !== input.profileId
        ) {
          throw new ConflictError({ message: 'Local Post creation identity is already in use' });
        }
        return { ok: true, result: { postId: existing.id } } as const;
      }

      const post = await createLocalPostInTransaction(tx, input, postId);
      return { ok: true, result: { postId: post.post.id } } as const;
    });
  } catch (error) {
    if (!(error instanceof KosmoError)) {
      throw error;
    }
    const field = 'field' in error && typeof error.field === 'string' ? error.field : undefined;
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(field === undefined ? {} : { field }),
      },
    };
  }
};
