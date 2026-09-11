import { unregisterPushInstallation } from '@kosmo/core/services';
import { z } from 'zod';
import { builder } from '@/graphql/builder';

builder.mutationField('unregisterPushInstallation', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('UnregisterPushInstallationPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    input: {
      installationId: t.input.string({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      await unregisterPushInstallation({
        accountId: ctx.session.accountId,
        installationId: input.installationId,
        sessionId: ctx.session.id,
      });

      return { completed: true };
    },
  }),
);
