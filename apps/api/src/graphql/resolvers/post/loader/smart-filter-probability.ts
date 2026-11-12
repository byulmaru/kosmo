import { db, Posts } from '@kosmo/core/db';
import { getNaturalLanguageMuteDecision } from '@kosmo/core/home-timeline/natural-language-mute-cache';
import { inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type SmartFilterProbabilityRow = {
  readonly postId: string;
  readonly probability: number;
};

export const smartFilterProbabilityLoader = (ctx: UserContext) =>
  ctx.loader<string, SmartFilterProbabilityRow, string, true>({
    name: 'post.smartFilterProbability',
    nullable: true,
    load: async (postIds) => {
      const viewerProfileId = ctx.session?.profile?.id;
      if (!viewerProfileId) {
        return [];
      }

      const subjectPosts = await db
        .select({
          id: Posts.id,
          profileId: Posts.profileId,
          currentContentId: Posts.currentContentId,
        })
        .from(Posts)
        .where(inArray(Posts.id, [...new Set(postIds)]));
      const subjectPostIds = subjectPosts
        .filter(
          ({ profileId, currentContentId }) =>
            currentContentId !== null && profileId !== viewerProfileId,
        )
        .map(({ id }) => id);

      const decisions = await Promise.all(
        subjectPostIds.map(async (postId) => {
          const decision = await getNaturalLanguageMuteDecision(viewerProfileId, postId);
          return decision === null ? null : { postId, probability: decision.probability };
        }),
      );

      return decisions.filter(
        (decision): decision is SmartFilterProbabilityRow => decision !== null,
      );
    },
    key: (row) => row?.postId ?? null,
  });
