import { eq } from 'drizzle-orm';
import {
  ActivityPubPosts,
  firstOrThrow,
  firstOrThrowWith,
  getDatabaseConnection,
  isUniqueViolation,
  PostContents,
  Posts,
} from '../db';
import { PostState } from '../enums';
import { NotFoundError, ValidationError } from '../error';
import { validatePostStructure } from './post-structure';
import type { Transaction } from '../db';
import type { PostVisibility } from '../enums';
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
