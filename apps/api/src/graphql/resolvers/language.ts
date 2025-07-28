import { builder } from '../builder';

builder.queryField('languages', (t) =>
  t.stringList({
    resolve: (_, __, ctx) => ctx.languages,
  }),
);
