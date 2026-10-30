import { Accounts, db, firstOrThrow } from '@kosmo/core/db';
import { eq, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { accountMetadataKeySchema, accountMetadataValueSchema } from '../validation';

builder.mutationField('setAccountMetadata', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('SetAccountMetadataPayload', {
      fields: (field) => ({
        account: field.field({ type: Account }),
        key: field.string(),
        value: field.string(),
      }),
    }),
    input: {
      key: t.input.string({ validate: accountMetadataKeySchema }),
      value: t.input.string({ validate: accountMetadataValueSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      const account = await db
        .update(Accounts)
        .set({
          metadata: sql`jsonb_set(${Accounts.metadata}, ARRAY[${input.key}]::text[], to_jsonb(${input.value}::text), true)`,
        })
        .where(eq(Accounts.id, ctx.session.accountId))
        .returning()
        .then(firstOrThrow);

      return { account, key: input.key, value: input.value };
    },
  }),
);
