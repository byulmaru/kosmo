import { Accounts, db } from '@kosmo/core/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const Account = createObjectRef('Account', (ids, ctx) =>
  db
    .select()
    .from(Accounts)
    .where(
      and(
        inArray(Accounts.id, ids),
        ctx.session ? eq(Accounts.id, ctx.session.accountId) : sql`1=0`,
      ),
    ),
);

Account.implement({
  fields: (t) => ({
    name: t.string({
      resolve: (account) => account.displayName,
    }),
  }),
});
