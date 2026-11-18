import { builder } from '@/graphql/builder';
import { Media } from '../ref';

builder.objectField(Media, 'aiProhibitFilterApplied', (t) =>
  t.boolean({
    nullable: true,
    resolve: (media, _, ctx) =>
      media.accountId !== null && media.accountId === ctx.session?.accountId
        ? media.aiProhibitFilterApplied
        : null,
  }),
);
