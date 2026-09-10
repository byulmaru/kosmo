import { db } from '@kosmo/core/db';
import { PushInstallationPlatform } from '@kosmo/core/enums';
import { registerPushInstallation } from '@kosmo/core/services';
import { z } from 'zod';
import { builder } from '@/graphql/builder';

const installationIdSchema = z.uuid();
const registrationTokenSchema = z.string().min(1).max(4096);

builder.mutationField('registerPushInstallation', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('RegisterPushInstallationPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    input: {
      installationId: t.input.string({ validate: installationIdSchema }),
      platform: t.input.field({ type: PushInstallationPlatform }),
      token: t.input.string({ validate: registrationTokenSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      await registerPushInstallation(
        {
          accountId: ctx.session.accountId,
          installationId: input.installationId,
          platform: input.platform,
          sessionId: ctx.session.id,
          token: input.token,
        },
        db,
      );

      return { completed: true };
    },
  }),
);
