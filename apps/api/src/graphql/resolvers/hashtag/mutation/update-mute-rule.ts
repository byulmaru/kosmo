import { AccountProfileRole, HashtagMuteDecision, HashtagMuteScope } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { builder } from '@/graphql/builder';
import { HashtagMuteRule } from '../mute-rule-ref';
import { executeHashtagMuteCommand } from './execute';

builder.mutationField('updateHashtagMuteRule', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('UpdateHashtagMuteRulePayload', {
      fields: (field) => ({ hashtagMuteRule: field.field({ type: HashtagMuteRule }) }),
    }),
    input: {
      id: t.input.globalID({ for: HashtagMuteRule, required: true }),
      scopes: t.input.field({ type: [HashtagMuteScope], required: false }),
      decision: t.input.field({ type: HashtagMuteDecision, required: false }),
      expiresAt: t.input.field({ type: 'DateTime', required: false }),
    },
    resolve: async (_, { input }, ctx) => {
      if (input.scopes === null || input.decision === null) {
        throw new ValidationError('Scope and Decision cannot be null');
      }
      const result = await executeHashtagMuteCommand({
        action: 'UPDATE',
        commandId: crypto.randomUUID(),
        ownerProfileId: ctx.session.profile.id,
        ruleId: input.id.id,
        ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
        ...(input.decision === undefined ? {} : { decision: input.decision }),
        ...(input.expiresAt === undefined
          ? {}
          : { expiresAt: input.expiresAt?.toString() ?? null }),
      });
      if (!result.rule) {
        throw new Error('Hashtag Mute update returned a delete result');
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
