import { db, first, isUniqueViolation, PushInstallations, Sessions } from '@kosmo/core/db';
import { PushInstallationPlatform, SessionState } from '@kosmo/core/enums';
import { ConflictError, KosmoError, PermissionDeniedError } from '@kosmo/core/error';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';

builder.mutationField('registerPushInstallation', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('RegisterPushInstallationPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    input: {
      installationId: t.input.string({ validate: z.uuid() }),
      platform: t.input.field({ type: PushInstallationPlatform }),
      token: t.input.string({ validate: z.string().min(1).max(4096) }),
    },
    resolve: async (_, { input }, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      try {
        await db.transaction(async (tx) => {
          let existing = await tx
            .select()
            .from(PushInstallations)
            .where(eq(PushInstallations.installationId, input.installationId))
            .then(first);
          let duplicateMoved = false;

          const conflict = await tx
            .select({
              accountId: PushInstallations.accountId,
              id: PushInstallations.id,
              installationId: PushInstallations.installationId,
            })
            .from(PushInstallations)
            .where(eq(PushInstallations.token, input.token))
            .limit(1)
            .then(first);
          if (conflict && conflict.installationId !== input.installationId) {
            if (conflict.accountId !== ctx.session.accountId) {
              throw new ConflictError({ message: 'Push token belongs to another installation.' });
            }

            await tx.delete(PushInstallations).where(eq(PushInstallations.id, conflict.id));
            duplicateMoved = true;
          }

          if (!existing) {
            const inserted = await tx
              .insert(PushInstallations)
              .values({
                accountId: ctx.session.accountId,
                installationId: input.installationId,
                platform: input.platform,
                sessionId: ctx.session.id,
                token: input.token,
              })
              .onConflictDoNothing({ target: PushInstallations.installationId })
              .returning({ id: PushInstallations.id });

            if (inserted.length > 0) {
              return;
            }

            existing = await tx
              .select()
              .from(PushInstallations)
              .where(eq(PushInstallations.installationId, input.installationId))
              .then(first);
          }

          if (!existing) {
            throw new Error('Push installation disappeared during registration.');
          }

          if (existing.accountId !== ctx.session.accountId) {
            throw new PermissionDeniedError('Push installation belongs to another Account.');
          }

          const previousSessionState = await tx
            .select({ state: Sessions.state })
            .from(Sessions)
            .where(eq(Sessions.id, existing.sessionId))
            .limit(1)
            .then(first);
          const preserveRegistrationEpoch =
            !duplicateMoved && previousSessionState?.state === SessionState.ACTIVE;

          await tx
            .update(PushInstallations)
            .set({
              platform: input.platform,
              ...(preserveRegistrationEpoch ? {} : { registrationEpoch: sql`now()` }),
              sessionId: ctx.session.id,
              token: input.token,
              updatedAt: sql`now()`,
            })
            .where(eq(PushInstallations.id, existing.id));
        });
      } catch (error) {
        if (error instanceof KosmoError) {
          throw error;
        }

        if (isUniqueViolation(error)) {
          throw new ConflictError({ message: 'Push token belongs to another installation.' });
        }

        throw new Error('Push installation register failed.');
      }

      return { completed: true };
    },
  }),
);
