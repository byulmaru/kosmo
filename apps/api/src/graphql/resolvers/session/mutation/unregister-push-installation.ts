import { db, PushInstallations } from '@kosmo/core/db';
import { ValidationError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';

builder.mutationField('unregisterPushInstallation', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('UnregisterPushInstallationPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    input: {
      id: t.input.globalID(),
    },
    resolve: async (_, { input }, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      if (input.id.typename !== 'PushInstallation') {
        throw new ValidationError('Invalid Push Installation ID', { field: 'id' });
      }

      await db
        .delete(PushInstallations)
        .where(
          and(
            eq(PushInstallations.id, input.id.id),
            eq(PushInstallations.accountId, ctx.session.accountId),
          ),
        );

      return { completed: true };
    },
  }),
);
