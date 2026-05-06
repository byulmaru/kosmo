import { builder } from '@/graphql/builder';

builder.queryFields((t) => ({
  test: t.field({
    type: 'String',
    resolve: () => 'test',
  }),

  whoami: t.field({
    type: 'String',
    resolve: (_, __, ctx) => ctx.session?.accountId,
  }),
}));
