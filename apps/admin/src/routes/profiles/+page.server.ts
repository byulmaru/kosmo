import { error } from '@sveltejs/kit';
import {
  listProfiles,
  profileIdSchema,
  profileOriginSchema,
  profileStateSchema,
} from '$lib/server/profiles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const cursor = url.searchParams.get('cursor');
  const direction = url.searchParams.get('direction');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const rawOrigin = url.searchParams.get('origin');
  const rawState = url.searchParams.get('state');
  const origin = rawOrigin ? profileOriginSchema.safeParse(rawOrigin) : undefined;
  const state = rawState ? profileStateSchema.safeParse(rawState) : undefined;

  if (
    (cursor && !profileIdSchema.safeParse(cursor).success) ||
    (direction && direction !== 'previous') ||
    (direction === 'previous' && !cursor) ||
    (rawOrigin && !origin?.success) ||
    (rawState && !state?.success)
  ) {
    error(404, 'Not Found');
  }

  const selectedOrigin = origin?.success ? origin.data : undefined;
  const selectedState = state?.success ? state.data : undefined;
  const page = await listProfiles({
    cursor: cursor ?? undefined,
    direction: direction === 'previous' ? 'previous' : 'next',
    q: q || undefined,
    origin: selectedOrigin,
    state: selectedState,
  });

  return {
    ...page,
    filters: {
      q,
      origin: selectedOrigin ?? '',
      state: selectedState ?? '',
    },
  };
};
