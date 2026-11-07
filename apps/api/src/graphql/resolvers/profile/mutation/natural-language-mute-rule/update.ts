import { AccountProfileRole } from '@kosmo/core/enums';
import {
  isNaturalLanguageMuteConditionWithinLimit,
  naturalLanguageMuteConditionMaxLength,
} from '@kosmo/core/temporal/natural-language-mute';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { NaturalLanguageMuteRule } from '../../natural-language-mute-rule-ref';
import { Profile } from '../../ref';
import { executeNaturalLanguageMuteCommand } from './execute';

builder.mutationField('updateNaturalLanguageMuteRule', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('UpdateNaturalLanguageMuteRulePayload', {
      fields: (field) => ({ profile: field.field({ type: Profile }) }),
    }),
    input: {
      naturalLanguageMuteRuleId: t.input.globalID({ for: NaturalLanguageMuteRule, required: true }),
      condition: t.input.string({
        required: true,
        validate: z
          .string()
          .trim()
          .min(1)
          .refine(isNaturalLanguageMuteConditionWithinLimit, {
            message: `Condition must be at most ${naturalLanguageMuteConditionMaxLength} Unicode code points`,
          }),
      }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await executeNaturalLanguageMuteCommand({
        action: 'UPDATE',
        commandId: crypto.randomUUID(),
        ownerProfileId: ctx.session.profile.id,
        ruleId: input.naturalLanguageMuteRuleId.id,
        condition: input.condition,
      });
      if (!result.rule) {
        throw new Error('Natural Language Mute Rule update returned a delete result');
      }
      return { profile: ctx.session.profile.id };
    },
  }),
);
