import { db } from '@kosmo/core/db';
import { getAccountDeletionEligibility } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { getAccountBearerToken } from '../bearer-token';

const AccountDeletionEligibility = builder.simpleObject('AccountDeletionEligibility', {
  fields: (field) => ({
    activeProfileCount: field.int(),
    canDelete: field.boolean(),
  }),
});

builder.queryField('accountDeletionEligibility', (t) =>
  t.field({
    type: AccountDeletionEligibility,
    resolve: async (_, __, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      return getAccountDeletionEligibility(
        { token: getAccountBearerToken(ctx.c.req.header('Authorization')) },
        db,
      );
    },
  }),
);
