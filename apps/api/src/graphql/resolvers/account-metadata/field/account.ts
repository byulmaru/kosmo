import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { AccountMetadata } from '../ref';
import { accountMetadataKeysSchema } from '../validation';

builder.objectField(Account, 'metadata', (t) =>
  t.field({
    type: [AccountMetadata],
    args: {
      keys: t.arg.stringList({ validate: accountMetadataKeysSchema }),
    },
    resolve: (account, { keys }) =>
      [...new Set(keys)]
        .filter((key) => Object.hasOwn(account.metadata, key))
        .sort()
        .map((key): AccountMetadata => ({ key, value: account.metadata[key]! })),
  }),
);
