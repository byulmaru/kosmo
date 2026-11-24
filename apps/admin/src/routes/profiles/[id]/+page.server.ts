import { withPrimaryDatabase } from '@kosmo/core/db';
import { PostVisibility } from '@kosmo/core/enums';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
  getProfile,
  profileIdSchema,
  restoreProfile,
  suspendProfile,
  updateDefaultPostVisibility,
} from '#lib/server/profiles.js';
import type { Actions, PageServerLoad } from './$types';

const defaultPostVisibilitySchema = z.enum([
  PostVisibility.PUBLIC,
  PostVisibility.UNLISTED,
  PostVisibility.FOLLOWERS,
]);
const moderationReasonSchema = z
  .string()
  .refine((reason) => !reason.includes('\u0000'))
  .transform((reason) => reason.trim() || null)
  .nullable();

export const load: PageServerLoad = async ({ params, request }) => {
  const id = profileIdSchema.safeParse(params.id);

  if (!id.success) {
    error(404, 'Not Found');
  }

  const profile =
    request.method === 'POST'
      ? await withPrimaryDatabase(() => getProfile(id.data))
      : await getProfile(id.data);

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
  suspend: async ({ params, request }) => {
    const id = profileIdSchema.safeParse(params.id);

    if (!id.success) {
      error(404, 'Not Found');
    }

    const formData = await request.formData();
    const reason = moderationReasonSchema.safeParse(formData.get('reason'));

    if (!reason.success) {
      return fail(400, { moderationError: 'Invalid suspension reason.' });
    }

    if (!(await suspendProfile(id.data, reason.data))) {
      return fail(409, { moderationError: 'Profile state changed. Refresh and try again.' });
    }

    return { moderationSuccess: 'suspended' };
  },
  restore: async ({ params }) => {
    const id = profileIdSchema.safeParse(params.id);

    if (!id.success) {
      error(404, 'Not Found');
    }

    if (!(await restoreProfile(id.data))) {
      return fail(409, { moderationError: 'Profile state changed. Refresh and try again.' });
    }

    return { moderationSuccess: 'restored' };
  },
} satisfies Actions;
