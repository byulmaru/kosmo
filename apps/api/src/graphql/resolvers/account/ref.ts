import { Accounts, TableDiscriminator } from '@kosmo/core/db';
import { createObjectRef } from '@/graphql/utils';

export const Account = createObjectRef('Account', Accounts, TableDiscriminator.Accounts);

Account.implement({
  authScopes: (account, ctx) => {
    // 내 계정이면 체크 없이 true 아니면 체크 없이 false
    return account.id === ctx.session?.accountId;
  },

  fields: (t) => ({
    name: t.string({
      resolve: (account) => account.displayName,
    }),
  }),
});
