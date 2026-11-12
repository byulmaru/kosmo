import { db, first, NaturalLanguageMuteRules } from '@kosmo/core/db';
import { getNaturalLanguageMuteDecision } from '@kosmo/core/home-timeline/natural-language-mute-cache';
import { eq } from 'drizzle-orm';
import type { Posts } from '@kosmo/core/db';

type PostRow = typeof Posts.$inferSelect;

export const filterNaturalLanguageMuteExcludes = async <Edge extends { node: PostRow }>(
  edges: readonly Edge[],
  profileId: string | undefined,
): Promise<readonly Edge[]> => {
  if (!profileId || edges.length === 0) {
    return edges;
  }

  const activeRule = await db
    .select({ id: NaturalLanguageMuteRules.id })
    .from(NaturalLanguageMuteRules)
    .where(eq(NaturalLanguageMuteRules.ownerProfileId, profileId))
    .limit(1)
    .then(first);
  if (!activeRule) {
    return edges;
  }

  const excludedPostIds = new Set<string>();
  await Promise.all(
    edges.map(async ({ node }) => {
      if (node.profileId === profileId) {
        return;
      }

      const decision = await getNaturalLanguageMuteDecision(profileId, node.id);
      if (decision?.decision === 'exclude') {
        excludedPostIds.add(node.id);
      }
    }),
  );

  return excludedPostIds.size === 0
    ? edges
    : edges.filter(({ node }) => !excludedPostIds.has(node.id));
};
