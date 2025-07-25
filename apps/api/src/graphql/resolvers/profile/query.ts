import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.queryFields((t) => ({
  usingProfile: t.field({
    type: Profile,
    nullable: true,
    resolve: (_, __, ctx) => {
      return ctx.session?.profileId ?? null;
    },
  }),
}));
