import { MIMEType } from 'node:util';
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  db,
  Instances,
  Media,
  NaturalLanguageMuteRules,
  PostContents,
  Posts,
  Profiles,
} from '../db';
import { MediaState, PostQuoteConsentStatus } from '../enums';
import { canonicalizePostContentDocument, postContentDocumentToText } from '../post-content/server';
import { homePostListWhere } from '../visibility/home-post-list';
import { visiblePostWhere } from '../visibility/post';
import { visibleProfileWhere } from '../visibility/profile';
import { evaluateNaturalLanguageMute } from './decision';
import {
  cacheNaturalLanguageMuteDecision,
  getNaturalLanguageMuteDecision,
} from './natural-language-mute-cache';
import type { NaturalLanguageMuteDecision, NaturalLanguageMutePost } from './decision';

type PostRow = typeof Posts.$inferSelect;
type NaturalLanguageMutePostRow = Pick<
  PostRow,
  'id' | 'currentContentId' | 'quoteConsentStatus' | 'repostSourceId'
>;
type MuteMedia = Pick<typeof Media.$inferSelect, 'id' | 'mediaType' | 'state' | 'url'>;

export type HomeTimelineMuteCandidate = {
  readonly profileId: string;
  readonly post: NaturalLanguageMutePostRow;
};

type CandidateProjection = {
  readonly currentContentId: string | null;
  readonly outerDocument: typeof PostContents.$inferSelect.document | null;
  readonly sourceAccessible: boolean;
  readonly sourceDocument: typeof PostContents.$inferSelect.document | null;
};

const SourcePosts = alias(Posts, 'home_timeline_natural_mute_source');
const SourceProfiles = alias(Profiles, 'home_timeline_natural_mute_source_profile');
const SourceInstances = alias(Instances, 'home_timeline_natural_mute_source_instance');
const SourceContents = alias(PostContents, 'home_timeline_natural_mute_source_content');

const projectDocument = (
  value: unknown,
  mediaById: ReadonlyMap<string, MuteMedia>,
): NaturalLanguageMutePost | null => {
  try {
    const document = canonicalizePostContentDocument(value);
    const imageUrls: string[] = [];
    for (const block of document.body.content) {
      if (block.type !== 'media') {
        continue;
      }
      const media = mediaById.get(block.attrs.mediaId);
      if (!media || media.mediaType === null) {
        return null;
      }
      const isImage = new MIMEType(media.mediaType).type === 'image';
      if (!isImage) {
        continue;
      }
      if (media.state !== MediaState.READY || !media.url) {
        return null;
      }
      imageUrls.push(media.url);
    }
    return {
      bodyText: postContentDocumentToText(document),
      contentWarning: document.summary,
      imageUrls,
    };
  } catch {
    return null;
  }
};

const mediaIdsFromDocument = (value: unknown): string[] | null => {
  try {
    return canonicalizePostContentDocument(value).body.content.flatMap((block) =>
      block.type === 'media' ? [block.attrs.mediaId] : [],
    );
  } catch {
    return null;
  }
};

