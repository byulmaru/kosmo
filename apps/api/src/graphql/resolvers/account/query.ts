import { db } from '@kosmo/core/db';
import { builder } from '@/graphql/builder';
import Account from '.';

builder.queryFields((t) => ({
  me: t.withAuth({ login: true }).drizzleField({
    type: Account,
    nullable: true,
    resolve: (query, _, __, ctx) =>
      db.query.Accounts.findFirst(
        query({
          where: {
            id: ctx.session.accountId,
          },
        }),
      ),
    unauthorizedResolver: () => null,
  }),
}));
