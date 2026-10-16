import { error } from '@sveltejs/kit';
import { getProfileSummary, listProfilePosts, profileIdSchema } from '$lib/server/profiles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const id = profileIdSchema.safeParse(params.id);

  if (!id.success) {
    error(404, 'Not Found');
  }

  const cursor = url.searchParams.get('cursor');
  const direction = url.searchParams.get('direction');
  if (
    (cursor && !profileIdSchema.safeParse(cursor).success) ||
    (direction && direction !== 'previous') ||
    (direction === 'previous' && !cursor)
  ) {
    error(404, 'Not Found');
  }

  const profile = await getProfileSummary(id.data);

  if (!profile) {
    error(404, 'Not Found');
  }

  const page = await listProfilePosts(id.data, {
    cursor: cursor ?? undefined,
    direction: direction === 'previous' ? 'previous' : 'next',
  });

  return { profile, ...page };
};
