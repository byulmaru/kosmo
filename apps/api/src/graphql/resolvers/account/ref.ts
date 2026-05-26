import { Accounts, db, TableDiscriminator } from '@kosmo/core/db';
import { and, eq, sql } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const Account = createObjectRef('Account', TableDiscriminator.Accounts, (ids, ctx) =>
  db
    .select()
    .from(Accounts)
    .where(and(ctx.session ? eq(Accounts.id, ctx.session.accountId) : sql`1=0`)),
);

Account.implement({
  fields: (t) => ({
    name: t.string({
      resolve: (account) => account.displayName,
    }),
  }),
});
