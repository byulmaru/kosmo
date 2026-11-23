import { withPrimaryDatabase } from '@kosmo/core/db';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
  instanceCursorSchema,
  instanceIdSchema,
  instanceStateSchema,
  listInstances,
  restoreInstance,
  suspendInstance,
} from '#lib/server/instances.js';
import type { Actions, PageServerLoad } from './$types';

const moderationReasonSchema = z
  .string()
  .refine((reason) => !reason.includes('\u0000'))
  .transform((reason) => reason.trim() || null)
  .nullable();

export const load: PageServerLoad = async ({ request, url }) => {
  const cursor = url.searchParams.get('cursor');
  const cursorValue = cursor ? instanceCursorSchema.safeParse(cursor) : undefined;
  const direction = url.searchParams.get('direction');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const rawState = url.searchParams.get('state');
  const state = rawState ? instanceStateSchema.safeParse(rawState) : undefined;

  if (
    (cursor && !cursorValue?.success) ||
    (direction && direction !== 'previous') ||
    (direction === 'previous' && !cursor) ||
    (rawState && !state?.success)
  ) {
    error(404, 'Not Found');
  }

  const selectedState = state?.success ? state.data : undefined;
  const options = {
    cursor: cursorValue?.success ? cursorValue.data : undefined,
    direction: direction === 'previous' ? 'previous' : 'next',
    q: q || undefined,
    state: selectedState,
  } as const;
  const page =
    request.method === 'POST'
      ? await withPrimaryDatabase(() => listInstances(options))
      : await listInstances(options);

  return {
    ...page,
    filters: {
      q,
      state: selectedState ?? '',
      cursor: cursor ?? '',
      direction: direction === 'previous' ? 'previous' : '',
    },
  };
};

export const actions = {
  suspend: async ({ request }) => {
    const formData = await request.formData();
    const id = instanceIdSchema.safeParse(formData.get('id'));

    if (!id.success) {
      error(404, 'Not Found');
    }

    const reason = moderationReasonSchema.safeParse(formData.get('reason'));
    if (!reason.success) {
      return fail(400, { moderationError: 'Invalid suspension reason.' });
    }

    if (!(await suspendInstance(id.data, reason.data))) {
      return fail(409, { moderationError: 'Instance state changed. Refresh and try again.' });
    }

    return { moderationSuccess: 'suspended' };
  },
  restore: async ({ request }) => {
    const id = instanceIdSchema.safeParse((await request.formData()).get('id'));

    if (!id.success) {
      error(404, 'Not Found');
    }

    if (!(await restoreInstance(id.data))) {
      return fail(409, { moderationError: 'Instance state changed. Refresh and try again.' });
    }

    return { moderationSuccess: 'restored' };
  },
} satisfies Actions;
