import { db } from '@kosmo/core/db';
import { deleteAccount } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { getAccountBearerToken } from '../bearer-token';

builder.mutationField('deleteAccount', (t) =>
  t.field({
    type: builder.simpleObject('DeleteAccountPayload', {
      fields: (field) => ({
        activeProfileCount: field.int(),
        completed: field.boolean(),
      }),
    }),
    resolve: async (_, __, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      const result = await deleteAccount(
        { token: getAccountBearerToken(ctx.c.req.header('Authorization')) },
        db,
      );

      return {
        activeProfileCount: result.activeProfileCount,
        completed: result.status === 'DELETED' || result.status === 'ALREADY_DELETED',
      };
    },
  }),
);
