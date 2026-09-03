import { error } from '@sveltejs/kit';
import { accountIdSchema, getAccount } from '$lib/server/accounts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const id = accountIdSchema.safeParse(params.id);

  if (!id.success) {
    error(404, 'Not Found');
  }

  const account = await getAccount(id.data);

  if (!account) {
    error(404, 'Not Found');
  }

  return { account };
};
