import { db, first, PushInstallations } from '@kosmo/core/db';
import { PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { eq } from 'drizzle-orm';
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

      await db.transaction(async (tx) => {
        const existing = await tx
          .select({
            accountId: PushInstallations.accountId,
            sessionId: PushInstallations.sessionId,
          })
          .from(PushInstallations)
          .where(eq(PushInstallations.id, input.id.id))
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

        await tx.delete(PushInstallations).where(eq(PushInstallations.id, input.id.id));
      });

      return { completed: true };
    },
  }),
);
