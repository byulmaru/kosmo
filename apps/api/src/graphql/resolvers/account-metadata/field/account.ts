import { AccountMetadata as AccountMetadataTable, db } from '@kosmo/core/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
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
      db
        .select()
        .from(AccountMetadataTable)
        .where(
          and(
            eq(AccountMetadataTable.accountId, account.id),
            inArray(AccountMetadataTable.key, keys),
          ),
        )
        .orderBy(asc(AccountMetadataTable.key)),
  }),
);
