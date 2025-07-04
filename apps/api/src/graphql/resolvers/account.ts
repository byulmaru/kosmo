import { builder } from '../builder';
import { Account } from '../objects';

Account.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
  }),
});

builder.queryFields((t) => ({
  me: t.field({
    type: Account,
    nullable: true,
    resolve: (_, __, ctx) => ctx.session?.accountId,
  }),
}));
