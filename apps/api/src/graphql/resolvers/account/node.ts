import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/objects';

builder.node(Account, {
  id: { resolve: (account) => account.id },

  loadWithoutCache: async (id, ctx) => {
    const account = await Account.getDataloader(ctx).load(id);

    if (account && account.id === ctx.session?.accountId) {
      return account;
    }

    return null;
  },

  fields: (t) => ({
    name: t.exposeString('name'),
    languages: t.exposeStringList('languages'),
  }),
});

builder.queryFields((t) => ({
  me: t.field({
    type: Account,
    nullable: true,
    resolve: (_, __, ctx) => ctx.session?.accountId,
  }),
}));
