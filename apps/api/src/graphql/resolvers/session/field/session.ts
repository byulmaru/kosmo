import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { Profile } from '@/graphql/resolvers/profile';
import { Session } from '../ref';

builder.objectFields(Session, (t) => ({
  account: t.expose('accountId', { type: Account }),
  selectedProfile: t.field({
    type: Profile,
    nullable: true,
    resolve: (_, __, ctx) => ctx.session?.profileId ?? null,
  }),
}));
