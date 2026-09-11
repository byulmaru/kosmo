import { db, first, firstOrThrow, isUniqueViolation, PushInstallations } from '@kosmo/core/db';
import { PushInstallationPlatform } from '@kosmo/core/enums';
import { ConflictError, KosmoError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';

builder.mutationField('registerPushInstallation', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('RegisterPushInstallationPayload', {
      fields: (field) => ({
        id: field.globalID({
          resolve: (payload) => encodeGlobalId('PushInstallation', (payload as { id: string }).id),
        }),
      }),
    }),
    input: {
      platform: t.input.field({ type: PushInstallationPlatform }),
      token: t.input.string({ validate: z.string().min(1).max(4096) }),
    },
    resolve: async (_, { input }, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      try {
        const installationId = await db.transaction(async (tx) => {
          const conflict = await tx
            .select({
              accountId: PushInstallations.accountId,
              id: PushInstallations.id,
            })
            .from(PushInstallations)
            .where(eq(PushInstallations.token, input.token))
            .limit(1)
            .then(first);

          if (conflict) {
            if (conflict.accountId !== ctx.session.accountId) {
              throw new ConflictError({ message: 'Push token belongs to another installation.' });
            }

            await tx
              .delete(PushInstallations)
              .where(
                and(
                  eq(PushInstallations.id, conflict.id),
                  eq(PushInstallations.token, input.token),
                ),
              );
          }

          const inserted = await tx
            .insert(PushInstallations)
            .values({
              accountId: ctx.session.accountId,
              platform: input.platform,
              sessionId: ctx.session.id,
              token: input.token,
            })
            .returning({ id: PushInstallations.id })
            .then(firstOrThrow);
          return inserted.id;
        });

        return { id: installationId };
      } catch (error) {
        if (error instanceof KosmoError) {
          throw error;
        }

        if (isUniqueViolation(error)) {
          throw new ConflictError({ message: 'Push token belongs to another installation.' });
        }

        throw new Error('Push installation register failed.');
      }
    },
  }),
);