const projectCandidateInputs = async (
  profileId: string,
  candidates: readonly HomeTimelineMuteCandidate[],
): Promise<Map<string, CandidateProjection | null>> => {
  const projections = new Map<string, CandidateProjection | null>();
  if (candidates.length === 0) {
    return projections;
  }

  const postIds = candidates.map(({ post }) => post.id);
  const sourceVisible = visiblePostWhere({
    post: SourcePosts,
    profileVisible: sql<boolean>`${visibleProfileWhere({
      profile: SourceProfiles,
      instance: SourceInstances,
    })}`,
    viewerProfileId: profileId,
    db,
  });
  const quoteAllowsSource = or(
    isNull(Posts.currentContentId),
    isNull(Posts.quoteConsentStatus),
    eq(Posts.quoteConsentStatus, PostQuoteConsentStatus.APPROVED),
  );
  const sourceAccessible = sql<boolean>`${and(
    isNotNull(SourcePosts.id),
    isNotNull(SourcePosts.currentContentId),
    quoteAllowsSource,
    sourceVisible,
  )!}`;

  const rows = await db
    .select({
      postId: Posts.id,
      currentContentId: Posts.currentContentId,
      outerDocument: PostContents.document,
      sourceAccessible,
      sourceDocument: SourceContents.document,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(
      PostContents,
      and(eq(PostContents.id, Posts.currentContentId), eq(PostContents.postId, Posts.id)),
    )
    .leftJoin(SourcePosts, eq(SourcePosts.id, Posts.repostSourceId))
    .leftJoin(SourceProfiles, eq(SourceProfiles.id, SourcePosts.profileId))
    .leftJoin(SourceInstances, eq(SourceInstances.id, SourceProfiles.instanceId))
    .leftJoin(
      SourceContents,
      and(
        eq(SourceContents.id, SourcePosts.currentContentId),
        eq(SourceContents.postId, SourcePosts.id),
        sourceAccessible,
      ),
    )
    .where(and(inArray(Posts.id, postIds), homePostListWhere({ db, viewerProfileId: profileId })));
  const rowsById = new Map(rows.map((row) => [row.postId, row]));
  for (const candidate of candidates) {
    const row = rowsById.get(candidate.post.id);
    if (!row) {
      continue;
    }
    if (row.currentContentId !== candidate.post.currentContentId) {
      projections.set(candidate.post.id, null);
      continue;
    }
    projections.set(candidate.post.id, {
      currentContentId: row.currentContentId,
      outerDocument: row.outerDocument,
      sourceAccessible: Boolean(row.sourceAccessible),
      sourceDocument: row.sourceDocument,
    });
  }

  return projections;
};

const toCandidateInput = (
  projection: CandidateProjection,
  mediaById: ReadonlyMap<string, MuteMedia>,
): { readonly post: NaturalLanguageMutePost; readonly source?: NaturalLanguageMutePost } | null => {
  if (projection.currentContentId !== null && projection.outerDocument === null) {
    return null;
  }

  const post =
    projection.outerDocument === null
      ? { bodyText: '', contentWarning: null, imageUrls: [] }
      : projectDocument(projection.outerDocument, mediaById);
  if (post === null) {
    return null;
  }

  if (!projection.sourceAccessible) {
    return { post };
  }
  if (projection.sourceDocument === null) {
    return null;
  }

  const source = projectDocument(projection.sourceDocument, mediaById);
  return source === null ? null : { post, source };
};

export const filterHomeTimelineMuteCandidates = async <T extends HomeTimelineMuteCandidate>(
  candidates: readonly T[],
): Promise<T[]> => {
  if (candidates.length === 0) {
    return [];
  }

  const profileIds = [...new Set(candidates.map(({ profileId }) => profileId))];
  const ruleRows = await db
    .select({
      ownerProfileId: NaturalLanguageMuteRules.ownerProfileId,
      condition: NaturalLanguageMuteRules.condition,
    })
    .from(NaturalLanguageMuteRules)
    .where(inArray(NaturalLanguageMuteRules.ownerProfileId, profileIds));
  const conditions = new Map<string, string>();
  for (const rule of ruleRows) {
    if (!conditions.has(rule.ownerProfileId)) {
      conditions.set(rule.ownerProfileId, rule.condition);
    }
  }

  const included = new Set<string>();
  const pending: HomeTimelineMuteCandidate[] = [];
  const candidateKey = ({ profileId, post }: HomeTimelineMuteCandidate) =>
    `${profileId}:${post.id}`;

  const cacheDecisions = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      decision: conditions.has(candidate.profileId)
        ? await getNaturalLanguageMuteDecision(candidate.profileId, candidate.post.id)
        : ('no-rule' as const),
    })),
  );
  for (const { candidate, decision } of cacheDecisions) {
    const key = candidateKey(candidate);
    if (decision === 'no-rule' || decision?.decision === 'include') {
      included.add(key);
    } else if (decision === null) {
      pending.push(candidate);
    }
  }

  const candidatesByProfile = new Map<string, HomeTimelineMuteCandidate[]>();
  for (const candidate of pending) {
    const group = candidatesByProfile.get(candidate.profileId) ?? [];
    group.push(candidate);
    candidatesByProfile.set(candidate.profileId, group);
  }

  await Promise.all(
    [...candidatesByProfile].map(async ([profileId, profileCandidates]) => {
      const projections = await projectCandidateInputs(profileId, profileCandidates);
      const referencedMediaIds = new Set<string>();
      const invalidInputs = new Set<string>();
      for (const candidate of profileCandidates) {
        const projection = projections.get(candidate.post.id);
        if (projection === undefined || projection === null) {
          continue;
        }
        for (const document of [
          projection.outerDocument,
          projection.sourceAccessible ? projection.sourceDocument : null,
        ]) {
          if (document === null) {
            continue;
          }
          const mediaIds = mediaIdsFromDocument(document);
          if (mediaIds === null) {
            invalidInputs.add(candidate.post.id);
            continue;
          }
          for (const mediaId of mediaIds) {
            referencedMediaIds.add(mediaId);
          }
        }
      }
      const mediaRows =
        referencedMediaIds.size === 0
          ? []
          : await db
              .select({
                id: Media.id,
                state: Media.state,
                url: Media.url,
                mediaType: Media.mediaType,
              })
              .from(Media)
              .where(inArray(Media.id, [...referencedMediaIds]));
      const mediaById = new Map(mediaRows.map((media) => [media.id, media]));

      await Promise.all(
        profileCandidates.map(async (candidate) => {
          const key = candidateKey(candidate);
          const projection = projections.get(candidate.post.id);
          if (projection === undefined) {
            return;
          }
          if (projection === null) {
            included.add(key);
            return;
          }
          if (invalidInputs.has(candidate.post.id)) {
            included.add(key);
            return;
          }

          const input = toCandidateInput(projection, mediaById);
          if (input === null) {
            included.add(key);
            return;
          }

          let decision: NaturalLanguageMuteDecision | null = null;
          try {
            decision = await evaluateNaturalLanguageMute({
              condition: conditions.get(candidate.profileId)!,
              post: input.post,
              ...(input.source === undefined ? {} : { source: input.source }),
            });
          } catch {
            decision = null;
          }

          if (decision === null) {
            included.add(key);
            return;
          }

          const winningDecision = await cacheNaturalLanguageMuteDecision(
            candidate.profileId,
            candidate.post.id,
            decision,
          );
          if (winningDecision.decision === 'include') {
            included.add(key);
          }
        }),
      );
    }),
  );

  return candidates.filter((candidate) => included.has(candidateKey(candidate)));
};

export const filterHomeTimelinePosts = async ({
  profileId,
  posts,
}: {
  readonly profileId: string;
  readonly posts: readonly PostRow[];
}): Promise<PostRow[]> =>
  (await filterHomeTimelineMuteCandidates(posts.map((post) => ({ profileId, post })))).map(
    ({ post }) => post,
  );
