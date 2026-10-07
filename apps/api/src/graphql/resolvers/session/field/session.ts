import { AccountState } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { Profile } from '@/graphql/resolvers/profile';
import { Session } from '../ref';

builder.objectFields(Session, (t) => ({
  account: t.expose('accountId', { type: Account }),
  accountId: t.field({
    type: 'ID',
    resolve: (session) => encodeGlobalId('Account', session.accountId),
  }),
  operationalOnly: t.field({
    type: 'Boolean',
    resolve: (_, __, ctx) => ctx.operationalSession?.accountState === AccountState.SUSPENDED,
  }),
  selectedProfile: t.field({
    type: Profile,
    nullable: true,
    resolve: (_, __, ctx) => ctx.session?.profile?.id ?? null,
  }),
}));
