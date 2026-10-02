import { AccountProfileRole, HashtagMuteDecision, HashtagMuteScope } from '@kosmo/core/enums';
import { builder } from '@/graphql/builder';
import { HashtagMuteRule } from '../mute-rule-ref';
import { Hashtag } from '../ref';
import { executeHashtagMuteCommand } from './execute';

builder.mutationField('createHashtagMuteRule', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('CreateHashtagMuteRulePayload', {
      fields: (field) => ({ hashtagMuteRule: field.field({ type: HashtagMuteRule }) }),
    }),
    input: {
      hashtagId: t.input.globalID({ for: Hashtag, required: true }),
      scopes: t.input.field({ type: [HashtagMuteScope], required: true }),
      decision: t.input.field({ type: HashtagMuteDecision, required: true }),
      expiresAt: t.input.field({ type: 'DateTime', required: false }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await executeHashtagMuteCommand({
        action: 'CREATE',
        commandId: crypto.randomUUID(),
        ownerProfileId: ctx.session.profile.id,
        targetHashtagId: input.hashtagId.id,
        scopes: input.scopes,
        decision: input.decision,
        expiresAt: input.expiresAt?.toString() ?? null,
      });
      if (!result.rule) {
        throw new Error('Hashtag Mute create returned a delete result');
      }
      return {
        hashtagMuteRule: {
          ...result.rule,
          expiresAt:
            result.rule.expiresAt === null ? null : Temporal.Instant.from(result.rule.expiresAt),
          createdAt: Temporal.Instant.from(result.rule.createdAt),
          updatedAt: Temporal.Instant.from(result.rule.updatedAt),
        },
      };
    },
  }),
);
