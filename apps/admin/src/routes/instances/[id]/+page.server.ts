import { withPrimaryDatabase } from '@kosmo/core/db';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
  getInstance,
  instanceIdSchema,
  restoreInstance,
  suspendInstance,
} from '#lib/server/instances.js';
import type { Actions, PageServerLoad } from './$types';

const moderationReasonSchema = z
  .string()
  .refine((reason) => !reason.includes('\u0000'))
  .transform((reason) => reason.trim() || null)
  .nullable();

export const load: PageServerLoad = async ({ params, request }) => {
  const id = instanceIdSchema.safeParse(params.id);

  if (!id.success) {
    error(404, 'Not Found');
  }

  const instance =
    request.method === 'POST'
      ? await withPrimaryDatabase(() => getInstance(id.data))
      : await getInstance(id.data);

  if (!instance) {
    error(404, 'Not Found');
  }

  return { instance };
};

export const actions = {
  suspend: async ({ params, request }) => {
    const id = instanceIdSchema.safeParse(params.id);

    if (!id.success) {
      error(404, 'Not Found');
    }

    const reason = moderationReasonSchema.safeParse((await request.formData()).get('reason'));
    if (!reason.success) {
      return fail(400, { moderationError: 'Invalid suspension reason.' });
    }

    if (!(await suspendInstance(id.data, reason.data))) {
      return fail(409, { moderationError: 'Instance state changed. Refresh and try again.' });
    }

    return { moderationSuccess: 'suspended' };
  },
  restore: async ({ params }) => {
    const id = instanceIdSchema.safeParse(params.id);

    if (!id.success) {
      error(404, 'Not Found');
    }

    if (!(await restoreInstance(id.data))) {
      return fail(409, { moderationError: 'Instance state changed. Refresh and try again.' });
    }

    return { moderationSuccess: 'restored' };
  },
} satisfies Actions;
