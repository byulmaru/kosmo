import { db } from '@kosmo/core/db';
import { deleteAccount } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';

builder.mutationField('deleteAccount', (t) =>
  t.withAuth({ login: true }).field({
    type: builder.simpleObject('DeleteAccountPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    resolve: async (_, __, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      const result = await deleteAccount({ accountId: ctx.session.accountId }, db);

      return {
        completed: result.status === 'DELETED',
      };
    },
  }),
);
