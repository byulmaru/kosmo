import { db, NaturalLanguageMuteRules } from '@kosmo/core/db';
import { and, eq, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const NaturalLanguageMuteRule = createObjectRef('NaturalLanguageMuteRule', (ids, ctx) => {
  const ownerProfileId = ctx.session?.profile?.id;
  return ownerProfileId
    ? db
        .select()
        .from(NaturalLanguageMuteRules)
        .where(
          and(
            inArray(NaturalLanguageMuteRules.id, ids),
            eq(NaturalLanguageMuteRules.ownerProfileId, ownerProfileId),
          ),
        )
    : Promise.resolve([]);
});

NaturalLanguageMuteRule.implement({
  authScopes: (rule, ctx) => rule.ownerProfileId === ctx.session?.profile?.id,
  fields: (t) => ({
    condition: t.exposeString('condition'),
  }),
});
