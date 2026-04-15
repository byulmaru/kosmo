import { builder } from '@/graphql/builder';

builder.queryFields((t) => ({
  test: t.field({
    type: 'String',
    resolve: () => 'test',
  }),
}));
