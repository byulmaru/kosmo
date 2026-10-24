import { AccountCoachmarks, db } from '@kosmo/core/db';
import { CoachmarkGuide } from '@kosmo/core/enums';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';

builder.mutationField('recordCoachmarkShown', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('RecordCoachmarkShownPayload', {
      fields: (field) => ({
        account: field.field({ type: Account }),
      }),
    }),
    input: {
      guide: t.input.field({ type: CoachmarkGuide }),
    },
    resolve: async (_, { input }, ctx) => {
      await db
        .insert(AccountCoachmarks)
        .values({ accountId: ctx.session.accountId, guide: input.guide })
        .onConflictDoNothing({
          target: [AccountCoachmarks.accountId, AccountCoachmarks.guide],
        });

      return { account: ctx.session.accountId };
    },
  }),
);
