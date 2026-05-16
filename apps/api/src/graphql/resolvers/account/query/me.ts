import { builder } from '@/graphql/builder';
import { Account } from '../ref';

builder.queryField('me', (t) =>
  t.withAuth({ login: true }).field({
    type: Account,
    nullable: true,
    resolve: (_, __, ctx) => ctx.session.accountId,
    unauthorizedResolver: () => null,
  }),
);
