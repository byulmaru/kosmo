import { db, first, PushInstallations } from '@kosmo/core/db';
import { PermissionDeniedError } from '@kosmo/core/error';
import { eq } from 'drizzle-orm';
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

      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(PushInstallations)
          .where(eq(PushInstallations.installationId, input.installationId))
          .then(first);

        if (!existing) {
          return;
        }

        if (existing.accountId !== ctx.session.accountId) {
          throw new PermissionDeniedError('Push installation belongs to another Account.');
        }

        if (existing.sessionId !== ctx.session.id) {
          throw new PermissionDeniedError('Push installation is bound to another Session.');
        }

        await tx.delete(PushInstallations).where(eq(PushInstallations.id, existing.id));
      });

      return { completed: true };
    },
  }),
);
