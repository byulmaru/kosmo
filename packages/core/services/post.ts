import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  ActivityPubPosts,
  db,
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
  PostState,
  PostVisibility,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import {
  canonicalizePostContentDocument,
  validateLocalPostContentDocument,
} from '../post-content/server';
import { temporalClient } from '../temporal/client';
import {
  POST_CREATE_EFFECTS_WORKFLOW_TYPE,
  postCreateEffectsWorkflowStartOptions,
} from '../temporal/post-create-effects';
import {
  REPOST_EFFECTS_WORKFLOW_TYPE,
  repostEffectsWorkflowStartOptions,
} from '../temporal/repost-effects';
import { postVisibilityCondition } from '../visibility/post';
import { noPostCommit, oncePostCommit } from './post-commit';
import { validatePostStructure } from './post-structure';
import type { DatabaseHandle, Transaction } from '../db';
import type { PostContentDocumentV1 } from '../post-content';
import type { RepostEffectsInput } from '../temporal/repost-effects';
import type { PostCommit } from './post-commit';

type LocalPostInput = {
  accountId?: string;
  document: PostContentDocumentV1;
  media?: readonly {
    altText: string | null;
    mediaId: string;
  }[];
  origin: 'LOCAL';
  profileId: string;
  replyParentId?: string;
  visibility: PostVisibility;
};

type ActivityPubPostInput = {
  document: PostContentDocumentV1;
  media?: readonly RemoteMediaCandidate[];
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
        postVisibilityCondition({
          columns: {
            authorProfileId: Posts.profileId,
            authorVisible: and(
              eq(Profiles.state, ProfileState.ACTIVE),
              ne(Instances.state, InstanceState.SUSPENDED),
            )!,
            postState: Posts.state,
            postVisibility: Posts.visibility,
          },
          viewerFollowsAuthor: isNotNull(ProfileFollows.id),
          viewerProfileId: actorProfileId,
        }),
      ),
    )
    .limit(1)
    .then(first);

const resolveRepostVisibility = (
  source: {
    readonly profileId: string;
    readonly visibility: PostVisibility;
  },
  actorProfileId: string,
): PostVisibility => {
  if (
    source.visibility === PostVisibility.PUBLIC ||
    source.visibility === PostVisibility.UNLISTED
  ) {
    return PostVisibility.UNLISTED;
  }
  if (source.visibility === PostVisibility.FOLLOWERS && source.profileId === actorProfileId) {
    return PostVisibility.FOLLOWERS;
  }
  throw new ValidationError('Post cannot be reposted', { field: 'sourceId' });
};

export const startRepostEffectsWorkflow = async (input: RepostEffectsInput): Promise<void> => {
  try {
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start(
        REPOST_EFFECTS_WORKFLOW_TYPE,
        repostEffectsWorkflowStartOptions(input),
      ),
    );
  } catch (error) {
    console.error('Repost effects Workflow start failed', {
      error,
      origin: input.origin,
      repostId: input.repostId,
      transition: input.transition,
    });
  }
};

export const materializeRepostInTransaction = async (
  tx: Transaction,
  {
    actorProfileId,
    sourcePostId,
  }: {
    readonly actorProfileId: string;
    readonly sourcePostId: string;
  },
) => {
  const source = await findVisiblePost(tx, { actorProfileId, postId: sourcePostId });
  if (!source) {
    throw new NotFoundError('Post not found');
  }
  if (source.currentContentId === null) {
    throw new ValidationError('Post cannot be reposted', { field: 'sourceId' });
  }

  const visibility = resolveRepostVisibility(source, actorProfileId);
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
    return { created: true as const, repost: inserted };
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

  return { created: false as const, repost: existing };
};

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
  readonly postCommit?: PostCommit;
  readonly postId: string;
  readonly sourcePostId: string | null;
}> => {
  const { deleted, post, result } = await getDatabaseConnection(handle).transaction(async (tx) => {
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

    return { deleted, post, result: { postId, sourcePostId } };
  });

  const pureRepost =
    post.currentContentId === null && post.replyParentId === null && post.repostSourceId !== null;
  const localPostId = deleted?.currentContentId ? deleted.id : undefined;
  const ordinaryPostCommit =
    deleted && origin === 'LOCAL' && localPostId
      ? oncePostCommit(async () => {
          try {
            const { sendLocalPostDelete } = await import('@kosmo/fedify');
            await sendLocalPostDelete(localPostId);
          } catch (error) {
            console.error('Post-commit ActivityPub Local Post Delete delivery failed', {
              error,
              postId: localPostId,
            });
          }
        })
      : noPostCommit;

  if (deleted && pureRepost && deleted.repostSourceId !== null && !handle) {
    await startRepostEffectsWorkflow({
      origin,
      repostId: deleted.id,
      transition: 'DELETE',
    });
  } else if (!handle) {
    await ordinaryPostCommit();
  }

  return {
    ...result,
    ...(handle && !pureRepost ? { postCommit: ordinaryPostCommit } : {}),
  };
};

export const repostPost = async ({
  actorProfileId,
  origin,
  sourcePostId,
}: {
  readonly actorProfileId: string;
  readonly origin: PostOrigin;
  readonly sourcePostId: string;
}): Promise<{
  readonly created: boolean;
  readonly repost: typeof Posts.$inferSelect;
}> => {
  const result = await db.transaction((tx) =>
    materializeRepostInTransaction(tx, { actorProfileId, sourcePostId }),
  );

  if (result.created) {
    await startRepostEffectsWorkflow({
      origin,
      repostId: result.repost.id,
      transition: 'CREATE',
    });
  }

  return result;
};
export function createPost(input: LocalPostInput): Promise<CreatedPost>;
export function createPost(input: ActivityPubPostInput): Promise<CreatedPost | DuplicatePost>;
export async function createPost(
  input: LocalPostInput | ActivityPubPostInput,
): Promise<CreatedPost | DuplicatePost> {
  let result: CreatedPost;
  try {
    result = await db.transaction(async (tx) => {
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

      return { content, created: true, post: linkedPost };
    });
  } catch (error) {
    if (input.origin !== 'ACTIVITYPUB' || !isActivityPubPostUriConflict(error)) {
      throw error;
    }

    return { created: false };
  }

  try {
    const workflowInput = { postId: result.post.id, origin: input.origin };
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start(
        POST_CREATE_EFFECTS_WORKFLOW_TYPE,
        postCreateEffectsWorkflowStartOptions(workflowInput),
      ),
    );
  } catch (error) {
    console.error('Post Create effects Workflow start failed', {
      error,
      origin: input.origin,
      postId: result.post.id,
    });
  }

  return result;
}
