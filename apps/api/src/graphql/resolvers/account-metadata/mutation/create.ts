import { AccountMetadata, db } from '@kosmo/core/db';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { accountMetadataKeySchema, accountMetadataValueSchema } from '../validation';

builder.mutationField('createAccountMetadata', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('CreateAccountMetadataPayload', {
      fields: (field) => ({
        account: field.field({ type: Account }),
      }),
    }),
    input: {
      key: t.input.string({ validate: accountMetadataKeySchema }),
      value: t.input.string({ validate: accountMetadataValueSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      await db
        .insert(AccountMetadata)
        .values({
          accountId: ctx.session.accountId,
          key: input.key,
          value: input.value,
        })
        .onConflictDoNothing({
          target: [AccountMetadata.accountId, AccountMetadata.key],
        });

      return { account: ctx.session.accountId };
    },
  }),
);
