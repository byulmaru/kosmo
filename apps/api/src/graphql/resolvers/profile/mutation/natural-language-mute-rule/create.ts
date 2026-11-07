import { AccountProfileRole } from '@kosmo/core/enums';
import {
  isNaturalLanguageMuteConditionWithinLimit,
  naturalLanguageMuteConditionMaxLength,
} from '@kosmo/core/temporal/natural-language-mute';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile } from '../../ref';
import { executeNaturalLanguageMuteCommand } from './execute';

builder.mutationField('createNaturalLanguageMuteRule', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('CreateNaturalLanguageMuteRulePayload', {
      fields: (field) => ({ profile: field.field({ type: Profile }) }),
    }),
    input: {
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
        action: 'CREATE',
        commandId: crypto.randomUUID(),
        ownerProfileId: ctx.session.profile.id,
        condition: input.condition,
      });
      if (!result.rule) {
        throw new Error('Natural Language Mute Rule create returned a delete result');
      }
      return { profile: ctx.session.profile.id };
    },
  }),
);
