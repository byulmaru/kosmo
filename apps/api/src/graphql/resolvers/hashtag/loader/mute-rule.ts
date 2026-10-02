import { db, HashtagMuteRules } from '@kosmo/core/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import type { UserContext } from '@/context';

export const viewerHashtagMuteRuleLoader = (ctx: UserContext) =>
  ctx.loader<string, InferSelectModel<typeof HashtagMuteRules>, string, true>({
    name: 'hashtagMuteRule.viewer',
    nullable: true,
    load: (ids) =>
      ctx.session?.profile?.id
        ? db
            .select()
            .from(HashtagMuteRules)
            .where(
              and(
                inArray(HashtagMuteRules.targetHashtagId, ids),
                eq(HashtagMuteRules.ownerProfileId, ctx.session.profile.id),
              ),
            )
        : Promise.resolve([]),
    key: (rule) => rule?.targetHashtagId ?? null,
  });
