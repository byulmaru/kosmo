import { AccountMetadata as AccountMetadataTable, db } from '@kosmo/core/db';
import { and, eq, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export type AccountMetadataRow = typeof AccountMetadataTable.$inferSelect;

export const AccountMetadata = createObjectRef<AccountMetadataRow>(
  'AccountMetadata',
  (ids, ctx) => {
    const accountId = ctx.session?.accountId;
    return accountId
      ? db
          .select()
          .from(AccountMetadataTable)
          .where(
            and(
              inArray(AccountMetadataTable.id, ids),
              eq(AccountMetadataTable.accountId, accountId),
            ),
          )
      : Promise.resolve([]);
  },
);

AccountMetadata.implement({
  fields: (t) => ({
    key: t.exposeString('key'),
    value: t.exposeString('value'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
