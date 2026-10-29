import { isDeepStrictEqual } from 'node:util';
import {
  db,
  first,
  Hashtags,
  Instances,
  PostContentHashtags,
  PostContents,
  PostMentions,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, PostState } from '@kosmo/core/enums';
import {
  applyPostContentHashtags,
  findLocalPostContentHashtagCandidates,
} from '@kosmo/core/post-content/server';
import { normalizeHashtag } from '@kosmo/core/validation';
import { and, asc, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import type { Transaction } from '@kosmo/core/db';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';
import type {
  ReprocessLocalPostContentInput,
  ReprocessLocalPostContentResult,
} from '@kosmo/core/temporal/workflows';

interface LoadLocalPostsForContentReprocessingInput {
  readonly afterPostId?: string;
  readonly limit: number;
  readonly maxPostId?: string | null;
}

type PostContentReprocessingTarget = {
  readonly postContentId: string;
  readonly postId: string;
};

class LostPostContentRace extends Error {}

const collectDocumentHashtagIds = (document: PostContentDocumentV1): string[] =>
  [
    ...new Set(
      document.body.content.flatMap((block) =>
        block.type === 'paragraph'
          ? (block.content ?? []).flatMap((node) =>
              node.type === 'hashtag' ? [node.attrs.hashtagId] : [],
            )
          : [],
      ),
    ),
  ].sort();

const existingHashtagRowsById = async (tx: Transaction, ids: readonly string[]) => {
  if (ids.length === 0) {
    return new Map<string, { readonly id: string; readonly name: string }>();
  }
  const rows = await tx
    .select({ id: Hashtags.id, name: Hashtags.name })
    .from(Hashtags)
    .where(inArray(Hashtags.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
};

const hashtagsByName = async (tx: Transaction, names: readonly string[]) => {
  if (names.length === 0) {
    return new Map<string, { readonly id: string; readonly name: string }>();
  }
  const rows = await tx
    .select({ id: Hashtags.id, name: Hashtags.name })
    .from(Hashtags)
    .where(inArray(Hashtags.name, [...names]));
  return new Map(rows.map((row) => [row.name, row]));
};

const applyCandidates = (
  document: PostContentDocumentV1,
  candidates: ReturnType<typeof findLocalPostContentHashtagCandidates>,
  hashtags: ReadonlyMap<string, { readonly id: string; readonly name: string }>,
): PostContentDocumentV1 =>
  applyPostContentHashtags(
    document,
    candidates.map((candidate) => {
      const { name } = normalizeHashtag(candidate.token);
      const hashtag = hashtags.get(name);
      if (!hashtag) {
        throw new Error('PostContent Hashtag was not materialized');
      }
      return { ...candidate, hashtagId: hashtag.id };
    }),
  );

const reprocessInTransaction = async (
  tx: Transaction,
  { dryRun, postContentId, postId }: Required<ReprocessLocalPostContentInput>,
): Promise<ReprocessLocalPostContentResult['status']> => {
  const source = await tx
    .select({
      currentContentId: Posts.currentContentId,
      document: PostContents.document,
      instanceKind: Instances.kind,
      postState: Posts.state,
      sourcePostId: PostContents.postId,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(
      PostContents,
      and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
    )
    .where(eq(Posts.id, postId))
    .then(first);

  if (
    !source ||
    source.currentContentId !== postContentId ||
    source.postState !== PostState.ACTIVE ||
    source.instanceKind !== InstanceKind.LOCAL ||
    source.sourcePostId !== postId
  ) {
    return 'skipped';
  }

  const document = source.document;
  const existingRelationRows = await tx
    .select({ hashtagId: PostContentHashtags.hashtagId })
    .from(PostContentHashtags)
    .where(eq(PostContentHashtags.postContentId, postContentId));
  const existingRelationIds = new Set(existingRelationRows.map(({ hashtagId }) => hashtagId));

  const existingNodeIds = collectDocumentHashtagIds(document);
  const existingNodes = await existingHashtagRowsById(tx, existingNodeIds);
  if (existingNodes.size !== existingNodeIds.length) {
    throw new Error('PostContent references an unknown Hashtag');
  }

  const candidates = findLocalPostContentHashtagCandidates(document);
  const normalizedCandidates = candidates.map((candidate) => ({
    ...candidate,
    ...normalizeHashtag(candidate.token),
  }));
  const namesAndDisplayNames = new Map<string, string>();
  for (const { displayName, name } of normalizedCandidates) {
    if (!namesAndDisplayNames.has(name)) {
      namesAndDisplayNames.set(name, displayName);
    }
  }

  let hashtags = await hashtagsByName(tx, [...namesAndDisplayNames.keys()]);
  const missingNames = [...namesAndDisplayNames.keys()].filter((name) => !hashtags.has(name));
  if (!dryRun && missingNames.length > 0) {
    await tx
      .insert(Hashtags)
      .values(
        missingNames
          .map((name) => ({ name, displayName: namesAndDisplayNames.get(name)! }))
          .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
      )
      .onConflictDoNothing({ target: Hashtags.name });
    hashtags = await hashtagsByName(tx, [...namesAndDisplayNames.keys()]);
  }

  const plannedHashtags = new Map(hashtags);
  if (dryRun) {
    for (const name of missingNames) {
      plannedHashtags.set(name, { id: crypto.randomUUID(), name });
    }
  }
  const finalDocument = applyCandidates(document, candidates, plannedHashtags);
  const documentChanged = candidates.length > 0 || !isDeepStrictEqual(document, finalDocument);
  const finalHashtagIds = collectDocumentHashtagIds(finalDocument);
  const relationsChanged = !isDeepStrictEqual(finalHashtagIds, [...existingRelationIds].sort());

  if (!documentChanged && !relationsChanged) {
    return 'unchanged';
  }
  if (dryRun) {
    return 'wouldUpdate';
  }

  const content = await tx
    .insert(PostContents)
    .values({
      document: finalDocument,
      postId,
    })
    .returning({ id: PostContents.id })
    .then(first);
  if (!content) {
    throw new Error('PostContent revision was not created');
  }

  const mentionRows = await tx
    .select({ profileId: PostMentions.profileId })
    .from(PostMentions)
    .where(eq(PostMentions.postContentId, postContentId));
  if (mentionRows.length > 0) {
    await tx
      .insert(PostMentions)
      .values(mentionRows.map(({ profileId }) => ({ postContentId: content.id, profileId })));
  }
  if (finalHashtagIds.length > 0) {
    await tx
      .insert(PostContentHashtags)
      .values(finalHashtagIds.map((hashtagId) => ({ hashtagId, postContentId: content.id })));
  }

  const updatedPost = await tx
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(
      and(
        eq(Posts.id, postId),
        eq(Posts.state, PostState.ACTIVE),
        eq(Posts.currentContentId, postContentId),
      ),
    )
    .returning({ id: Posts.id })
    .then(first);
  if (!updatedPost) {
    throw new LostPostContentRace();
  }

  return 'updated';
};

export const reprocessLocalPostContentActivity = async (
  input: ReprocessLocalPostContentInput,
): Promise<ReprocessLocalPostContentResult> => {
  try {
    const dryRun = input.dryRun ?? true;
    const status = await db.transaction(async (tx) => {
      if (dryRun) {
        await tx.execute(sql`SET TRANSACTION READ ONLY`);
      }
      return reprocessInTransaction(tx, {
        dryRun,
        postContentId: input.postContentId,
        postId: input.postId,
      });
    });
    return { status };
  } catch (error) {
    if (error instanceof LostPostContentRace) {
      return { status: 'skipped' };
    }
    throw error;
  }
};

export const loadLocalPostsForContentReprocessingActivity = async (
  input: LoadLocalPostsForContentReprocessingInput,
): Promise<{
  readonly maxPostId: string | null;
  readonly posts: readonly PostContentReprocessingTarget[];
}> => {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    const maxPostId =
      input.maxPostId === undefined
        ? await tx
            .select({ id: Posts.id })
            .from(Posts)
            .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
            .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
            .innerJoin(
              PostContents,
              and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
            )
            .where(and(eq(Posts.state, PostState.ACTIVE), eq(Instances.kind, InstanceKind.LOCAL)))
            .orderBy(desc(Posts.id))
            .limit(1)
            .then(first)
            .then((row) => row?.id ?? null)
        : input.maxPostId;

    if (maxPostId === null) {
      return { maxPostId, posts: [] };
    }

    const posts = await tx
      .select({ postContentId: Posts.currentContentId, postId: Posts.id })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .innerJoin(
        PostContents,
        and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
      )
      .where(
        and(
          eq(Posts.state, PostState.ACTIVE),
          eq(Instances.kind, InstanceKind.LOCAL),
          lte(Posts.id, maxPostId),
          input.afterPostId === undefined ? undefined : gt(Posts.id, input.afterPostId),
        ),
      )
      .orderBy(asc(Posts.id))
      .limit(input.limit);

    return {
      maxPostId,
      posts: posts.flatMap(({ postContentId, postId }) =>
        postContentId === null ? [] : [{ postContentId, postId }],
      ),
    };
  });
};
