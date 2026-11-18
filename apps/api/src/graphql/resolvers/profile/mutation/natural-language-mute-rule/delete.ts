import { AccountProfileRole } from '@kosmo/core/enums';
import { builder } from '@/graphql/builder';
import { NaturalLanguageMuteRule } from '../../natural-language-mute-rule-ref';
import { Profile } from '../../ref';
import { executeNaturalLanguageMuteCommand } from './execute';

builder.mutationField('deleteNaturalLanguageMuteRule', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('DeleteNaturalLanguageMuteRulePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        naturalLanguageMuteRuleId: field.globalID({
          resolve: (payload) => ({
            type: NaturalLanguageMuteRule,
            id: (payload as { naturalLanguageMuteRuleId: string }).naturalLanguageMuteRuleId,
          }),
        }),
      }),
    }),
    input: {
      naturalLanguageMuteRuleId: t.input.globalID({ for: NaturalLanguageMuteRule, required: true }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await executeNaturalLanguageMuteCommand({
        action: 'DELETE',
        commandId: crypto.randomUUID(),
        ownerProfileId: ctx.session.profile.id,
        ruleId: input.naturalLanguageMuteRuleId.id,
      });
      if (!result.deletedRuleId) {
        throw new Error('Natural Language Mute Rule delete returned a rule result');
      }
      return {
        profile: ctx.session.profile.id,
        naturalLanguageMuteRuleId: result.deletedRuleId,
      };
    },
  }),
);
