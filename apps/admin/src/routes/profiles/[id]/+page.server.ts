import { error } from '@sveltejs/kit';
import { getProfile, profileIdSchema } from '#lib/server/profiles.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const id = profileIdSchema.safeParse(params.id);

  if (!id.success) {
    error(404, 'Not Found');
  }

  const profile = await getProfile(id.data);

  if (!profile) {
    error(404, 'Not Found');
  }

  return { profile };
};
