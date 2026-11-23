import { error } from '@sveltejs/kit';
import { instanceCursorSchema, instanceStateSchema, listInstances } from '#lib/server/instances.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
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
  const page = await listInstances({
    cursor: cursorValue?.success ? cursorValue.data : undefined,
    direction: direction === 'previous' ? 'previous' : 'next',
    q: q || undefined,
    state: selectedState,
  });

  return {
    ...page,
    filters: {
      q,
      state: selectedState ?? '',
    },
  };
};
