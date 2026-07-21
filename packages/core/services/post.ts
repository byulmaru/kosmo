import { eq } from 'drizzle-orm';
import { ActivityPubPosts, db, firstOrThrow, isUniqueViolation, PostContents, Posts } from '../db';
import { PostState } from '../enums';
import { ValidationError } from '../error';
import { validatePostStructure } from '../validation';
import type { PostVisibility } from '../enums';
import type { PostContentDocumentV1 } from '../post-content';

type LocalPostInputBase = {
  origin: 'LOCAL';
  profileId: string;
  visibility: PostVisibility;
};

type LocalContentPostInput = LocalPostInputBase & {
  document: PostContentDocumentV1;
  repostSourceId?: string | null;
};

type LocalRepostInput = LocalPostInputBase & {
  document: null;
  repostSourceId: string;
};

type LocalPostInput = LocalContentPostInput | LocalRepostInput;

type ActivityPubPostInput = {
  document: PostContentDocumentV1;
  objectUri: string;
  origin: 'ACTIVITYPUB';
  profileId: string;
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  visibility: PostVisibility;
};

type CreatedContentPost = {
  content: typeof PostContents.$inferSelect;
  created: true;
  post: typeof Posts.$inferSelect;
};

type CreatedRepost = {
  content: null;
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

export function createPost(input: LocalContentPostInput): Promise<CreatedContentPost>;
export function createPost(input: LocalRepostInput): Promise<CreatedRepost>;
export function createPost(
  input: ActivityPubPostInput,
): Promise<CreatedContentPost | DuplicatePost>;
export async function createPost(
  input: LocalPostInput | ActivityPubPostInput,
): Promise<CreatedContentPost | CreatedRepost | DuplicatePost> {
  const repostSourceId = 'repostSourceId' in input ? (input.repostSourceId ?? null) : null;
  if (input.origin === 'ACTIVITYPUB' && repostSourceId) {
    throw new ValidationError('ActivityPub repost sources are not supported', {
      field: 'repostSourceId',
    });
  }
  validatePostStructure({
    hasContent: input.document !== null,
    hasReplyParent: false,
    repostSourceId,
  });

  try {
    return await db.transaction(async (tx) => {
      if (repostSourceId) {
        const source = await tx
          .select({ currentContentId: Posts.currentContentId, state: Posts.state })
          .from(Posts)
          .where(eq(Posts.id, repostSourceId))
          .then((rows) => rows[0]);
        if (!source || source.state !== PostState.ACTIVE || !source.currentContentId) {
          throw new ValidationError('Repost source must be an active post with content', {
            field: 'repostSourceId',
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
          repostSourceId: input.document === null ? repostSourceId : null,
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

      if (input.document === null) {
        return { content: null, created: true, post };
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
      const linkedPost = await tx
        .update(Posts)
        .set({ currentContentId: content.id, repostSourceId })
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
