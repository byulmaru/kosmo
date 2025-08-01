import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.queryField('usingProfile', (t) =>
  t.field({
    type: Profile,
    nullable: true,
    resolve: (_, __, ctx) => {
      return ctx.session?.profileId ?? null;
    },
  }),
);
