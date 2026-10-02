import { db, HashtagMuteRules } from '@kosmo/core/db';
import { HashtagMuteDecision, HashtagMuteScope } from '@kosmo/core/enums';
import { and, eq, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const HashtagMuteRule = createObjectRef('HashtagMuteRule', (ids, ctx) => {
  const ownerProfileId = ctx.session?.profile?.id;
  return ownerProfileId
    ? db
        .select()
        .from(HashtagMuteRules)
        .where(
          and(
            inArray(HashtagMuteRules.id, ids),
            eq(HashtagMuteRules.ownerProfileId, ownerProfileId),
          ),
        )
    : Promise.resolve([]);
});

HashtagMuteRule.implement({
  authScopes: (rule, ctx) => rule.ownerProfileId === ctx.session?.profile?.id,
  fields: (t) => ({
    scopes: t.field({ type: [HashtagMuteScope], resolve: (rule) => rule.scopes }),
    decision: t.field({ type: HashtagMuteDecision, resolve: (rule) => rule.decision }),
    expiresAt: t.field({ type: 'DateTime', nullable: true, resolve: (rule) => rule.expiresAt }),
    createdAt: t.field({ type: 'DateTime', resolve: (rule) => rule.createdAt }),
    updatedAt: t.field({ type: 'DateTime', resolve: (rule) => rule.updatedAt }),
    isActive: t.boolean({
      resolve: (rule) =>
        rule.expiresAt === null ||
        Temporal.Instant.compare(rule.expiresAt, Temporal.Now.instant()) > 0,
    }),
    appliesTo: t.boolean({
      args: { scope: t.arg({ type: HashtagMuteScope, required: true }) },
      resolve: (rule, { scope }) =>
        rule.scopes.includes(scope) &&
        (rule.expiresAt === null ||
          Temporal.Instant.compare(rule.expiresAt, Temporal.Now.instant()) > 0),
    }),
  }),
});
