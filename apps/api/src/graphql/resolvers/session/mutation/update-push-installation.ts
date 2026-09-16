import { db, isUniqueViolation, PushInstallations } from '@kosmo/core/db';
import { PushInstallationPlatform } from '@kosmo/core/enums';
import {
  ConflictError,
  KosmoError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';

builder.mutationField('updatePushInstallation', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('UpdatePushInstallationPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    input: {
      id: t.input.globalID(),
      platform: t.input.field({ type: PushInstallationPlatform }),
      token: t.input.string({ validate: z.string().min(1).max(4096) }),
    },
    resolve: async (_, { input }, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      if (input.id.typename !== 'PushInstallation') {
        throw new ValidationError('Invalid Push Installation ID', { field: 'id' });
      }

      try {
        const updated = await db
          .update(PushInstallations)
          .set({
            platform: input.platform,
            token: input.token,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(PushInstallations.id, input.id.id),
              eq(PushInstallations.accountId, ctx.session.accountId),
            ),
          )
          .returning({ id: PushInstallations.id });

        if (updated.length === 0) {
          throw new PermissionDeniedError('Push installation is unavailable.');
        }
      } catch (error) {
        if (error instanceof KosmoError) {
          throw error;
        }

        if (isUniqueViolation(error)) {
          throw new ConflictError({ message: 'Push token belongs to another installation.' });
        }

        throw new Error('Push installation update failed.');
      }

      return { completed: true };
    },
  }),
);
