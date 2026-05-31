import { sessionName } from '@kosmo/core';
import { pg } from '@kosmo/core/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
  const sessionToken = cookies.get(sessionName);
  if (!sessionToken) {
    return { accountName: null };
  }

  const [account] = await pg<{ name: string }[]>`
    select account.display_name as name
    from session
    inner join account on session.account_id = account.id
    where session.token = ${sessionToken}
      and session.state = 'ACTIVE'
      and account.state = 'ACTIVE'
    limit 1
  `;

  return { accountName: account?.name ?? null };
};
