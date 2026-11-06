import { PostVisibility } from '@kosmo/core/enums';
import { error, fail } from '@sveltejs/kit';
import { getProfile, profileIdSchema, updateDefaultPostVisibility } from '#lib/server/profiles.js';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const defaultPostVisibilitySchema = z.enum([
  PostVisibility.PUBLIC,
  PostVisibility.UNLISTED,
  PostVisibility.FOLLOWERS,
]);

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

export const actions = {
  updateDefaultPostVisibility: async ({ params, request }) => {
    const id = profileIdSchema.safeParse(params.id);

    if (!id.success) {
      error(404, 'Not Found');
    }

    const visibility = defaultPostVisibilitySchema.safeParse(
      (await request.formData()).get('defaultPostVisibility'),
    );

    if (!visibility.success) {
      return fail(400, { error: 'Invalid default post visibility' });
    }

    if (!(await updateDefaultPostVisibility(id.data, visibility.data))) {
      error(404, 'Not Found');
    }

    return { success: true };
  },
} satisfies Actions;
