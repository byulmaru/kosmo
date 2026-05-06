import './query';

import { builder } from '@/graphql/builder';
import { registerGlobalId } from '@/graphql/id';

const Account = builder.drizzleNode('Accounts', {
  name: 'Account',
  id: {
    column: (account) => account.id,
  },

  authScopes: (account, ctx) => {
    // 내 계정이면 체크 없이 true 아니면 체크 없이 false
    return account.id === ctx.session?.accountId;
  },

  fields: (t) => ({
    name: t.exposeString('displayName'),
  }),
});

registerGlobalId(Account);

export default Account;
