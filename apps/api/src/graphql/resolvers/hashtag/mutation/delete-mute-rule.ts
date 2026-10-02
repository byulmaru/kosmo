import { AccountProfileRole } from '@kosmo/core/enums';
import { builder } from '@/graphql/builder';
import { HashtagMuteRule } from '../mute-rule-ref';
import { executeHashtagMuteCommand } from './execute';

builder.mutationField('deleteHashtagMuteRule', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('DeleteHashtagMuteRulePayload', {
      fields: (field) => ({
        hashtagMuteRuleId: field.globalID({
          resolve: (payload) => ({
            type: HashtagMuteRule,
            id: (payload as { hashtagMuteRuleId: string }).hashtagMuteRuleId,
          }),
        }),
      }),
    }),
    input: { id: t.input.globalID({ for: HashtagMuteRule, required: true }) },
    resolve: async (_, { input }, ctx) => {
      const result = await executeHashtagMuteCommand({
        action: 'DELETE',
        commandId: crypto.randomUUID(),
        ownerProfileId: ctx.session.profile.id,
        ruleId: input.id.id,
      });
      if (!result.deletedRuleId) {
        throw new Error('Hashtag Mute delete returned a rule result');
      }
      return { hashtagMuteRuleId: result.deletedRuleId };
    },
  }),
);
