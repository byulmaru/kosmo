import { error } from '@sveltejs/kit';
import { accountIdSchema, listAccounts } from '$lib/server/accounts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const cursor = url.searchParams.get('cursor');
  const direction = url.searchParams.get('direction');

  if (
    (cursor && !accountIdSchema.safeParse(cursor).success) ||
    (direction && direction !== 'previous') ||
    (direction === 'previous' && !cursor)
  ) {
    error(404, 'Not Found');
  }

  return listAccounts(cursor ?? undefined, direction === 'previous' ? 'previous' : 'next');
};
