import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account/ref';
import { Profile } from '@/graphql/resolvers/profile/ref';
import { Session } from '../ref';

builder.objectFields(Session, (t) => ({
  account: t.expose('accountId', { type: Account }),
  selectedProfile: t.field({
    type: Profile,
    nullable: true,
    resolve: (_, __, ctx) => ctx.session?.profile?.id ?? null,
  }),
}));
